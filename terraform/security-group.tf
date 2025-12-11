resource "aws_security_group" "builder_playground" {
  name        = "builder-playground-sg"
  description = "Security group for builder-playground devnet"

  # SSH access
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # Flashblocks RPC endpoint
  ingress {
    description = "Flashblocks RPC (port 8550)"
    from_port   = 8550
    to_port     = 8550
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

 # op-rbuilder Sequencer endpoint
  ingress {
    description = "op-rbuilder Sequencer (port 8549)"
    from_port   = 8549
    to_port     = 8549
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

   # op-geth Sequencer endpoint
  ingress {
    description = "op-geth Sequencer (port 8547)"
    from_port   = 8547
    to_port     = 8547
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
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

