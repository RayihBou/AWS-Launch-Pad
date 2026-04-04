import json
import boto3
from datetime import datetime, timedelta

ct = boto3.client('cloudtrail')


def _ser(obj):
    if isinstance(obj, datetime): return obj.isoformat()
    raise TypeError(f"Not serializable: {type(obj)}")


def _lookup_events(params):
    kwargs = {'MaxResults': params.get('max_results', 20)}
    if 'lookup_attributes' in params:
        kwargs['LookupAttributes'] = [{'AttributeKey': k, 'AttributeValue': v} for k, v in params['lookup_attributes'].items()]
    kwargs['StartTime'] = params.get('start_time', (datetime.utcnow() - timedelta(hours=24)).isoformat())
    if 'end_time' in params:
        kwargs['EndTime'] = params['end_time']
    return ct.lookup_events(**kwargs)['Events']


def _describe_trails(params):
    kwargs = {}
    if 'trail_names' in params:
        kwargs['trailNameList'] = params['trail_names']
    return ct.describe_trails(**kwargs)['trailList']


def _get_trail_status(params):
    r = ct.get_trail_status(Name=params['trail_name'])
    r.pop('ResponseMetadata', None)
    return r


TOOLS = {
    'lookup_events': _lookup_events,
    'describe_trails': _describe_trails,
    'get_trail_status': _get_trail_status,
}


def handler(event, context):
    try:
        tool_name = context.client_context.custom.get('bedrockAgentCoreToolName', '') if context.client_context else ''
        if not tool_name:
            tool_name = event.get('toolName', '')
        if tool_name not in TOOLS:
            return {'statusCode': 400, 'body': json.dumps({'error': f'Unknown tool: {tool_name}', 'available': list(TOOLS.keys())})}
        result = TOOLS[tool_name](event)
        return {'statusCode': 200, 'body': json.dumps(result, default=_ser)}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
