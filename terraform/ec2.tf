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

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

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

# Set Go environment variables
export GOPATH=/home/ec2-user/go
export GOMODCACHE=/home/ec2-user/go/pkg/mod

# Pull the latest images
docker pull ${var.flashblocks_rpc_image}
docker pull flashbots/flashblocks-websocket-proxy:latest

# Run the cook command
go run main.go cook opstack \\
  --external-builder=op-rbuilder \\
  --flashblocks \\
  --enable-websocket-proxy \\
  --override flashblocks-rpc=${var.flashblocks_rpc_image} \\
  --override websocket-proxy=flashbots/flashblocks-websocket-proxy:latest
SCRIPT

chmod +x /home/ec2-user/run-devnet.sh
chown ec2-user:ec2-user /home/ec2-user/run-devnet.sh

# Wait a bit for everything to be ready, then start the devnet as a daemon
sleep 10

# Start the devnet as a proper background daemon with nohup
nohup sudo -u ec2-user bash -c 'cd /home/ec2-user/builder-playground && export GOPATH=/home/ec2-user/go && export GOMODCACHE=/home/ec2-user/go/pkg/mod && go run main.go cook opstack --external-builder=op-rbuilder --flashblocks --enable-websocket-proxy --override flashblocks-rpc=0xrampey/flashblocks-rpc:latest --override websocket-proxy=flashbots/flashblocks-websocket-proxy:latest' > /home/ec2-user/devnet.log 2>&1 &

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
}

