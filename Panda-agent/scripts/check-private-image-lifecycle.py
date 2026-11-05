#!/usr/bin/env python3
"""Opt-in synthetic private-wire check. Run inside the worker container only."""
import argparse
import base64
import hashlib
import hmac
import http.client
import json
import os
import socket
import stat
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aT8AAAAASUVORK5CYII=')
ROOT = Path('/tmp/panda-diagnostic-images')

def digest(value):
    return hashlib.sha256(value).hexdigest()

def encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')

def compact(value):
    return json.dumps(value, separators=(',', ':')).encode('utf-8')

def ident():
    return str(uuid.uuid4())

class Probe:
    def __init__(self, secret, port=8080, root=ROOT):
        if len(secret) < 32:
            raise RuntimeError('secret unavailable')
        self.secret = secret
        self.port = port
        self.root = root
        self.receipts = 0
        self.fixtures = []

    def fixture(self, lifetime=120):
        fixture = {'actor': digest(uuid.uuid4().bytes), 'session': digest(uuid.uuid4().bytes), 'thread': ident(), 'asset': ident(), 'expires': int(time.time()) + lifetime}
        self.fixtures.append(fixture)
        return fixture

    def prepare(self, action, fixture, *, actor=None, thread=None, image=PNG):
        thread = thread or fixture['thread']
        body = image if action == 'upload' else compact({'version': 1, 'threadId': thread, 'assetId': fixture['asset']})
        nonce = ident()
        claim = {'v': 1, 'aud': 'panda-image-v1', 'action': action + 'image', 'sub': actor or fixture['actor'], 'sid': fixture['session'], 'threadId': thread, 'assetId': fixture['asset'], 'bodySha256': digest(body), 'imageSha256': digest(image if action == 'upload' else PNG), 'mediaType': 'image/png', 'width': 1, 'height': 1, 'bytes': len(image if action == 'upload' else PNG), 'expiresAt': fixture['expires'], 'exp': int(time.time()) + 50, 'nonce': nonce}
        segment = encode(compact(claim))
        token = segment + '.' + encode(hmac.new(self.secret, segment.encode('ascii'), hashlib.sha256).digest())
        headers = {'authorization': 'Bearer ' + token, 'content-type': 'image/png' if action == 'upload' else 'application/json', 'content-length': str(len(body))}
        return body, nonce, headers

    def receive(self, response, nonce):
        body = response.read(2097153)
        if len(body) > 2097152:
            raise AssertionError('response bound')
        content_type = response.getheader('content-type')
        if content_type not in ('application/json', 'image/png'):
            raise AssertionError('response type')
        message = f'panda-image-response-v1\n{nonce}\n{response.status}\n{digest(body)}\n{content_type}'.encode()
        expected = hmac.new(self.secret, message, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(response.getheader('x-panda-image-receipt') or '', expected):
            raise AssertionError('response receipt')
        self.receipts += 1
        return response.status, body if content_type == 'image/png' else json.loads(body.decode('utf-8'))

    def send(self, action, body, nonce, headers):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=8)
        try:
            conn.request('POST', '/v1/images/' + action, body=body, headers=headers)
            return self.receive(conn.getresponse(), nonce)
        finally:
            conn.close()

    def call(self, action, fixture, **kwargs):
        body, nonce, headers = self.prepare(action, fixture, **kwargs)
        return self.send(action, body, nonce, headers)

    def path(self, fixture):
        # The leaf is generated locally as a UUID and cannot select another file.
        return self.root / fixture['asset']

    def cleanup(self):
        failures = 0
        for fixture in self.fixtures:
            try:
                check(self.call('delete', fixture), 200, 'deleted')
                if self.path(fixture).exists(): failures += 1
            except Exception:
                failures += 1
        return failures == 0

def check(result, status, state):
    actual, body = result
    if actual != status or not isinstance(body, dict) or body.get('version') != 1 or body.get('state') != state:
        raise AssertionError('unexpected state')
    return body

