import json
import boto3

pricing = boto3.client('pricing', region_name='us-east-1')


def _get_products(params):
    kwargs = {'ServiceCode': params['service_code'], 'MaxResults': 10}
    if 'filters' in params:
        kwargs['Filters'] = [{'Type': 'TERM_MATCH', 'Field': k, 'Value': v} for k, v in params['filters'].items()]
    r = pricing.get_products(**kwargs)
    return [json.loads(p) for p in r['PriceList']]


def _describe_services(params):
    kwargs = {}
    if 'service_code' in params:
        kwargs['ServiceCode'] = params['service_code']
    return pricing.describe_services(**kwargs)['Services']


def _get_attribute_values(params):
    return pricing.get_attribute_values(ServiceCode=params['service_code'], AttributeName=params['attribute_name'])['AttributeValues']


TOOLS = {
    'get_products': _get_products,
    'describe_services': _describe_services,
    'get_attribute_values': _get_attribute_values,
}


def handler(event, context):
    try:
        tool_name = context.client_context.custom.get('bedrockAgentCoreToolName', '') if context.client_context else ''
        if not tool_name:
            tool_name = event.get('toolName', '')
        if tool_name not in TOOLS:
            return {'statusCode': 400, 'body': json.dumps({'error': f'Unknown tool: {tool_name}', 'available': list(TOOLS.keys())})}
        result = TOOLS[tool_name](event)
        return {'statusCode': 200, 'body': json.dumps(result)}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
