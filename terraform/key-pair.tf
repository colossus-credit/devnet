# Reference the existing key pair instead of managing it
data "aws_key_pair" "devnet" {
  key_name = "builder-playground"
}

# Output the private key path (file already exists locally)
output "private_key_path" {
  value       = pathexpand("~/.ssh/builder-playground.pem")
  description = "Path to the private key file"
}
