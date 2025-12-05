# Builder-Playground Devnet on AWS

Terraform configuration to deploy builder-playground opstack recipe on AWS EC2 using Docker Hub images.

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform installed (>= 1.0)
3. AWS EC2 Key Pair created for SSH access

## Setup

### 1. Configure Variables

Create a `terraform.tfvars` file:

```hcl
aws_region        = "us-east-1"
instance_type     = "t3.xlarge"
key_pair_name     = "your-key-pair-name"
allowed_cidr      = "YOUR_IP/32"  # Your IP for SSH access
use_spot_instance = true  # Use spot instances (60-70% cheaper, can be interrupted)
spot_max_price    = ""  # Empty = use on-demand price as max, or set custom max (e.g., "0.10")
flashblocks_rpc_image = "0xrampey/flashblocks-rpc:latest"  # Docker Hub image (default)
```

### 2. Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply
```

### 3. Devnet Starts Automatically

The devnet will start automatically after the EC2 instance is provisioned. No manual steps required!

The devnet runs in the background and logs are available at `/home/ec2-user/devnet.log` on the instance.

To check status or view logs, SSH into the instance:

```bash
# SSH into the instance (use output from terraform)
ssh -i ~/.ssh/<key-pair>.pem ec2-user@<public-ip>

# View devnet logs
tail -f /home/ec2-user/devnet.log

# Check if devnet is running
ps aux | grep "go run main.go"
```

## What Terraform Does Automatically

Terraform will automatically:
- Create EC2 instance with Docker installed
- Configure security group (ports 22 for SSH, 8550 for Flashblocks RPC)
- Set up IAM role for EC2
- Install Go, Git, and other dependencies
- Clone builder-playground repository
- Pull Docker images from Docker Hub
- Create the run script with all overrides

## What You Need to Do Manually

1. **Create EC2 Key Pair** (if you don't have one):
   ```bash
   aws ec2 create-key-pair --key-name your-key-name --query 'KeyMaterial' --output text > ~/.ssh/your-key-name.pem
   chmod 400 ~/.ssh/your-key-name.pem
   ```

2. **Create terraform.tfvars** with your configuration (see Setup section)

3. **Run Terraform**:
   ```bash
   cd devnet
   terraform init
   terraform apply
   ```

4. **SSH into instance and start devnet** (after Terraform completes)

That's it! Everything else is automated.

## Accessing Services

Once the devnet is running, the Flashblocks RPC will be accessible on:

- Flashblocks RPC: `http://<public-ip>:8550`

Note: Only port 8550 is exposed externally. Other services run internally on the EC2 instance.

## Updating Docker Images

When you update the Docker images on Docker Hub:

1. SSH into the EC2 instance
2. Pull the new images: `docker pull 0xrampey/flashblocks-rpc:latest` and `docker pull flashbots/flashblocks-websocket-proxy:latest`
3. Restart the devnet: `/home/ec2-user/run-devnet.sh`

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

## Spot Instances

Spot instances are enabled by default and can save 60-70% compared to on-demand pricing. However:

If you need guaranteed availability, set `use_spot_instance = false` in `terraform.tfvars`.


