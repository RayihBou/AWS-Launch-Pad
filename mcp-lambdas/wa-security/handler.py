import json
import boto3
from datetime import datetime

sh = boto3.client('securityhub')
gd = boto3.client('guardduty')


def _default_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _get_findings(params):
    kwargs = {}
    if 'filters' in params:
        kwargs['Filters'] = params['filters']
    if 'max_results' in params:
        kwargs['MaxResults'] = params['max_results']
    resp = sh.get_findings(**kwargs)
    return resp['Findings']


def _list_standards(params):
    resp = sh.describe_standards()
    return resp['Standards']


def _get_guardduty_findings(params):
    detector_id = params['detector_id']
    kwargs = {'DetectorId': detector_id}
    if 'criteria' in params:
        kwargs['FindingCriteria'] = params['criteria']
    listing = gd.list_findings(**kwargs)
    if not listing['FindingIds']:
        return []
    detail = gd.get_findings(DetectorId=detector_id, FindingIds=listing['FindingIds'])
    return detail['Findings']


TOOLS = {
    'get_findings': _get_findings,
    'list_standards': _list_standards,
    'get_guardduty_findings': _get_guardduty_findings,
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