def run(probe):
    checks = 0
    if not ROOT.is_dir() or ROOT.is_symlink() or any(ROOT.iterdir()):
        raise AssertionError('shared scratch not empty')
    first = probe.fixture()
    check(probe.call('upload', first), 200, 'ready'); checks += 1
    path = probe.path(first)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode): raise AssertionError('not regular')
    check(probe.call('upload', first), 200, 'ready')
    if path.lstat().st_mtime_ns != before.st_mtime_ns: raise AssertionError('replay rewrote file')
    checks += 1
    check(probe.call('status', first), 200, 'ready'); checks += 1
    body, nonce, headers = probe.prepare('status', first)
    check(probe.send('status', body, nonce, headers), 200, 'ready')
    replay = check(probe.send('status', body, nonce, headers), 409, 'rejected')
    if replay.get('code') != 'replayed': raise AssertionError('nonce replay')
    checks += 1
    if probe.call('read', first) != (200, PNG): raise AssertionError('read mismatch')
    checks += 1
    if probe.call('read', {**first, 'session': digest(uuid.uuid4().bytes)}) != (200, PNG): raise AssertionError('same owner session mismatch')
    checks += 1
    check(probe.call('read', first, actor=digest(uuid.uuid4().bytes)), 410, 'missing')
    check(probe.call('read', first, thread=ident()), 410, 'missing'); checks += 2
    check(probe.call('delete', first, actor=digest(uuid.uuid4().bytes)), 200, 'deleted')
    if probe.call('read', first) != (200, PNG): raise AssertionError('foreign delete changed owner asset')
    checks += 1
    result = check(probe.call('upload', first, image=PNG+b'x'), 409, 'rejected')
    if result.get('code') != 'conflict': raise AssertionError('changed hash')
    checks += 1
    check(probe.call('delete', first), 200, 'deleted')
    result = check(probe.call('upload', first), 409, 'rejected')
    if result.get('code') != 'conflict' or path.exists(): raise AssertionError('delete fence')
    checks += 1

    # Hold a real HTTP upload after reservation, then delete before releasing its body.
    held = probe.fixture()
    body, nonce, headers = probe.prepare('upload', held)
    conn = http.client.HTTPConnection('127.0.0.1', probe.port, timeout=8)
    try:
        conn.putrequest('POST', '/v1/images/upload')
        for key, value in headers.items(): conn.putheader(key, value)
        conn.endheaders(); conn.send(body[:1])
        until = time.monotonic() + 4
        while True:
            status, value = probe.call('status', held)
            if status == 202 and value.get('state') == 'pending': break
            if time.monotonic() >= until: raise AssertionError('pending barrier')
            time.sleep(0.05)
        check(probe.call('delete', held), 200, 'deleted')
        conn.send(body[1:])
        result = check(probe.receive(conn.getresponse(), nonce), 409, 'rejected')
        if result.get('code') != 'conflict' or probe.path(held).exists(): raise AssertionError('late writer')
        checks += 1
    finally:
        conn.close()

    # No status/read/delete RPC after this upload until the file has disappeared.
    expiring = probe.fixture(lifetime=2)
    check(probe.call('upload', expiring), 200, 'ready')
    expiring_path = probe.path(expiring)
    if not expiring_path.is_file(): raise AssertionError('expiry fixture missing')
    deadline = time.monotonic() + 70
    while expiring_path.exists() and time.monotonic() < deadline:
        time.sleep(0.5)
    if expiring_path.exists(): raise AssertionError('janitor did not unlink')
    checks += 1
    check(probe.call('status', expiring), 410, 'expired'); checks += 1
    return {'checksPassed': checks, 'receiptsVerified': probe.receipts, 'janitorPhysicalUnlink': True, 'fixtureLeaseSeconds': 2, 'regularFixtureLeaseSeconds': 120, 'publicBffLeaseSeconds': 900, 'source': 'synthetic private HTTP; no Clerk or InsForge claim', 'quota': 'not exercised to avoid exhausting shared worker quota', 'restartAndFlagOff': 'not exercised'}

