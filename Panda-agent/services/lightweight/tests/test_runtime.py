import base64
import asyncio
import concurrent.futures
import hashlib
import hmac
import json
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from lightweight.app import Journal, create_app, provider_prompt

SECRET = b'fixture-secret'
ACTOR = 'a' * 64
SESSION = 'b' * 64
TURN = '00000000-0000-4000-8000-000000000001'

def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def body(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()

def capability(raw, action='select', nonce=None, sku='x8266', turn=TURN, actor=ACTOR):
    claims = {'v': 1, 'aud': 'panda-lightweight-evidence-v1', 'action': action, 'sub': actor, 'sid': SESSION, 'turnId': turn, 'sku': sku, 'nonce': nonce or str(uuid.uuid4()), 'iat': 1000, 'exp': 1050, 'bodySha256': hashlib.sha256(raw).hexdigest()}
    segment = b64(body(claims))
    return segment + '.' + b64(hmac.new(SECRET, segment.encode(), hashlib.sha256).digest()), claims

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.calls = []
        self.provider_result = {'selections': [{'handle': 'h1', 'quote': 'ESP8266'}], 'usage': {'modelCalls': 1, 'inputTokens': 12, 'outputTokens': 4, 'costNanoUsd': 0}}
        async def provider(question, fragments):
            self.calls.append(question)
            if isinstance(self.provider_result, Exception): raise self.provider_result
            return self.provider_result
        self.app = create_app(secret=SECRET, journal_path=str(Path(self.tmp.name) / 'journal.sqlite'), provider=provider, clock=lambda: 1000)
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.client.__exit__, None, None, None)
        self.payload = {'version': 1, 'turnId': TURN, 'productSku': 'x8266', 'question': 'Which MCU?', 'fragments': [{'handle': 'h1', 'text': 'Uses ESP8266.'}]}

    def post(self, path, raw, token):
        return self.client.post(path, content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})

    def test_signed_selection_replay_conflict_and_status(self):
        raw = body(self.payload)
        token, claims = capability(raw)
        response = self.post('/v1/evidence/select', raw, token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['selections'], [{'handle': 'h1', 'quote': 'ESP8266'}])
        message = ('response.v1\n' + claims['nonce'] + '\n' + claims['bodySha256'] + '\n' + hashlib.sha256(response.content).hexdigest()).encode()
        self.assertEqual(response.headers['x-panda-receipt'], b64(hmac.new(SECRET, message, hashlib.sha256).digest()))
        self.assertEqual(self.post('/v1/evidence/select', raw, token).json()['code'], 'capability_replayed')
        changed = body({**self.payload, 'question': 'Changed?'}); other, _ = capability(changed)
        self.assertEqual(self.post('/v1/evidence/select', changed, other).json()['code'], 'turn_conflict')
        status = body({'version': 1, 'turnId': TURN, 'requestBodySha256': hashlib.sha256(raw).hexdigest()}); status_token, _ = capability(status, 'readturn')
        self.assertEqual(self.post('/v1/evidence/status', status, status_token).json(), response.json())
        self.assertEqual(len(self.calls), 1)

    def test_invalid_scope_literal_and_replay_never_dispatch(self):
        raw = body(self.payload); token, _ = capability(raw, sku='wrong')
        self.assertEqual(self.post('/v1/evidence/select', raw, token).status_code, 400)
        self.assertEqual(self.calls, [])

    def test_fixed_hmac_vector(self):
        self.assertEqual(b64(hmac.new(SECRET, b'eyJ2IjoxfQ', hashlib.sha256).digest()), 'bJC6mFqbkzjhlQwAxBHXrsEN75d_vZE8aNUjRqz8Kl8')
        body_hash = hashlib.sha256(b'{"version":1}').hexdigest()
        response_hash = hashlib.sha256(b'{}').hexdigest()
        message = ('response.v1\n00000000-0000-4000-8000-000000000001\n' + body_hash + '\n' + response_hash).encode()
        self.assertEqual(b64(hmac.new(SECRET, message, hashlib.sha256).digest()), '4hY46ftRY0PPGzxfLY0Xr2pMtFAREAUWklYYI9klm2U')

    def test_ambiguous_provider_failure_is_unknown_and_never_reexecuted(self):
        self.provider_result = TimeoutError('private provider message')
        raw = body(self.payload); token, _ = capability(raw)
        first = self.post('/v1/evidence/select', raw, token)
        self.assertEqual((first.status_code, first.json()['code']), (409, 'outcome_unknown'))
        token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw, token).json()['code'], 'outcome_unknown')
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn('private provider message', first.text)

    def test_paid_usage_stops_further_admission(self):
        self.provider_result['usage']['costNanoUsd'] = 1
        raw = body(self.payload); token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw, token).json()['code'], 'invalid_selection')
        another = body({**self.payload, 'turnId': str(uuid.uuid4())}); turn = json.loads(another)['turnId']; token, _ = capability(another, turn=turn)
        self.assertEqual(self.post('/v1/evidence/select', another, token).json()['code'], 'disabled')
        self.assertEqual(len(self.calls), 1)

    def test_duplicate_json_and_utf16_limit_are_rejected(self):
        raw = b'{"version":1,"version":1}'; token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw, token).status_code, 400)
        raw = body({**self.payload, 'question': '\U0001f600' * 1001}); token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw, token).status_code, 400)
        self.assertEqual(self.calls, [])

    def test_nonliteral_quote_is_rejected_without_leaking_content(self):
        self.provider_result['selections'][0]['quote'] = 'not present'
        raw = body(self.payload); token, _ = capability(raw)
        response = self.post('/v1/evidence/select', raw, token)
        self.assertEqual((response.status_code, response.json()['code']), (422, 'invalid_selection'))
        self.assertNotIn('not present', response.text)
        self.assertEqual(len(self.calls), 1)

    def test_tampered_body_and_foreign_status_are_denied(self):
        raw = body(self.payload); token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw + b' ', token).status_code, 401)
        self.assertEqual(self.calls, [])
        status = body({'version': 1, 'turnId': TURN, 'requestBodySha256': hashlib.sha256(raw).hexdigest()})
        token, _ = capability(status, 'readturn')
        self.assertEqual(self.post('/v1/evidence/status', status, token).status_code, 404)

    def test_prompt_and_raw_byte_limits_are_independent(self):
        long_payload = {**self.payload, 'fragments': [{'handle': 'a', 'text': '\U0001f600' * 5000}, {'handle': 'b', 'text': '\U0001f600' * 5000}]}
        raw = body(long_payload); token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw, token).json()['code'], 'budget_exceeded')
        oversized = b' ' * 98305; token, _ = capability(oversized)
        self.assertEqual(self.post('/v1/evidence/select', oversized, token).status_code, 413)
        self.assertEqual(self.calls, [])

    def test_prompt_byte_ceiling_includes_selection_instructions(self):
        def fragments(length): return [{'handle': 'h', 'text': '\u0800' * length}]
        limit = next(n for n in range(1, 12001) if len(provider_prompt('Q?', fragments(n)).encode('utf-8')) > 32768)
        self.assertLessEqual(len(provider_prompt('Q?', fragments(limit - 1)).encode('utf-8')), 32768)
        self.provider_result['selections'] = []
        first_turn = str(uuid.uuid4())
        first = body({**self.payload, 'turnId': first_turn, 'question': 'Q?', 'fragments': fragments(limit - 1)})
        token, _ = capability(first, turn=first_turn)
        self.assertEqual(self.post('/v1/evidence/select', first, token).status_code, 200)
        second_turn = str(uuid.uuid4())
        second = body({**self.payload, 'turnId': second_turn, 'question': 'Q?', 'fragments': fragments(limit)})
        token, _ = capability(second, turn=second_turn)
        self.assertEqual(self.post('/v1/evidence/select', second, token).json()['code'], 'budget_exceeded')
        self.assertEqual(len(self.calls), 1)

    def test_status_cannot_read_another_actors_turn(self):
        raw = body(self.payload); token, _ = capability(raw)
        self.assertEqual(self.post('/v1/evidence/select', raw, token).status_code, 200)
        status = body({'version': 1, 'turnId': TURN, 'requestBodySha256': hashlib.sha256(raw).hexdigest()})
        token, _ = capability(status, 'readturn', actor='c' * 64)
        self.assertEqual(self.post('/v1/evidence/status', status, token).status_code, 404)

