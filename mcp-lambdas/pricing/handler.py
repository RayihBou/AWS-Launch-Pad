# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import json
import boto3

pricing = boto3.client('pricing', region_name='us-east-1')

REGION_NAMES = {
    'us-east-1': 'US East (N. Virginia)', 'us-east-2': 'US East (Ohio)',
    'us-west-1': 'US West (N. California)', 'us-west-2': 'US West (Oregon)',
    'eu-west-1': 'EU (Ireland)', 'eu-central-1': 'EU (Frankfurt)',
    'ap-southeast-1': 'Asia Pacific (Singapore)', 'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'sa-east-1': 'South America (Sao Paulo)',
}

def _get_products(params):
    kwargs = {'ServiceCode': params.get('service_code', 'AmazonEC2'), 'MaxResults': 5}
    filters = []
    if params.get('instance_type'):
        filters.append({'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': params['instance_type']})
    if params.get('region'):
        loc = REGION_NAMES.get(params['region'], params['region'])
        filters.append({'Type': 'TERM_MATCH', 'Field': 'location', 'Value': loc})
    if params.get('operating_system'):
        filters.append({'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': params['operating_system']})
    else:
        filters.append({'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'})
    filters.append({'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'})
    filters.append({'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'})
    filters.append({'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'})
    if params.get('filters'):
        filters.extend([{'Type': 'TERM_MATCH', 'Field': k, 'Value': v} for k, v in params['filters'].items()])
    kwargs['Filters'] = filters
    r = pricing.get_products(**kwargs)
    results = []
    for p in r['PriceList']:
        product = json.loads(p)
        attrs = product.get('product', {}).get('attributes', {})
        terms = product.get('terms', {}).get('OnDemand', {})
        price_per_hour = None
        for term in terms.values():
            for dim in term.get('priceDimensions', {}).values():
                price_per_hour = dim.get('pricePerUnit', {}).get('USD')
        results.append({
            'instanceType': attrs.get('instanceType', '-'),
            'vcpu': attrs.get('vcpu', '-'),
            'memory': attrs.get('memory', '-'),
            'region': attrs.get('location', '-'),
            'os': attrs.get('operatingSystem', '-'),
            'pricePerHour': price_per_hour,
        })
    return results

def _describe_services(params):
    kwargs = {}
    if 'service_code' in params:
        kwargs['ServiceCode'] = params['service_code']
    return pricing.describe_services(**kwargs)['Services']

def _get_attribute_values(params):
    return pricing.get_attribute_values(ServiceCode=params['service_code'], AttributeName=params['attribute_name'])['AttributeValues']

TOOLS = {'get_products': _get_products, 'describe_services': _describe_services, 'get_attribute_values': _get_attribute_values}

def handler(event, context):
    try:
        raw_name = context.client_context.custom.get('bedrockAgentCoreToolName', '') if context.client_context and context.client_context.custom else ''
        tool_name = raw_name.split('___')[-1] if '___' in raw_name else raw_name
        if not tool_name:
            tool_name = event.get('toolName', '')
        if tool_name not in TOOLS:
            return {'statusCode': 400, 'body': json.dumps({'error': f'Unknown tool: {tool_name}', 'available': list(TOOLS.keys())})}
        result = TOOLS[tool_name](event)
        return {'statusCode': 200, 'body': json.dumps(result)}
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
