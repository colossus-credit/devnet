output "ec2_public_ip" {
  description = "Static Elastic IP address of the EC2 instance"
  value       = aws_eip.builder_playground.public_ip
}

output "ec2_public_dns" {
  description = "Public DNS name of the EC2 instance (Elastic IP)"
  value       = aws_eip.builder_playground.public_dns
}

output "flashblocks_rpc_image" {
  description = "Docker image being used for flashblocks-rpc"
  value       = var.flashblocks_rpc_image
}