class JournalTests(unittest.TestCase):
    def test_restart_marks_incomplete_dispatch_unknown_and_enforces_one_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'journal.sqlite')
            journal = Journal(path)
            journal.db.execute('INSERT INTO turns(actor,turn_id,sku,digest,state,result) VALUES (?,?,?,?,?,NULL)', (ACTOR, TURN, 'x8266', 'd' * 64, 'dispatch'))
            with self.assertRaises(RuntimeError): Journal(path)
            journal.close()
            reopened = Journal(path)
            try: self.assertEqual(reopened.turn(ACTOR, TURN)[2], 'unknown')
            finally: reopened.close()

class CancelTests(unittest.TestCase):
    def test_tombstone_delayed_select_and_restart(self):
        calls = []
        async def provider(*args): calls.append(args); return None
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'journal.sqlite')
            raw = body({'version': 1, 'turnId': TURN, 'productSku': 'x8266', 'question': 'Which MCU?', 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
            control = body({'version': 1, 'turnId': TURN, 'requestBodySha256': hashlib.sha256(raw).hexdigest()})
            def send(client, path, payload, action):
                token, _ = capability(payload, action)
                return client.post(path, content=payload, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
            for _ in range(2):
                app = create_app(secret=SECRET, journal_path=path, provider=provider, clock=lambda: 1000)
                with TestClient(app) as client:
                    for action, path_name, payload in [('cancelturn', 'cancel', control), ('readturn', 'status', control), ('select', 'select', raw)]:
                        response = send(client, '/v1/evidence/' + path_name, payload, action)
                        self.assertEqual((response.status_code, response.json()['code']), (409, 'cancelled'))
                        self.assertIn('x-panda-receipt', response.headers)
                    changed = body({**json.loads(raw), 'question': 'Other?'})
                    self.assertEqual(send(client, '/v1/evidence/select', changed, 'select').json()['code'], 'turn_conflict')
            self.assertEqual(calls, [])

    def test_owner_session_and_nonce_guards(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), clock=lambda: 1000)
            with TestClient(app) as client:
                raw = body({'version': 1, 'turnId': TURN, 'requestBodySha256': 'd' * 64})
                token, _ = capability(raw, 'cancelturn')
                headers = {'authorization': 'Bearer ' + token, 'content-type': 'application/json'}
                first = client.post('/v1/evidence/cancel', content=raw, headers=headers)
                self.assertEqual(first.json()['code'], 'cancelled')
                self.assertEqual(client.post('/v1/evidence/cancel', content=raw, headers=headers).json()['code'], 'capability_replayed')
                changed = body({'version': 1, 'turnId': TURN, 'requestBodySha256': 'e' * 64})
                changed_token, _ = capability(changed, 'cancelturn')
                self.assertEqual(client.post('/v1/evidence/cancel', content=changed, headers={'authorization': 'Bearer ' + changed_token, 'content-type': 'application/json'}).json()['code'], 'turn_conflict')
                wrong_sku, _ = capability(raw, 'cancelturn', sku='another')
                self.assertEqual(client.post('/v1/evidence/cancel', content=raw, headers={'authorization': 'Bearer ' + wrong_sku, 'content-type': 'application/json'}).json()['code'], 'turn_conflict')
                other, _ = capability(raw, 'readturn', actor='c' * 64)
                self.assertEqual(client.post('/v1/evidence/status', content=raw, headers={'authorization': 'Bearer ' + other, 'content-type': 'application/json'}).status_code, 404)
                other_cancel, _ = capability(raw, 'cancelturn', actor='c' * 64)
                self.assertEqual(client.post('/v1/evidence/cancel', content=raw, headers={'authorization': 'Bearer ' + other_cancel, 'content-type': 'application/json'}).json()['code'], 'cancelled')
                bad, _ = capability(raw, 'readturn')
                self.assertEqual(client.post('/v1/evidence/cancel', content=raw, headers={'authorization': 'Bearer ' + bad, 'content-type': 'application/json'}).status_code, 401)

class CancelRaceTests(unittest.IsolatedAsyncioTestCase):
    async def test_queued_cancel_skips_and_dispatched_cancel_reconciles(self):
        started = asyncio.Event(); release = asyncio.Event(); calls = []
        async def provider(question, _fragments):
            calls.append(question); started.set(); await release.wait()
            return {'selections': [], 'usage': {'modelCalls': 1, 'inputTokens': 1, 'outputTokens': 1, 'costNanoUsd': 0}}
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), provider=provider, clock=lambda: 1000)
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    async def send(path, raw, action, turn, actor):
                        token, _ = capability(raw, action, turn=turn, actor=actor)
                        return await client.post('/v1/evidence/' + path, content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
                    def make(question):
                        turn = str(uuid.uuid4()); raw = body({'version': 1, 'turnId': turn, 'productSku': 'x8266', 'question': question, 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
                        control = body({'version': 1, 'turnId': turn, 'requestBodySha256': hashlib.sha256(raw).hexdigest()})
                        return turn, raw, control
                    active, active_raw, active_control = make('active'); actor = '1' * 64
                    task = asyncio.create_task(send('select', active_raw, 'select', active, actor)); await asyncio.wait_for(started.wait(), 2)
                    queued, queued_raw, queued_control = make('queued'); actor2 = '2' * 64
                    task2 = asyncio.create_task(send('select', queued_raw, 'select', queued, actor2))
                    try:
                        for _ in range(100):
                            if (await send('status', queued_control, 'readturn', queued, actor2)).status_code == 202: break
                            await asyncio.sleep(.01)
                        else: self.fail('not queued')
                        self.assertEqual((await send('cancel', queued_control, 'cancelturn', queued, actor2)).json()['code'], 'cancelled')
                        self.assertEqual((await task2).json()['code'], 'cancelled')
                        self.assertEqual((await send('cancel', active_control, 'cancelturn', active, actor)).json()['code'], 'outcome_unknown')
                    finally: release.set()
                    self.assertEqual((await task).json()['state'], 'complete')
                    self.assertEqual((await send('cancel', active_control, 'cancelturn', active, actor)).json()['state'], 'complete')
                    self.assertEqual(calls, ['active'])

class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_shutdown_waiters_reconcile_unknown_after_restart(self):
        started = asyncio.Event(); calls = []
        async def provider(question, fragments):
            calls.append(question); started.set(); await asyncio.Event().wait()
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'journal.sqlite')
            app = create_app(secret=SECRET, journal_path=path, provider=provider, clock=lambda: 1000)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
                runs = []
                async with app.router.lifespan_context(app):
                    for index in range(2):
                        turn = str(uuid.uuid4()); actor = str(index + 1) * 64
                        raw = body({'version': 1, 'turnId': turn, 'productSku': 'x8266', 'question': 'Which MCU?', 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
                        token, _ = capability(raw, turn=turn, actor=actor)
                        task = asyncio.create_task(client.post('/v1/evidence/select', content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'}))
                        runs.append((turn, actor, raw, task))
                        if index == 0: await asyncio.wait_for(started.wait(), 2)
                        else:
                            for _ in range(100):
                                status = body({'version': 1, 'turnId': turn, 'requestBodySha256': hashlib.sha256(raw).hexdigest()}); token, _ = capability(status, 'readturn', turn=turn, actor=actor)
                                if (await client.post('/v1/evidence/status', content=status, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})).status_code == 202: break
                                await asyncio.sleep(.01)
                            else: self.fail('queued turn not admitted')
                for _, _, _, task in runs:
                    response = await task
                    self.assertEqual((response.status_code, response.json()['code']), (409, 'outcome_unknown'))
                    self.assertIn('x-panda-receipt', response.headers)
            reopened = create_app(secret=SECRET, journal_path=path, provider=provider, clock=lambda: 1000)
            async with reopened.router.lifespan_context(reopened):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=reopened), base_url='http://test') as client:
                    for turn, actor, raw, _ in runs:
                        status = body({'version': 1, 'turnId': turn, 'requestBodySha256': hashlib.sha256(raw).hexdigest()}); token, _ = capability(status, 'readturn', turn=turn, actor=actor)
                        result = await client.post('/v1/evidence/status', content=status, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
                        self.assertEqual((result.status_code, result.json()['code']), (409, 'outcome_unknown'))
                        token, _ = capability(raw, turn=turn, actor=actor)
                        self.assertEqual((await client.post('/v1/evidence/select', content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})).json()['code'], 'outcome_unknown')
            self.assertEqual(len(calls), 1)

    async def test_late_provider_response_remains_unknown(self):
        calls = []
        async def provider(question, fragments):
            calls.append(question)
            try: await asyncio.sleep(.5)
            except asyncio.CancelledError: await asyncio.sleep(.01)
            return {'selections': [], 'usage': {'modelCalls': 1, 'inputTokens': 1, 'outputTokens': 1, 'costNanoUsd': 0}}
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), provider=provider, clock=lambda: 1000, execution_timeout=.2)
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    raw = body({'version': 1, 'turnId': TURN, 'productSku': 'x8266', 'question': 'Which MCU?', 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]}); token, _ = capability(raw)
                    response = await client.post('/v1/evidence/select', content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
                    self.assertEqual((response.status_code, response.json()['code']), (409, 'outcome_unknown'))
                    token, _ = capability(raw)
                    self.assertEqual((await client.post('/v1/evidence/select', content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})).json()['code'], 'outcome_unknown')
                    self.assertEqual(len(calls), 1)

class IngressTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_and_parallel_bodies_are_bounded_before_provider(self):
        entered = asyncio.Event(); never = asyncio.Event(); calls = []
        async def provider(*args): calls.append(args); return None
        async def slow():
            yield b'{'
            entered.set()
            await never.wait()
            yield b'}'
        used = []
        async def unauthorized_body():
            used.append(True)
            yield b'{}'
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), provider=provider, clock=lambda: 1000, ingress_limit=1, body_timeout=0.2)
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    token, _ = capability(b'{}')
                    headers = {'authorization': 'Bearer ' + token, 'content-type': 'application/json'}
                    pending = asyncio.create_task(client.post('/v1/evidence/select', content=slow(), headers=headers))
                    await asyncio.wait_for(entered.wait(), 1)
                    rejected = await client.post('/v1/evidence/select', content=b'{}', headers=headers)
                    self.assertEqual((rejected.status_code, rejected.json()['code']), (429, 'busy'))
                    self.assertNotIn('x-panda-receipt', rejected.headers)
                    unauthorized = await client.post('/v1/evidence/select', content=unauthorized_body(), headers={'authorization': 'Bearer bad', 'content-type': 'application/json'})
                    self.assertEqual(unauthorized.status_code, 401)
                    self.assertEqual(used, [])
                    timed_out = await asyncio.wait_for(pending, 1)
                    self.assertEqual((timed_out.status_code, timed_out.json()['code']), (400, 'invalid'))
                    self.assertNotIn('x-panda-receipt', timed_out.headers)
                    released = await client.post('/v1/evidence/select', content=b'{}', headers=headers)
                    self.assertEqual(released.status_code, 400)
                    self.assertIn('x-panda-receipt', released.headers)
                    self.assertEqual(calls, [])

