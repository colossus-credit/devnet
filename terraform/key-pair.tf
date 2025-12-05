resource "tls_private_key" "devnet" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "devnet" {
  key_name   = "builder-playground"
  public_key = tls_private_key.devnet.public_key_openssh
}

resource "local_sensitive_file" "private_key" {
  filename        = pathexpand("~/.ssh/builder-playground.pem")
  content         = tls_private_key.devnet.private_key_pem
  file_permission = "0400"
}

output "private_key_path" {
  value       = local_sensitive_file.private_key.filename
  description = "Path to the private key file"
}
