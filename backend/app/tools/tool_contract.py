"""Validate model requests before they enter the shared tool dispatcher."""
from app.tools.tool_schemas import SRE_TOOL_DEFINITIONS

CONTRACTS = {tool['function']['name']: tool['function']['parameters'] for tool in SRE_TOOL_DEFINITIONS}


def validate_tool_request(name, arguments):
    if not isinstance(name, str) or name not in CONTRACTS:
        raise ValueError('The model requested an unknown tool.')
    if not isinstance(arguments, dict):
        raise ValueError('Tool arguments must be a JSON object.')
    schema = CONTRACTS[name]
    properties = schema.get('properties', {})
    if set(arguments) - set(properties):
        raise ValueError('The model supplied unsupported tool arguments.')
    if any(key not in arguments for key in schema.get('required', [])):
        raise ValueError('The model omitted required tool arguments.')
    for key, value in arguments.items():
        field = properties[key]
        kind = field.get('type')
        valid = {'string': isinstance(value, str), 'integer': type(value) is int,
                 'number': type(value) in (int, float), 'boolean': type(value) is bool,
                 'object': isinstance(value, dict), 'array': isinstance(value, list)}.get(kind, False)
        if not valid or ('enum' in field and value not in field['enum']):
            raise ValueError(f'Invalid value for tool argument {key}.')
    return name, arguments
