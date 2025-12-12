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

# CloudWatch Agent permissions for EC2 instance
resource "aws_iam_role_policy" "cloudwatch_policy" {
  name = "builder-playground-cloudwatch-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "ec2messages:AcknowledgeMessage",
          "ec2messages:GetMessages",
          "ssm:UpdateInstanceInformation",
          "logs:PutLogEvents",
          "logs:CreateLogStream",
          "logs:CreateLogGroup"
        ]
        Resource = "*"
      }
    ]
  })
}


resource "aws_iam_instance_profile" "ec2_profile" {
  name = "builder-playground-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

