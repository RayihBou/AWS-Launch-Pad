import json
import boto3
from datetime import datetime, timedelta

cloudwatch = boto3.client("cloudwatch")
logs = boto3.client("logs")

WRITE_ACTIONS = {"/create_alarm", "/enable_logging"}


def get_manual_guide(api_path):
    guides = {
        "/create_alarm": {
            "message": "Your current role (Viewer) does not have permission to create alarms.",
            "console_steps": [
                "Open the CloudWatch console at https://console.aws.amazon.com/cloudwatch/",
                "In the navigation pane, choose Alarms > All alarms",
                "Choose Create alarm",
                "Choose Select metric and configure your metric",
                "Set the threshold conditions",
                "Configure notification actions (SNS topic)",
                "Name the alarm and create it",
            ],
            "cli_command": "aws cloudwatch put-metric-alarm --alarm-name 'MyAlarm' --metric-name CPUUtilization --namespace AWS/EC2 --statistic Average --period 300 --threshold 80 --comparison-operator GreaterThanThreshold --evaluation-periods 2 --alarm-actions <SNS_TOPIC_ARN>",
        },
        "/enable_logging": {
            "message": "Your current role (Viewer) does not have permission to enable logging.",
            "console_steps": [
                "Open the CloudWatch console at https://console.aws.amazon.com/cloudwatch/",
                "In the navigation pane, choose Log groups",
                "Choose Create log group",
                "Enter a name and configure retention settings",
                "Choose Create",
            ],
            "cli_command": "aws logs create-log-group --log-group-name '/my-app/logs' && aws logs put-retention-policy --log-group-name '/my-app/logs' --retention-in-days 30",
        },
    }
    return guides.get(api_path, {
        "message": "Your current role (Viewer) does not have permission for this action.",
        "console_steps": ["Contact your administrator to request Operator access."],
        "cli_command": "N/A",
    })


def make_response(action, api_path, result, status=200):
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": action,
            "apiPath": api_path,
            "httpMethod": "GET",
            "httpStatusCode": status,
            "responseBody": {
                "application/json": {"body": json.dumps(result, default=str)}
            },
        },
    }


def handler(event, context):
    action = event.get("actionGroup")
    api_path = event.get("apiPath")
    parameters = {p["name"]: p["value"] for p in event.get("parameters", [])}
    user_role = event.get("sessionAttributes", {}).get("userRole", "Viewer")

    # Block write actions for non-Operator roles
    if api_path in WRITE_ACTIONS and user_role != "Operator":
        return make_response(action, api_path, get_manual_guide(api_path), 403)

    routes = {
        "/get_metrics": get_metrics,
        "/list_alarms": list_alarms,
        "/get_log_events": get_log_events,
        "/list_log_groups": list_log_groups,
    }

    fn = routes.get(api_path)
    result = fn(parameters) if fn else {"error": f"Unknown apiPath: {api_path}"}

    return make_response(action, api_path, result)


def get_metrics(params):
    now = datetime.utcnow()
    start = now - timedelta(hours=1)
    namespace = params.get("namespace", "AWS/Lambda")
    metric_name = params.get("metric_name", "Invocations")

    # Build dimensions from comma-separated "Name=Value" pairs
    dimensions = []
    if "dimensions" in params:
        for dim in params["dimensions"].split(","):
            parts = dim.strip().split("=")
            if len(parts) == 2:
                dimensions.append({"Name": parts[0], "Value": parts[1]})

    response = cloudwatch.get_metric_data(
        MetricDataQueries=[
            {
                "Id": "m1",
                "MetricStat": {
                    "Metric": {
                        "Namespace": namespace,
                        "MetricName": metric_name,
                        "Dimensions": dimensions,
                    },
                    "Period": 300,
                    "Stat": params.get("stat", "Sum"),
                },
            }
        ],
        StartTime=start,
        EndTime=now,
    )

    results = response["MetricDataResults"][0]
    return {
        "metric": metric_name,
        "namespace": namespace,
        "timestamps": results["Timestamps"],
        "values": results["Values"],
    }


def list_alarms(params):
    kwargs = {}
    if "state" in params:
        kwargs["StateValue"] = params["state"]

    response = cloudwatch.describe_alarms(**kwargs)
    return [
        {
            "name": a["AlarmName"],
            "state": a["StateValue"],
            "metric": a.get("MetricName", "N/A"),
            "namespace": a.get("Namespace", "N/A"),
        }
        for a in response.get("MetricAlarms", [])
    ]


def get_log_events(params):
    log_group = params.get("log_group")
    if not log_group:
        return {"error": "log_group parameter is required"}

    now = int(datetime.utcnow().timestamp() * 1000)
    start = now - (30 * 60 * 1000)  # Last 30 minutes

    response = logs.filter_log_events(
        logGroupName=log_group,
        startTime=start,
        endTime=now,
        limit=50,
    )

    return [
        {"timestamp": e["timestamp"], "message": e["message"]}
        for e in response.get("events", [])
    ]


def list_log_groups(params):
    kwargs = {}
    if "prefix" in params:
        kwargs["logGroupNamePrefix"] = params["prefix"]

    response = logs.describe_log_groups(**kwargs)
    return [
        {"name": g["logGroupName"], "storedBytes": g.get("storedBytes", 0)}
        for g in response.get("logGroups", [])
    ]
