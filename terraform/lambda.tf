# IAM Role for Lambda function
resource "aws_iam_role" "lambda_role" {
  name = "builder-playground-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_role.name
}

# Write Lambda code to a file
resource "local_file" "lambda_code" {
  content = <<-EOT
import json
import urllib3
import os

http = urllib3.PoolManager()

def lambda_handler(event, context):
    """
    Lambda handler for CloudWatch alarms -> Telegram notifications
    """
    try:
        # Parse SNS message
        message = json.loads(event['Records'][0]['Sns']['Message'])

        # Extract alarm details
        alarm_name = message.get('AlarmName', 'Unknown')
        new_state = message.get('NewStateValue', 'UNKNOWN')
        reason = message.get('NewStateReason', '')

        # Color code based on state
        state_emoji = {
            'ALARM': '🔴',
            'OK': '🟢',
            'INSUFFICIENT_DATA': '🟡'
        }.get(new_state, '⚪')

        # Format Telegram message
        telegram_message = f"""{state_emoji} **{alarm_name}**
State: {new_state}
Reason: {reason}"""

        # Send to Telegram
        bot_token = os.environ['TELEGRAM_BOT_TOKEN']
        chat_id = os.environ['TELEGRAM_CHAT_ID']

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        headers = {"Content-Type": "application/json"}
        body = {
            "chat_id": chat_id,
            "text": telegram_message,
            "parse_mode": "Markdown"
        }

        response = http.request('POST', url, body=json.dumps(body), headers=headers)

        if response.status == 200:
            return {
                'statusCode': 200,
                'body': json.dumps('Message sent successfully')
            }
        else:
            return {
                'statusCode': response.status,
                'body': json.dumps(f'Failed to send message: {response.data}')
            }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error: {str(e)}')
        }
EOT

  filename = "${path.module}/lambda_index.py"
}

# Create the Lambda deployment package
data "archive_file" "lambda_function" {
  type        = "zip"
  output_path = "${path.module}/lambda_function.zip"
  source_file = local_file.lambda_code.filename
  depends_on  = [local_file.lambda_code]
}

# Lambda function to forward CloudWatch alarms to Telegram
resource "aws_lambda_function" "cloudwatch_to_telegram" {
  filename         = data.archive_file.lambda_function.output_path
  function_name    = "cloudwatch-to-telegram"
  role             = aws_iam_role.lambda_role.arn
  handler          = "lambda_index.lambda_handler"
  runtime          = "python3.12"
  source_code_hash = data.archive_file.lambda_function.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      TELEGRAM_BOT_TOKEN = var.telegram_bot_token
      TELEGRAM_CHAT_ID   = var.telegram_chat_id
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    data.archive_file.lambda_function
  ]
}
