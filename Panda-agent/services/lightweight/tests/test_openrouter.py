import json
import tempfile
import unittest
import uuid
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from lightweight.app import ProviderRejected, create_app
from lightweight.openrouter import OpenRouter, configured_profile
from test_runtime import SECRET, body, capability

PROFILE = {'version': 1, 'model': 'fixture/model:free', 'endpoint': 'fixture/fp8', 'reported_provider': 'Fixture', 'context': 33792, 'prices': {'prompt': 0, 'completion': 0, 'request': 0, 'image': 0}, 'privacy_verified': True, 'zdr_verified': True, 'structured_output_verified': True, 'quota_verified': True}

class OpenRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_zero_cost_single_request_and_policy(self):
        seen = []
        def handle(request):
            seen.append(request)
            return httpx.Response(200, json={'model': PROFILE['model'], 'openrouter_metadata': {'attempt': 1, 'is_byok': False, 'endpoints': {'available': [{'model': PROFILE['model'], 'provider': 'Fixture', 'selected': True}]}}, 'usage': {'prompt_tokens': 8, 'completion_tokens': 2, 'cost': 0}, 'choices': [{'message': {'content': '{"selections":[{"handle":"h","quote":"ESP8266"}]}'}}]})
        provider = OpenRouter(PROFILE, 'fixture-key', transport=httpx.MockTransport(handle))
        output = await provider('Which MCU?', [{'handle': 'h', 'text': 'ESP8266'}])
        self.assertEqual(output['usage'], {'modelCalls': 1, 'inputTokens': 8, 'outputTokens': 2, 'costNanoUsd': 0})
        self.assertEqual(len(seen), 1)
        sent = json.loads(seen[0].content)
        self.assertEqual(sent['provider'], {'only': ['fixture/fp8'], 'data_collection': 'deny', 'zdr': True, 'allow_fallbacks': False, 'require_parameters': True, 'max_price': {'prompt': 0, 'completion': 0, 'request': 0, 'image': 0}})
        self.assertEqual(sent['usage'], {'include': True})
        self.assertEqual(sent['max_tokens'], 1024)
        self.assertNotIn('models', sent)

    async def test_quota_no_retry_and_unverified_profile_disabled(self):
        seen = []
        def handle(request):
            seen.append(request)
            return httpx.Response(429)
        provider = OpenRouter(PROFILE, 'fixture-key', transport=httpx.MockTransport(handle))
        with self.assertRaises(ProviderRejected) as failure:
            await provider('Question?', [{'handle': 'h', 'text': 'text'}])
        self.assertEqual(failure.exception.code, 'quota_exhausted')
        self.assertEqual(len(seen), 1)
        self.assertIsNone(configured_profile('unknown', 'fixture-key'))
        with self.assertRaises(ValueError): OpenRouter({**PROFILE, 'zdr_verified': False}, 'fixture-key')
        with self.assertRaises(ValueError): OpenRouter({**PROFILE, 'prices': {**PROFILE['prices'], 'completion': 1}}, 'fixture-key')

    async def test_http_200_embedded_quota_error_is_terminal_without_usage(self):
        seen = []
        def handle(request):
            seen.append(request)
            return httpx.Response(200, json={'error': {'code': 429, 'message': 'private quota message'}})
        provider = OpenRouter(PROFILE, 'fixture-key', transport=httpx.MockTransport(handle))
        with self.assertRaises(ProviderRejected) as failure:
            await provider('Question?', [{'handle': 'h', 'text': 'text'}])
        self.assertEqual(failure.exception.code, 'quota_exhausted')
        self.assertEqual(len(seen), 1)

    async def test_ambiguous_embedded_error_does_not_claim_quota(self):
        def handle(_request):
            return httpx.Response(200, json={'error': {'code': 429}, 'choices': [{'message': {'content': 'ambiguous'}}]})
        provider = OpenRouter(PROFILE, 'fixture-key', transport=httpx.MockTransport(handle))
        with self.assertRaises(RuntimeError):
            await provider('Question?', [{'handle': 'h', 'text': 'text'}])

class QuotaWireTests(unittest.TestCase):
    def test_embedded_quota_is_signed_terminal_and_does_not_disable_profile(self):
        calls = []
        def handle(request):
            calls.append(request)
            return httpx.Response(200, json={'error': {'code': 429, 'message': 'private quota message'}})
        provider = OpenRouter(PROFILE, 'fixture-key', transport=httpx.MockTransport(handle))
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), provider=provider, clock=lambda: 1000)
            with TestClient(app) as client:
                for count in (1, 2):
                    turn = str(uuid.uuid4())
                    raw = body({'version': 1, 'turnId': turn, 'productSku': 'x8266', 'question': 'Which MCU?', 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
                    token, _ = capability(raw, turn=turn)
                    response = client.post('/v1/evidence/select', content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
                    self.assertEqual(response.status_code, 429)
                    self.assertEqual(response.json(), {'version': 1, 'state': 'rejected', 'code': 'quota_exhausted', 'usage': None})
                    self.assertIn('x-panda-receipt', response.headers)
                    self.assertNotIn('private quota message', response.text)
                    self.assertEqual(len(calls), count)
