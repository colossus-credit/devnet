# OP stack with Flashblocks Devnet on AWS

Terraform configuration to deploy OP stack with Flashblocks recipe on AWS EC2 using Docker Hub images.

## Prerequisites

1. AWS CLI configured with appropriate credentials

```bash
brew install awscli
aws login
eval $(aws configure export-credentials --format env)
```

2. Terraform installed (>= 1.0)
```bash
brew install terraform
```

## Setup

### 1. Configure Variables

Create a `terraform.tfvars` file:

```hcl
aws_region        = "us-east-1"
instance_type     = "t3.xlarge"
use_spot_instance = true  # Use spot instances (60-70% cheaper, can be interrupted)
spot_max_price    = ""  # Empty = use on-demand price as max, or set custom max (e.g., "0.10")
flashblocks_rpc_image = "0xrampey/flashblocks-rpc:latest"  # Docker Hub image (default)
allowed_ssh_cidr  = "YOUR_IP/32"  # Your public IP for SSH access
```

#### SSH Key Pair

Terraform automatically generates an SSH key pair:
- **Private key:** `~/.ssh/builder-playground.pem` (mode 0400)
- **Public key:** Deployed to EC2 instance
- Used for SSH access to the instance

### 2. Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply
```

### 3. Devnet Starts Automatically as a Daemon

The devnet starts automatically after EC2 provisioning and runs as a background daemon using `nohup`

#### Monitoring the Devnet

Once connected via SSH:

```bash
# Check if daemon is running
ps aux | grep "go run main.go" | grep -v grep

# View live logs
tail -f /home/ec2-user/devnet.log

# Check Docker containers
docker ps

# Verify flashblocks-rpc container and ports
docker ps | grep flashblocks-rpc
# Should show: 0.0.0.0:8550->8545/tcp
```


## Accessing Services

Once the devnet is running, the Flashblocks RPC will be accessible on:

- Flashblocks RPC: `http://<public-ip>:8550`

Note: Only port 8550 is exposed externally. Other services run internally on the EC2 instance.

## Updating Docker Images

When you update the Docker images on Docker Hub:

1. SSH into the EC2 instance
2. Pull the new images: `docker pull 0xrampey/flashblocks-rpc:latest`
3. Restart the devnet: `/home/ec2-user/run-devnet.sh`

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

## Troubleshooting

### Devnet Not Starting

Check the cloud-init logs:
```bash
sudo tail -100 /var/log/cloud-init-output.log
```

Check devnet logs:
```bash
tail -100 /home/ec2-user/devnet.log
```

### Docker Compose Version Issues

The user data script installs Docker Compose v2.23.0 as a plugin to avoid compatibility issues with v5.0.0+.

If you see errors like `unknown shorthand flag: 'f' in -f`, the Docker Compose version is incompatible.

Verify version:
```bash
docker compose version  # Should show: v2.23.0
```

## Spot Instances

Spot instances are enabled by default and can save 60-70% compared to on-demand pricing. However:

If you need guaranteed availability, set `use_spot_instance = false` in `terraform.tfvars`.


