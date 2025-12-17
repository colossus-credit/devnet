data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  
  # Pin to current AMI to prevent unwanted instance replacements
  # Update this when you intentionally want to use a newer AMI
  filter {
    name   = "image-id"
    values = ["ami-08fa3ed5577079e64"]
  }
}

locals {
  user_data = <<-EOF
#!/bin/bash
set -e

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose v2 as a plugin (required by cook)
mkdir -p /usr/libexec/docker/cli-plugins
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# Install Go (for building/running builder-playground)
yum install -y golang git make gcc gcc-c++ libstdc++-devel

# Pull the flashblocks-rpc image from Docker Hub
docker pull ${var.flashblocks_rpc_image} || echo "Failed to pull image, will retry later"

# Clone builder-playground repository
cd /home/ec2-user
if [ ! -d "builder-playground" ]; then
  git clone ${var.builder_playground_repo} builder-playground
fi
cd builder-playground
git checkout ${var.builder_playground_branch}
git pull

# Set Go environment variables
export GOPATH=/home/ec2-user/go
export GOMODCACHE=/home/ec2-user/go/pkg/mod
mkdir -p $GOPATH/pkg/mod

# Build the Go binary (optional, can also use go run)
go mod download

# Create a script to run the cook command
cat > /home/ec2-user/run-devnet.sh <<SCRIPT
#!/bin/bash
cd /home/ec2-user/builder-playground

# Clean up old devnet data (may have root-owned files from Docker)
sudo rm -rf /home/ec2-user/.playground/devnet

# Set Go environment variables
export GOPATH=/home/ec2-user/go
export GOMODCACHE=/home/ec2-user/go/pkg/mod

# Pull latest images
docker pull ${var.flashblocks_rpc_image}
docker pull flashbots/flashblocks-websocket-proxy:latest

# Run the cook command
go run main.go cook opstack --base-overlay \\
  --external-builder=op-rbuilder \\
  --block-time 1 \\
  --flashblocks \\
  --flashblocks-block-time 100 \\
  --enable-websocket-proxy \\
  --bind-external \\
  --override flashblocks-rpc=${var.flashblocks_rpc_image} \\
  --override websocket-proxy=flashbots/flashblocks-websocket-proxy:latest
SCRIPT

chmod +x /home/ec2-user/run-devnet.sh
chown ec2-user:ec2-user /home/ec2-user/run-devnet.sh

# Install and configure CloudWatch Agent
if [ "${var.enable_monitoring}" = "true" ]; then
  # Download CloudWatch Agent (using curl instead of wget - wget not installed by default on AL2023)
  curl -L https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm -o /tmp/amazon-cloudwatch-agent.rpm
  rpm -U /tmp/amazon-cloudwatch-agent.rpm

  # Create CloudWatch Agent configuration
  cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json <<'CWCONFIG'
{
  "agent": {
    "metrics_collection_interval": 60,
    "region": "${var.aws_region}"
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/devnet.log",
            "log_group_name": "/aws/ec2/builder-playground/devnet",
            "log_stream_name": "devnet.log"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "DevnetMonitoring",
    "append_dimensions": {
      "InstanceId": "$${aws:InstanceId}",
      "InstanceType": "$${aws:InstanceType}"
    },
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          },
          {
            "name": "cpu_usage_iowait",
            "rename": "CPU_IOWAIT",
            "unit": "Percent"
          },
          "cpu_time_guest"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ],
        "totalcpu": false
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DiskUtilization",
            "unit": "Percent"
          },
          {
            "name": "inodes_free",
            "rename": "DiskInodesFree",
            "unit": "Count"
          }
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "/"
        ]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MemoryUtilization",
            "unit": "Percent"
          },
          {
            "name": "mem_available",
            "rename": "MemoryAvailable",
            "unit": "Megabytes"
          },
          {
            "name": "mem_used",
            "rename": "MemoryUsed",
            "unit": "Megabytes"
          }
        ],
        "metrics_collection_interval": 60
      }
    }
  }
}
CWCONFIG

  # Start CloudWatch Agent
  /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json

  # Enable CloudWatch Agent to start on boot
  systemctl enable amazon-cloudwatch-agent
fi

# Wait a bit for everything to be ready, then start the devnet as a daemon
sleep 10

# Create log file with proper permissions before starting devnet
touch /home/ec2-user/devnet.log
chown ec2-user:ec2-user /home/ec2-user/devnet.log

# Start the devnet as a proper background daemon with nohup using the script
nohup sudo -u ec2-user /home/ec2-user/run-devnet.sh > /home/ec2-user/devnet.log 2>&1 &

# Give it time to start and stabilize
sleep 5

# Capture the actual go process PID
ps aux | grep 'go run main.go' | grep -v grep | awk '{print $2}' > /home/ec2-user/devnet.pid

# Log completion
echo "Setup complete! Devnet daemon started with PID: $(cat /home/ec2-user/devnet.pid 2>/dev/null || echo 'unknown')" >> /var/log/user-data.log
echo "View logs: tail -f /home/ec2-user/devnet.log" >> /var/log/user-data.log
EOF
}

resource "aws_instance" "builder_playground" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = data.aws_key_pair.devnet.key_name
  vpc_security_group_ids = [aws_security_group.builder_playground.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  user_data = local.user_data
  user_data_replace_on_change = false  # Prevent instance replacement when user_data changes

  # Spot instance configuration
  dynamic "instance_market_options" {
    for_each = var.use_spot_instance ? [1] : []
    content {
      market_type = "spot"
      spot_options {
        max_price = var.spot_max_price != "" ? var.spot_max_price : null
        spot_instance_type = "persistent" # Restart if interrupted
        instance_interruption_behavior = "stop" # Stop (not terminate) if interrupted
      }
    }
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 100 # GB - adjust based on blockchain data needs
    encrypted   = true
  }

  tags = {
    Name = "builder-playground-devnet"
  }

  # Prevent Terraform from stopping/restarting spot instances to update user_data
  lifecycle {
    ignore_changes = [user_data]
    # Force replacement when switching between spot and on-demand instances
    # (AWS doesn't allow changing instance market type in-place)
    # Uses null_resource as a workaround since replace_triggered_by can't reference variables directly
    replace_triggered_by = [null_resource.instance_market_type_trigger.id]
  }
}

# Workaround: null_resource to trigger replacement when use_spot_instance changes
# replace_triggered_by can only reference resources, not variables directly
resource "null_resource" "instance_market_type_trigger" {
  triggers = {
    use_spot_instance = var.use_spot_instance
  }
}

# Elastic IP for static public IP address
# This IP will persist even if the instance is recreated
resource "aws_eip" "builder_playground" {
  domain = "vpc"
  
  lifecycle {
    # Prevent accidental deletion of the Elastic IP
    prevent_destroy = true
  }
  
  tags = {
    Name = "builder-playground-devnet-eip"
  }
}

# Associate Elastic IP with the instance
# This association will automatically update if the instance is recreated
resource "aws_eip_association" "builder_playground" {
  instance_id   = aws_instance.builder_playground.id
  allocation_id = aws_eip.builder_playground.id
  
  # Ensure association happens after instance is created
  depends_on = [aws_instance.builder_playground]
}

