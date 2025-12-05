output "ec2_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.builder_playground.public_ip
}

output "ec2_public_dns" {
  description = "Public DNS name of the EC2 instance"
  value       = aws_instance.builder_playground.public_dns
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ec2-user@${aws_instance.builder_playground.public_ip}"
}

output "flashblocks_rpc_image" {
  description = "Docker image being used for flashblocks-rpc"
  value       = var.flashblocks_rpc_image
}

output "run_devnet_command" {
  description = "Command to run on EC2 instance to start the devnet"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ec2-user@${aws_instance.builder_playground.public_ip} '/home/ec2-user/run-devnet.sh'"
}

