resource "aws_security_group" "builder_playground" {
  name        = "builder-playground-sg"
  description = "Security group for builder-playground devnet"

  # SSH access
  ingress {
    description = "SSH from allowed CIDR"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  # Flashblocks RPC endpoint
  ingress {
    description = "Flashblocks RPC (port 8550)"
    from_port   = 8550
    to_port     = 8550
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  # All outbound traffic
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "builder-playground-sg"
  }
}

