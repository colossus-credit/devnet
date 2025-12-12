variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS profile to use (for SSO or named profiles)"
  type        = string
  default     = "default"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.xlarge"
}

variable "flashblocks_rpc_image" {
  description = "Docker image for flashblocks-rpc (Docker Hub or ECR)"
  type        = string
  default     = "0xrampey/flashblocks-rpc:latest"
}

variable "builder_playground_repo" {
  description = "GitHub repository URL for builder-playground (or local path if using S3/CodeCommit)"
  type        = string
  default     = "https://github.com/flashbots/builder-playground.git"
}

variable "builder_playground_branch" {
  description = "Git branch or tag to use for builder-playground"
  type        = string
  default     = "main"
}

variable "use_spot_instance" {
  description = "Whether to use a spot instance (much cheaper but can be interrupted)"
  type        = bool
  default     = true
}

variable "spot_max_price" {
  description = "Maximum price per hour for spot instance (leave empty for on-demand price)"
  type        = string
  default     = "" # Empty means use on-demand price as max
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed for SSH access (your IP)"
  type        = string
  default     = "0.0.0.0/0" # Change this to your IP for security
}

# CloudWatch Monitoring variables
variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and alarms"
  type        = bool
  default     = true
}

variable "cpu_alarm_threshold" {
  description = "CPU utilization threshold (%) for alarm"
  type        = number
  default     = 80
}

variable "memory_alarm_threshold" {
  description = "Memory utilization threshold (%) for alarm"
  type        = number
  default     = 85
}

variable "disk_alarm_threshold" {
  description = "Disk utilization threshold (%) for alarm"
  type        = number
  default     = 80
}

variable "telegram_bot_token" {
  description = "Telegram bot token from @BotFather"
  type        = string
  sensitive   = true
}

variable "telegram_chat_id" {
  description = "Telegram chat ID for receiving alerts"
  type        = string
  sensitive   = true
}
