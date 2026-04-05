import json
import boto3
from datetime import datetime

sh = boto3.client('securityhub')
gd = boto3.client('guardduty')


def _ser(obj):
    if isinstance(obj, datetime): return obj.isoformat()
    raise TypeError(f"Not serializable: {type(obj)}")


def _get_findings(params):
    kwargs = {'MaxResults': params.get('max_results', 20)}
    if 'severity' in params:
        kwargs['Filters'] = {'SeverityLabel': [{'Value': params['severity'], 'Comparison': 'EQUALS'}]}
    return sh.get_findings(**kwargs)['Findings']


def _list_standards(params):
    return sh.describe_standards()['Standards']


def _get_guardduty_findings(params):
    det = params.get('detector_id', '')
    if not det:
        dets = gd.list_detectors()['DetectorIds']
        if not dets: return {'error': 'No GuardDuty detector found'}
        det = dets[0]
    ids = gd.list_findings(DetectorId=det, MaxResults=20)['FindingIds']
    if not ids: return []
    return gd.get_findings(DetectorId=det, FindingIds=ids)['Findings']


TOOLS = {
    'get_findings': _get_findings,
    'list_standards': _list_standards,
    'get_guardduty_findings': _get_guardduty_findings,
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
