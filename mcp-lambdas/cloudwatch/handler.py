import json
import boto3
from datetime import datetime, timedelta

cw = boto3.client('cloudwatch')
logs = boto3.client('logs')


def _ser(obj):
    if isinstance(obj, datetime): return obj.isoformat()
    raise TypeError(f"Not serializable: {type(obj)}")


def _describe_alarms(params):
    kwargs = {'MaxRecords': params.get('max_records', 50)}
    if 'state' in params:
        kwargs['StateValue'] = params['state']
    r = cw.describe_alarms(**kwargs)
    return [{'Name': a['AlarmName'], 'State': a['StateValue'], 'Metric': a.get('MetricName', '-'), 'Namespace': a.get('Namespace', '-')} for a in r['MetricAlarms']]


def _get_metric_statistics(params):
    hours = int(params.get('hours', 1))
    end = datetime.utcnow()
    start = end - timedelta(hours=hours)
    kwargs = {'Namespace': params['namespace'], 'MetricName': params['metric_name'],
        'StartTime': start, 'EndTime': end, 'Period': 300, 'Statistics': ['Average', 'Maximum', 'Minimum']}
    if params.get('dimension_name') and params.get('dimension_value'):
        kwargs['Dimensions'] = [{'Name': params['dimension_name'], 'Value': params['dimension_value']}]
    r = cw.get_metric_statistics(**kwargs)
    return sorted([{'Time': p['Timestamp'].isoformat(), 'Avg': round(p.get('Average', 0), 2), 'Max': round(p.get('Maximum', 0), 2)} for p in r['Datapoints']], key=lambda x: x['Time'])


def _list_log_groups(params):
    kwargs = {'limit': params.get('limit', 20)}
    if 'prefix' in params:
        kwargs['logGroupNamePrefix'] = params['prefix']
    r = logs.describe_log_groups(**kwargs)
    return [{'Name': g['logGroupName'], 'StoredBytes': g.get('storedBytes', 0)} for g in r['logGroups']]


TOOLS = {
    'describe_alarms': _describe_alarms,
    'get_metric_statistics': _get_metric_statistics,
    'list_log_groups': _list_log_groups,
}


def handler(event, context):
    try:
        raw_name = context.client_context.custom.get('bedrockAgentCoreToolName', '') if context.client_context and context.client_context.custom else ''
        tool_name = raw_name.split('___')[-1] if '___' in raw_name else raw_name
        if not tool_name:
            tool_name = event.get('toolName', '')
        if tool_name not in TOOLS:
            return {'statusCode': 400, 'body': json.dumps({'error': f'Unknown tool: {tool_name}', 'available': list(TOOLS.keys())})}
        result = TOOLS[tool_name](event)
        return {'statusCode': 200, 'body': json.dumps(result, default=_ser)}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