def flag_off_janitor():
    # These are existing worker-image libraries; all data lives in a new temp directory.
    from fastapi import FastAPI
    import uvicorn
    from lightweight.app import Journal
    from lightweight.images import create_image_router

    with tempfile.TemporaryDirectory(prefix='panda-image-probe-') as temporary:
        root = Path(temporary) / 'images'
        journal = Journal(str(Path(temporary) / 'journal.sqlite'))
        enabled = [True]
        secret = os.urandom(32)
        router, cache = create_image_router(secret, journal, root=str(root), upload_enabled=lambda: enabled[0])
        @asynccontextmanager
        async def lifespan(_app):
            await cache.start()
            try:
                yield
            finally:
                await cache.close()
        app = FastAPI(lifespan=lifespan)
        app.include_router(router)
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(('127.0.0.1', 0)); listener.listen(16)
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False, lifespan='on'))
        thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
        try:
            thread.start()
            deadline = time.monotonic() + 10
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.02)
            if not server.started: raise AssertionError('fixture server failed')
            probe = Probe(secret, port=port, root=root)
            fixture = probe.fixture(lifetime=2)
            check(probe.call('upload', fixture), 200, 'ready')
            path = probe.path(fixture)
            if not path.is_file(): raise AssertionError('fixture missing')
            enabled[0] = False
            # Observe only the file until the normal 60-second janitor has removed it.
            deadline = time.monotonic() + 70
            while path.exists() and time.monotonic() < deadline:
                time.sleep(0.5)
            if path.exists(): raise AssertionError('flag-off janitor did not unlink')
            check(probe.call('status', fixture), 410, 'expired')
            other = probe.fixture()
            denied = check(probe.call('upload', other), 503, 'rejected')
            if denied.get('code') != 'unavailable' or probe.path(other).exists(): raise AssertionError('flag-off upload')
            return {'checksPassed': 3, 'receiptsVerified': probe.receipts, 'janitorPhysicalUnlinkWhileUploadDisabled': True, 'fixtureLeaseSeconds': 2, 'publicBffLeaseSeconds': 900, 'source': 'isolated loopback worker-library fixture; separate temporary journal/cache; no Clerk or InsForge claim'}
        finally:
            server.should_exit = True
            if thread.is_alive(): thread.join(timeout=10)
            listener.close()
            if thread.is_alive(): raise RuntimeError('fixture server did not stop')
            journal.close()

