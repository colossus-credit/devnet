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

# CloudWatch Monitoring Outputs
output "sns_topic_arn" {
  description = "ARN of SNS topic for CloudWatch alarms"
  value       = try(aws_sns_topic.builder_playground_alerts.arn, null)
}

output "lambda_function_name" {
  description = "Name of Lambda function for Telegram notifications"
  value       = aws_lambda_function.cloudwatch_to_telegram.function_name
}

output "cpu_alarm_name" {
  description = "Name of CPU utilization alarm"
  value       = try(aws_cloudwatch_metric_alarm.cpu_utilization[0].alarm_name, null)
}

output "memory_alarm_name" {
  description = "Name of memory utilization alarm"
  value       = try(aws_cloudwatch_metric_alarm.memory_utilization[0].alarm_name, null)
}

output "disk_alarm_name" {
  description = "Name of disk utilization alarm"
  value       = try(aws_cloudwatch_metric_alarm.disk_utilization[0].alarm_name, null)
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch Logs group for devnet logs"
  value       = try(aws_cloudwatch_log_group.devnet_logs[0].name, null)
}

output "monitoring_status" {
  description = "Whether CloudWatch monitoring is enabled"
  value       = var.enable_monitoring
}
