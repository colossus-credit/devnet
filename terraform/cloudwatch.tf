# CloudWatch Log Group for devnet logs
resource "aws_cloudwatch_log_group" "devnet_logs" {
  count             = var.enable_monitoring ? 1 : 0
  name              = "/aws/ec2/builder-playground/devnet"
  retention_in_days = 7

  tags = {
    Name = "builder-playground-devnet-logs"
  }
}

# CPU Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  count               = var.enable_monitoring ? 1 : 0
  alarm_name          = "builder-playground-cpu-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold
  alarm_description   = "Alert when CPU exceeds ${var.cpu_alarm_threshold}%"
  alarm_actions       = [aws_sns_topic.builder_playground_alerts.arn]

  dimensions = {
    InstanceId = aws_instance.builder_playground.id
  }

  tags = {
    Name = "builder-playground-cpu"
  }
}

# Memory Usage Alarm (Custom metric from CloudWatch Agent)
resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  count               = var.enable_monitoring ? 1 : 0
  alarm_name          = "builder-playground-memory-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "DevnetMonitoring"
  period              = 60
  statistic           = "Average"
  threshold           = var.memory_alarm_threshold
  alarm_description   = "Alert when memory exceeds ${var.memory_alarm_threshold}%"
  alarm_actions       = [aws_sns_topic.builder_playground_alerts.arn]

  dimensions = {
    InstanceId   = aws_instance.builder_playground.id
    InstanceType = aws_instance.builder_playground.instance_type
  }

  tags = {
    Name = "builder-playground-memory"
  }
}

# Disk Usage Alarm (Custom metric from CloudWatch Agent)
resource "aws_cloudwatch_metric_alarm" "disk_utilization" {
  count               = var.enable_monitoring ? 1 : 0
  alarm_name          = "builder-playground-disk-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DiskUtilization"
  namespace           = "DevnetMonitoring"
  period              = 60
  statistic           = "Average"
  threshold           = var.disk_alarm_threshold
  alarm_description   = "Alert when disk usage exceeds ${var.disk_alarm_threshold}%"
  alarm_actions       = [aws_sns_topic.builder_playground_alerts.arn]

  dimensions = {
    InstanceId   = aws_instance.builder_playground.id
    path         = "/"
    InstanceType = aws_instance.builder_playground.instance_type
    device       = "nvme0n1p1"
    fstype       = "xfs"
  }

  tags = {
    Name = "builder-playground-disk"
  }
}
