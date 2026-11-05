"""Disabled-by-default adapter. No endpoint is approved by this checkpoint."""

import json
from decimal import Decimal

import httpx

from .app import ProviderRejected, pairs, parse, provider_prompt

# Add a reviewed, current endpoint only with its pricing/privacy/context evidence.
PROFILES_V1 = {}

class OpenRouter:
    def __init__(self, profile, api_key, *, transport=None):
        required = {'version', 'model', 'endpoint', 'reported_provider', 'context', 'prices', 'privacy_verified', 'zdr_verified', 'structured_output_verified', 'quota_verified'}
        if not isinstance(profile, dict) or set(profile) != required or type(profile['version']) is not int or profile['version'] != 1 or any(not isinstance(profile[k], str) or not profile[k] for k in ('model', 'endpoint', 'reported_provider')) or type(profile['context']) is not int or profile['context'] < 33792 or not isinstance(profile['prices'], dict) or set(profile['prices']) != {'prompt', 'completion', 'request', 'image'} or any(type(value) is not int or value != 0 for value in profile['prices'].values()) or any(profile[key] is not True for key in ('privacy_verified', 'zdr_verified', 'structured_output_verified', 'quota_verified')) or not isinstance(api_key, str) or not api_key:
            raise ValueError('unverified profile')
        self.profile, self.api_key, self.transport = profile.copy(), api_key, transport

    async def __call__(self, question, fragments):
        request = {
            'model': self.profile['model'],
            'messages': [{'role': 'user', 'content': provider_prompt(question, fragments)}],
            'max_tokens': 1024,
            'response_format': {'type': 'json_object'},
            'usage': {'include': True},
            'provider': {'only': [self.profile['endpoint']], 'data_collection': 'deny', 'zdr': True, 'allow_fallbacks': False, 'require_parameters': True, 'max_price': {'prompt': 0, 'completion': 0, 'request': 0, 'image': 0}},
        }
        async with httpx.AsyncClient(timeout=25, follow_redirects=False, trust_env=False, transport=self.transport) as client:
            async with client.stream('POST', 'https://openrouter.ai/api/v1/chat/completions', headers={'Authorization': 'Bearer ' + self.api_key, 'X-OpenRouter-Metadata': 'enabled'}, json=request) as response:
                if response.status_code == 429: raise ProviderRejected('quota_exhausted')
                if 400 <= response.status_code < 500: raise ProviderRejected('provider_unavailable')
                response.raise_for_status()
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > 65536: return {'selections': [], 'usage': {}}
        try:
            data = json.loads(chunks.decode('utf-8'), parse_float=Decimal, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('number')))
            error = data.get('error') if isinstance(data, dict) else None
            if isinstance(error, dict) and type(error.get('code')) is int and error['code'] == 429 and 'choices' not in data and 'usage' not in data and 'openrouter_metadata' not in data:
                raise ProviderRejected('quota_exhausted')
            if isinstance(data, dict) and 'error' in data:
                raise RuntimeError('ambiguous provider outcome')
            usage = data['usage']
            metadata = data['openrouter_metadata']
            selected = [item for item in metadata['endpoints']['available'] if item.get('selected') is True]
            if data['model'] != self.profile['model'] or metadata['attempt'] != 1 or metadata['is_byok'] is not False or len(selected) != 1 or selected[0]['provider'] != self.profile['reported_provider'] or selected[0]['model'] != self.profile['model'] or not isinstance(usage, dict) or type(usage['prompt_tokens']) is not int or type(usage['completion_tokens']) is not int or type(usage['cost']) not in (int, Decimal):
                return {'selections': [], 'usage': {}}
            cost = usage['cost']
            if cost != 0: return {'selections': [], 'usage': {'modelCalls': 1, 'inputTokens': usage['prompt_tokens'], 'outputTokens': usage['completion_tokens'], 'costNanoUsd': 1}}
            content = parse(data['choices'][0]['message']['content'].encode('utf-8'))
            if not isinstance(content, dict) or set(content) != {'selections'}: return {'selections': None, 'usage': {'modelCalls': 1, 'inputTokens': usage['prompt_tokens'], 'outputTokens': usage['completion_tokens'], 'costNanoUsd': 0}}
            return {'selections': content['selections'], 'usage': {'modelCalls': 1, 'inputTokens': usage['prompt_tokens'], 'outputTokens': usage['completion_tokens'], 'costNanoUsd': 0}}
        except (ValueError, TypeError, KeyError, IndexError, UnicodeError, RecursionError):
            return {'selections': [], 'usage': {}}

def configured_profile(name, api_key):
    profile = PROFILES_V1.get(name)
    return OpenRouter(profile, api_key) if profile else None