def quota_fixture():
    # Isolated ephemeral worker-library server: never opens the running service journal.
    from fastapi import FastAPI
    import uvicorn
    from lightweight.app import Journal
    from lightweight.images import create_image_router

    with tempfile.TemporaryDirectory(prefix='panda-image-quota-') as temporary:
        root = Path(temporary) / 'images'
        journal = Journal(str(Path(temporary) / 'journal.sqlite'))
        secret = os.urandom(32)
        router, cache = create_image_router(secret, journal, root=str(root), upload_enabled=True)
        @asynccontextmanager
        async def lifespan(_app):
            await cache.start()
            try:
                yield
            finally:
                await cache.close()
        app = FastAPI(lifespan=lifespan)
        app.include_router(router)
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(('127.0.0.1', 0)); listener.listen(16)
        server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False, lifespan='on'))
        thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
        try:
            thread.start()
            deadline = time.monotonic() + 10
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.02)
            if not server.started: raise AssertionError('fixture server failed')
            probe = Probe(secret, port=listener.getsockname()[1], root=root)
            first = probe.fixture(); actor = first['actor']
            check(probe.call('upload', first), 200, 'ready')
            second = probe.fixture(); second['actor'] = actor
            check(probe.call('upload', second), 200, 'ready')

            # Third owner reservation is held mid-body; fourth admission races it.
            third = probe.fixture(); third['actor'] = actor
            body, nonce, headers = probe.prepare('upload', third)
            connection = http.client.HTTPConnection('127.0.0.1', probe.port, timeout=8)
            try:
                connection.putrequest('POST', '/v1/images/upload')
                for key, value in headers.items(): connection.putheader(key, value)
                connection.endheaders(); connection.send(body[:1])
                deadline = time.monotonic() + 4
                while True:
                    status, value = probe.call('status', third)
                    if status == 202 and value.get('state') == 'pending': break
                    if time.monotonic() >= deadline: raise AssertionError('pending barrier')
                    time.sleep(0.05)
                fourth = probe.fixture(); fourth['actor'] = actor
                busy = check(probe.call('upload', fourth), 503, 'rejected')
                if busy.get('code') != 'busy': raise AssertionError('active upload')
                connection.send(body[1:])
                check(probe.receive(connection.getresponse(), nonce), 200, 'ready')
            finally:
                connection.close()
            if journal.db.execute('SELECT count(*) FROM image_cache WHERE actor=?', (actor,)).fetchone()[0] != 3:
                raise AssertionError('actor overadmission')
            # A new UUID is a fresh explicit request, not a retry of the raced admission.
            fifth = probe.fixture(); fifth['actor'] = actor
            limited = check(probe.call('upload', fifth), 429, 'rejected')
            if limited.get('code') != 'quota': raise AssertionError('actor quota')

            for _ in range(13):
                check(probe.call('upload', probe.fixture()), 200, 'ready')
            if journal.db.execute('SELECT count(*) FROM image_cache').fetchone()[0] != 16:
                raise AssertionError('global count')
            limited = check(probe.call('upload', probe.fixture()), 429, 'rejected')
            if limited.get('code') != 'quota': raise AssertionError('global quota')
            return {'checksPassed': 5, 'receiptsVerified': probe.receipts, 'actorCap': 3, 'globalAssetCap': 16, 'concurrentAdmission': 'held third succeeded; competing fourth busy', 'byteLimit': '32 MiB aggregate byte-cap not exercised', 'source': 'isolated loopback worker-library fixture; separate temporary journal/cache; no Clerk or InsForge claim'}
        finally:
            server.should_exit = True
            if thread.is_alive(): thread.join(timeout=10)
            listener.close()
            if thread.is_alive(): raise RuntimeError('fixture server did not stop')
            journal.close()

def main():
    parser = argparse.ArgumentParser(description='Synthetic private image lifecycle check')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--run', action='store_true', help='perform bounded worker-local test')
    group.add_argument('--expect-disabled', action='store_true', help='verify upload refusal when operator already disabled it')
    group.add_argument('--flag-off-janitor', action='store_true', help='isolated temporary worker-library janitor fixture')
    group.add_argument('--quota-fixture', action='store_true', help='isolated temporary worker-library quota fixture')
    args = parser.parse_args()
    probe = None
    try:
        if args.flag_off_janitor:
            result = flag_off_janitor()
            print(json.dumps({'ok': True, **result, 'temporaryFixtureRemoved': True}, separators=(',', ':')))
            return 0
        if args.quota_fixture:
            result = quota_fixture()
            print(json.dumps({'ok': True, **result, 'temporaryFixtureRemoved': True}, separators=(',', ':')))
            return 0
        probe = Probe(os.environ.get('PANDA_LIGHTWEIGHT_SECRET', '').encode('utf-8'))
        if args.expect_disabled:
            fixture = probe.fixture()
            denied = check(probe.call('upload', fixture), 503, 'rejected')
            if denied.get('code') != 'unavailable' or probe.path(fixture).exists(): raise AssertionError('upload not disabled')
            # Disabled uploads do not reserve an asset or require a deletion tombstone.
            probe.fixtures.clear()
            result = {'checksPassed': 1, 'receiptsVerified': probe.receipts, 'flagOffUploadRefused': True, 'source': 'synthetic private HTTP; no Clerk or InsForge claim'}
        else:
            result = run(probe)
        if not probe.cleanup(): raise AssertionError('fixture cleanup')
        probe.fixtures.clear()
        print(json.dumps({'ok': True, **result, 'fixtureFilesRemoved': True}, separators=(',', ':')))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'private_image_probe_failed'}, separators=(',', ':')))
        return 1
    finally:
        if probe: probe.cleanup()
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
