data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
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
yum install -y golang git make

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

# Build the Go binary (optional, can also use go run)
go mod download

# Create a script to run the cook command
cat > /home/ec2-user/run-devnet.sh <<SCRIPT
#!/bin/bash
cd /home/ec2-user/builder-playground

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

# Wait a bit for everything to be ready, then start the devnet automatically
# Run as ec2-user in the background and log output
cat > /home/ec2-user/start-devnet.sh <<'STARTSCRIPT'
#!/bin/bash
sleep 10  # Wait for any final setup
cd /home/ec2-user
sudo -u ec2-user /home/ec2-user/run-devnet.sh > /home/ec2-user/devnet.log 2>&1 &
echo $! > /home/ec2-user/devnet.pid
echo "Devnet started in background. PID: $(cat /home/ec2-user/devnet.pid)"
echo "Check logs: tail -f /home/ec2-user/devnet.log"
STARTSCRIPT

chmod +x /home/ec2-user/start-devnet.sh
chown ec2-user:ec2-user /home/ec2-user/start-devnet.sh

# Start the devnet automatically
su - ec2-user -c '/home/ec2-user/start-devnet.sh' || {
  # If su fails, try running directly
  cd /home/ec2-user
  sudo -u ec2-user bash -c '/home/ec2-user/start-devnet.sh' &
}

# Log completion
echo "Setup complete! Devnet is starting automatically." >> /var/log/user-data.log
echo "Check status: tail -f /home/ec2-user/devnet.log" >> /var/log/user-data.log
EOF
}

resource "aws_instance" "builder_playground" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
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

