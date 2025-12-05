data "aws_caller_identity" "current" {}

resource "aws_iam_role" "ec2_role" {
  name = "builder-playground-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}


resource "aws_iam_instance_profile" "ec2_profile" {
  name = "builder-playground-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

