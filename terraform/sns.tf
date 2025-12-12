# SNS Topic for CloudWatch alarms
resource "aws_sns_topic" "builder_playground_alerts" {
  name              = "builder-playground-alerts"
  kms_master_key_id = "alias/aws/sns"
}

# SNS Topic policy to allow CloudWatch to publish
resource "aws_sns_topic_policy" "builder_playground_alerts_policy" {
  arn = aws_sns_topic.builder_playground_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.builder_playground_alerts.arn
      }
    ]
  })
}

# Lambda permission to receive SNS messages
resource "aws_lambda_permission" "allow_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cloudwatch_to_telegram.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.builder_playground_alerts.arn
}

# SNS subscription linking topic to Lambda function
resource "aws_sns_topic_subscription" "builder_playground_alerts_lambda" {
  topic_arn            = aws_sns_topic.builder_playground_alerts.arn
  protocol             = "lambda"
  endpoint             = aws_lambda_function.cloudwatch_to_telegram.arn
  depends_on           = [aws_lambda_permission.allow_sns]
}
