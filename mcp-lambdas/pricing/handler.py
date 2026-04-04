import json
import boto3

pricing = boto3.client('pricing', region_name='us-east-1')


def _get_products(params):
    kwargs = {'ServiceCode': params['service_code']}
    if 'filters' in params:
        kwargs['Filters'] = [
            {'Type': 'TERM_MATCH', 'Field': k, 'Value': v}
            for k, v in params['filters'].items()
        ]
    resp = pricing.get_products(**kwargs)
    return [json.loads(p) for p in resp['PriceList']]


def _describe_services(params):
    kwargs = {}
    if 'service_code' in params:
        kwargs['ServiceCode'] = params['service_code']
    resp = pricing.describe_services(**kwargs)
    return resp['Services']


def _get_attribute_values(params):
    resp = pricing.get_attribute_values(
        ServiceCode=params['service_code'],
        AttributeName=params['attribute_name']
    )
    return resp['AttributeValues']


TOOLS = {
    'get_products': _get_products,
    'describe_services': _describe_services,
    'get_attribute_values': _get_attribute_values,
}


def handler(event, context):
    try:
        tool_name = event.get('toolName', '')
        tool_input = event.get('input', {})
        if tool_name not in TOOLS:
            return {'statusCode': 400, 'body': json.dumps({'error': f'Unknown tool: {tool_name}'})}
        result = TOOLS[tool_name](tool_input)
        return {'statusCode': 200, 'body': json.dumps(result)}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