class DisconnectTests(unittest.IsolatedAsyncioTestCase):
    async def test_disconnect_before_dispatch_skips_queued_turn(self):
        await self.check_disconnect(queued=True)

    async def test_disconnect_after_dispatch_retains_completed_result(self):
        await self.check_disconnect(queued=False)

    async def check_disconnect(self, queued):
        started = asyncio.Event(); release = asyncio.Event(); calls = []
        async def provider(question, fragments):
            calls.append(question); started.set(); await release.wait()
            return {'selections': [{'handle': 'h', 'quote': 'ESP8266'}], 'usage': {'modelCalls': 1, 'inputTokens': 1, 'outputTokens': 1, 'costNanoUsd': 0}}
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), provider=provider, clock=lambda: 1000)
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    def launch(question, actor):
                        turn = str(uuid.uuid4())
                        raw = body({'version': 1, 'turnId': turn, 'productSku': 'x8266', 'question': question, 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
                        token, _ = capability(raw, turn=turn, actor=actor)
                        messages = asyncio.Queue(); messages.put_nowait({'type': 'http.request', 'body': raw, 'more_body': False})
                        output = []
                        async def send(message): output.append(message)
                        scope = {'type': 'http', 'asgi': {'version': '3.0', 'spec_version': '2.3'}, 'http_version': '1.1', 'method': 'POST', 'scheme': 'http', 'path': '/v1/evidence/select', 'raw_path': b'/v1/evidence/select', 'query_string': b'', 'root_path': '', 'headers': [(b'content-type', b'application/json'), (b'authorization', ('Bearer ' + token).encode())], 'client': ('127.0.0.1', 1), 'server': ('127.0.0.1', 80)}
                        task = asyncio.create_task(app(scope, messages.get, send))
                        return task, messages, output, raw, turn, actor
                    async def status(run):
                        _, _, _, raw, turn, actor = run
                        request = body({'version': 1, 'turnId': turn, 'requestBodySha256': hashlib.sha256(raw).hexdigest()})
                        token, _ = capability(request, 'readturn', turn=turn, actor=actor)
                        return await client.post('/v1/evidence/status', content=request, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
                    active = launch('active', '1' * 64)
                    await asyncio.wait_for(started.wait(), 1)
                    target = launch('queued', '2' * 64) if queued else active
                    if queued:
                        for _ in range(100):
                            if (await status(target)).status_code == 202: break
                            await asyncio.sleep(.01)
                        else: self.fail('queued turn not admitted')
                    target[1].put_nowait({'type': 'http.disconnect'})
                    if queued:
                        await asyncio.wait_for(target[0], 1)
                        self.assertEqual((await status(target)).json()['code'], 'provider_unavailable')
                    else:
                        await asyncio.sleep(.02)
                        self.assertEqual((await status(target)).json()['code'], 'pending')
                    release.set()
                    await asyncio.wait_for(active[0], 1)
                    self.assertEqual((await status(active)).json()['state'], 'complete')
                    self.assertEqual(calls, ['active'])

class QueueTests(unittest.TestCase):
    def test_one_active_four_queued_and_one_per_actor(self):
        release = threading.Event(); entered = threading.Event(); calls = []
        async def provider(question, fragments):
            calls.append(question); entered.set()
            await asyncio.to_thread(release.wait)
            return {'selections': [], 'usage': {'modelCalls': 1, 'inputTokens': 1, 'outputTokens': 1, 'costNanoUsd': 0}}
        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(secret=SECRET, journal_path=str(Path(tmp) / 'journal.sqlite'), provider=provider, clock=lambda: 1000)
            with TestClient(app) as client, concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                futures = []
                def send(raw, token, path='/v1/evidence/select'):
                    return client.post(path, content=raw, headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json'})
                try:
                    for i in range(5):
                        actor = format(i + 1, '064x'); turn = str(uuid.uuid4())
                        raw = body({'version': 1, 'turnId': turn, 'productSku': 'x8266', 'question': 'Which MCU?', 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
                        token, _ = capability(raw, turn=turn, actor=actor)
                        futures.append(pool.submit(send, raw, token))
                        if i == 0: self.assertTrue(entered.wait(2))
                        status = body({'version': 1, 'turnId': turn, 'requestBodySha256': hashlib.sha256(raw).hexdigest()})
                        deadline = time.monotonic() + 3
                        while True:
                            token, _ = capability(status, 'readturn', turn=turn, actor=actor)
                            if send(status, token, '/v1/evidence/status').status_code == 202: break
                            if time.monotonic() > deadline: self.fail('turn not admitted')
                            time.sleep(.01)
                    extra_turn = str(uuid.uuid4())
                    extra = body({'version': 1, 'turnId': extra_turn, 'productSku': 'x8266', 'question': 'Question?', 'fragments': [{'handle': 'h', 'text': 'ESP8266'}]})
                    token, _ = capability(extra, turn=extra_turn, actor=format(6, '064x'))
                    self.assertEqual(send(extra, token).json()['code'], 'busy')
                    token, _ = capability(extra, turn=extra_turn, actor=format(1, '064x'))
                    self.assertEqual(send(extra, token).json()['code'], 'busy')
                    self.assertEqual(len(calls), 1)
                finally:
                    release.set()
                self.assertEqual([future.result(timeout=5).status_code for future in futures], [200] * 5)
                self.assertEqual(len(calls), 5)

if __name__ == '__main__':
    unittest.main()
