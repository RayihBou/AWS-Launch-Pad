import json
import boto3
from datetime import datetime, timedelta

ct = boto3.client('cloudtrail')


def _default_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _lookup_events(params):
    kwargs = {}
    if 'lookup_attributes' in params:
        kwargs['LookupAttributes'] = [
            {'AttributeKey': k, 'AttributeValue': v}
            for k, v in params['lookup_attributes'].items()
        ]
    if 'start_time' in params:
        kwargs['StartTime'] = params['start_time']
    else:
        kwargs['StartTime'] = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    if 'end_time' in params:
        kwargs['EndTime'] = params['end_time']
    if 'max_results' in params:
        kwargs['MaxResults'] = params['max_results']
    resp = ct.lookup_events(**kwargs)
    return resp['Events']


def _describe_trails(params):
    kwargs = {}
    if 'trail_names' in params:
        kwargs['trailNameList'] = params['trail_names']
    resp = ct.describe_trails(**kwargs)
    return resp['trailList']


def _get_trail_status(params):
    resp = ct.get_trail_status(Name=params['trail_name'])
    resp.pop('ResponseMetadata', None)
    return resp


TOOLS = {
    'lookup_events': _lookup_events,
    'describe_trails': _describe_trails,
    'get_trail_status': _get_trail_status,
}


def handler(event, context):
    try:
        tool_name = event.get('toolName', '')
        tool_input = event.get('input', {})
        if tool_name not in TOOLS:
            return {'statusCode': 400, 'body': json.dumps({'error': f'Unknown tool: {tool_name}'})}
        result = TOOLS[tool_name](tool_input)
        return {'statusCode': 200, 'body': json.dumps(result, default=_default_serializer)}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
