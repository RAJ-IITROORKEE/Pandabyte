import base64
import hashlib
import hmac
import json
import tempfile
import time
import unittest
import uuid
import asyncio
import concurrent.futures
import threading
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import ClientDisconnect
from lightweight.app import Journal
from lightweight.images import create_image_router, append_bounded

SECRET = b'k' * 32
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aT8AAAAASUVORK5CYII=')

class ImageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.journal = Journal(self.tmp.name + '/journal')
        self.enabled = True
        self.mono = 0
        router, self.cache = create_image_router(SECRET, self.journal, self.tmp.name + '/images', upload_enabled=lambda: self.enabled, monotonic=lambda: self.mono)
        @asynccontextmanager
        async def lifespan(_):
            await self.cache.start()
            yield
            await self.cache.close()
        app = FastAPI(lifespan=lifespan); app.include_router(router)
        self.client = TestClient(app); self.client.__enter__()
        self.thread, self.asset = str(uuid.uuid4()), str(uuid.uuid4())
        self.image_hash = hashlib.sha256(PNG).hexdigest(); self.expiry = int(time.time()) + 100

    def tearDown(self):
        self.client.__exit__(None, None, None); self.journal.close(); self.tmp.cleanup()

    def call(self, action, owner='a' * 64, nonce=None, session='b' * 64, overrides=None, thread=None, image=PNG):
        thread = thread or self.thread
        body = image if action == 'upload' else json.dumps({'version': 1, 'threadId': thread, 'assetId': self.asset}, separators=(',', ':')).encode()
        claim = {'v': 1, 'aud': 'panda-image-v1', 'action': action + 'image', 'sub': owner, 'sid': session, 'threadId': thread, 'assetId': self.asset, 'bodySha256': hashlib.sha256(body).hexdigest(), 'imageSha256': hashlib.sha256(image).hexdigest() if action == 'upload' else self.image_hash, 'mediaType': 'image/png', 'width': 1, 'height': 1, 'bytes': len(image), 'expiresAt': self.expiry, 'exp': int(time.time()) + 60, 'nonce': nonce or str(uuid.uuid4())}
        if overrides: claim.update(overrides)
        segment = base64.urlsafe_b64encode(json.dumps(claim, separators=(',', ':')).encode()).rstrip(b'=')
        signature = base64.urlsafe_b64encode(hmac.new(SECRET, segment, hashlib.sha256).digest()).rstrip(b'=')
        return self.client.post('/v1/images/' + action, content=body, headers={'authorization': 'Bearer ' + segment.decode() + '.' + signature.decode(), 'content-type': 'image/png' if action == 'upload' else 'application/json'})

    def test_owned_read_delete_and_nonce_replay(self):
        self.assertEqual(self.call('upload').json()['state'], 'ready')
        self.assertEqual(self.call('read').content, PNG)
        self.assertEqual(self.call('read', owner='c'*64).json()['state'], 'missing')
        self.assertEqual(self.call('read', thread=str(uuid.uuid4())).json()['state'], 'missing')
        self.assertEqual(self.call('delete', owner='c'*64).json()['state'], 'deleted')
        self.assertEqual(self.call('read', session='d'*64).content, PNG)
        nonce = str(uuid.uuid4())
        self.assertEqual(self.call('status', nonce=nonce).status_code, 200)
        self.assertEqual(self.call('status', nonce=nonce).json()['code'], 'replayed')
        self.assertEqual(self.call('delete').json()['state'], 'deleted')
        self.assertEqual(self.call('upload').json()['code'], 'conflict')
        self.assertEqual(self.call('read').json()['state'], 'deleted')

    def test_held_upload_cannot_resurrect_after_delete(self):
        reserved, release = threading.Event(), threading.Event()
        async def pause():
            reserved.set()
            await asyncio.to_thread(release.wait, 5)
        self.cache.on_reserved = pause
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(self.call, 'upload')
            try:
                self.assertTrue(reserved.wait(3))
                self.assertEqual(self.call('status').json()['state'], 'pending')
                self.assertEqual(self.call('delete').json()['state'], 'deleted')
            finally:
                release.set()
            self.assertEqual(pending.result(timeout=5).json()['code'], 'conflict')
        self.assertFalse((Path(self.tmp.name) / 'images' / self.asset).exists())

    def test_expiry_denies_and_physically_unlinks(self):
        self.expiry = int(time.time()) + 2
        self.assertEqual(self.call('upload').json()['state'], 'ready')
        path = Path(self.tmp.name) / 'images' / self.asset
        self.assertTrue(path.exists())
        self.cache.clock = lambda: self.expiry + 1
        self.assertEqual(self.call('read').json()['state'], 'expired')
        self.assertFalse(path.exists())

    def test_actor_quota_and_receipt(self):
        nonce = str(uuid.uuid4())
        result = self.call('upload', nonce=nonce)
        expected = hmac.new(SECRET, f'panda-image-response-v1\n{nonce}\n200\n{hashlib.sha256(result.content).hexdigest()}\napplication/json'.encode(), hashlib.sha256).hexdigest()
        self.assertEqual(result.headers['x-panda-image-receipt'], expected)
        for _ in range(2):
            self.asset = str(uuid.uuid4())
            self.assertEqual(self.call('upload').status_code, 200)
        self.asset = str(uuid.uuid4())
        self.assertEqual(self.call('upload').json()['code'], 'quota')

    def test_claim_scope_and_restart_never_recover_old_scratch(self):
        self.assertEqual(self.call('upload', overrides={'aud': 'panda-lightweight-evidence-v1'}).status_code, 401)
        self.assertEqual(self.call('upload', overrides={'width': True}).status_code, 401)
        self.assertEqual(self.call('upload').status_code, 200)
        self.assertEqual(self.call('status', overrides={'imageSha256': 'c' * 64}).json()['code'], 'conflict')
        self.client.__exit__(None, None, None)
        self.client.__enter__()
        self.assertEqual(self.call('read').json()['state'], 'deleted')
        self.assertFalse((Path(self.tmp.name) / 'images' / self.asset).exists())

    def test_duplicate_claim_and_wrong_signature_are_not_authenticated(self):
        body = json.dumps({'version': 1, 'threadId': self.thread, 'assetId': self.asset}, separators=(',', ':')).encode()
        claim = {'v': 1, 'aud': 'panda-image-v1', 'action': 'statusimage', 'sub': 'a'*64, 'sid': 'b'*64, 'threadId': self.thread, 'assetId': self.asset, 'bodySha256': hashlib.sha256(body).hexdigest(), 'imageSha256': self.image_hash, 'mediaType': 'image/png', 'width': 1, 'height': 1, 'bytes': len(PNG), 'expiresAt': self.expiry, 'exp': int(time.time()) + 60, 'nonce': str(uuid.uuid4())}
        raw = json.dumps(claim, separators=(',', ':')).encode()[:-1] + b',"v":1}'
        segment = base64.urlsafe_b64encode(raw).rstrip(b'=')
        sig = base64.urlsafe_b64encode(hmac.new(SECRET, segment, hashlib.sha256).digest()).rstrip(b'=')
        headers = {'authorization': 'Bearer ' + segment.decode() + '.' + sig.decode(), 'content-type': 'application/json'}
        response = self.client.post('/v1/images/status', content=body, headers=headers)
        self.assertEqual(response.status_code, 401)
        self.assertNotIn('x-panda-image-receipt', response.headers)
        headers['authorization'] = 'Bearer ' + segment.decode() + '.' + base64.urlsafe_b64encode(b'x'*32).rstrip(b'=').decode()
        self.assertEqual(self.client.post('/v1/images/status', content=body, headers=headers).status_code, 401)

    def test_global_quota_counts_distinct_actors(self):
        for index in range(16):
            self.asset = str(uuid.uuid4())
            self.assertEqual(self.call('upload', owner=f'{index:064x}').status_code, 200)
        self.asset = str(uuid.uuid4())
        self.assertEqual(self.call('upload', owner='f' * 64).json()['code'], 'quota')

    def test_expiry_while_upload_is_held_fences_final_write(self):
        self.expiry = int(time.time()) + 3
        reserved, release = threading.Event(), threading.Event()
        async def pause():
            reserved.set()
            await asyncio.to_thread(release.wait, 5)
        self.cache.on_reserved = pause
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(self.call, 'upload')
            try:
                self.assertTrue(reserved.wait(3))
                self.cache.clock = lambda: self.expiry + 1
            finally:
                release.set()
            self.assertEqual(pending.result(timeout=5).json()['code'], 'conflict')
        self.assertFalse((Path(self.tmp.name) / 'images' / self.asset).exists())

    def test_single_oversized_chunk_is_rejected_before_buffer_changes(self):
        data = bytearray(b'ab')
        with self.assertRaises(ValueError): append_bounded(data, b'c' * 10, 8)
        self.assertEqual(data, b'ab')

    def test_disabled_upload_still_allows_control_and_physical_sweep(self):
        self.expiry = int(time.time()) + 2
        self.assertEqual(self.call('upload').status_code, 200)
        first = self.asset
        self.asset = str(uuid.uuid4())
        self.assertEqual(self.call('upload').status_code, 200)
        second = self.asset
        self.enabled = False
        self.asset = str(uuid.uuid4())
        rejected = self.call('upload')
        self.assertEqual(rejected.status_code, 503)
        self.assertEqual(rejected.json()['code'], 'unavailable')
        self.assertIn('x-panda-image-receipt', rejected.headers)
        self.asset = first
        self.assertEqual(self.call('read').content, PNG)
        self.assertEqual(self.call('status').json()['state'], 'ready')
        self.assertEqual(self.call('delete').json()['state'], 'deleted')
        self.cache.clock = lambda: self.expiry + 1
        self.client.portal.call(self.cache.sweep)
        self.assertFalse((Path(self.tmp.name) / 'images' / second).exists())
        self.asset = second
        self.assertEqual(self.call('status').json()['state'], 'expired')

    def test_cancelled_upload_stays_pending_until_explicit_delete(self):
        async def cancel(): raise asyncio.CancelledError()
        self.cache.on_reserved = cancel
        try:
            self.call('upload')
        except (asyncio.CancelledError, concurrent.futures.CancelledError):
            pass
        self.cache.on_reserved = None
        self.assertEqual(self.call('status').json()['state'], 'pending')
        self.assertEqual(self.call('upload').json()['code'], 'conflict')
        self.assertEqual(self.call('delete').json()['state'], 'deleted')

    def test_disconnected_upload_is_unconfirmed_and_not_replayed(self):
        async def disconnect(): raise ClientDisconnect()
        self.cache.on_reserved = disconnect
        self.assertEqual(self.call('upload').status_code, 503)
        self.cache.on_reserved = None
        self.assertEqual(self.call('status').json()['state'], 'pending')
        self.assertEqual(self.call('upload').json()['code'], 'conflict')
        self.assertEqual(self.call('delete').json()['state'], 'deleted')

    def test_monotonic_expiry_unlinks_even_after_wall_clock_rollback(self):
        self.expiry = int(time.time()) + 10
        self.assertEqual(self.call('upload').status_code, 200)
        path = Path(self.tmp.name) / 'images' / self.asset
        self.cache.clock = lambda: time.time() - 100
        self.mono = 11
        self.client.portal.call(self.cache.sweep)
        self.assertFalse(path.exists())
        self.cache.clock = time.time
        self.assertEqual(self.call('read').json()['state'], 'expired')

    def test_ready_upload_replay_is_idempotent_but_changed_metadata_conflicts(self):
        self.assertEqual(self.call('upload').json()['state'], 'ready')
        path = Path(self.tmp.name) / 'images' / self.asset
        before = path.stat().st_mtime_ns
        self.assertEqual(self.call('upload').json()['state'], 'ready')
        self.assertEqual(path.stat().st_mtime_ns, before)
        self.assertEqual(self.call('upload', overrides={'width': 2}).json()['code'], 'conflict')
        self.assertEqual(self.call('upload', image=PNG + b'x').json()['code'], 'conflict')

    def test_ready_replay_does_not_override_concurrent_delete(self):
        self.assertEqual(self.call('upload').status_code, 200)
        reserved, release = threading.Event(), threading.Event()
        async def pause():
            reserved.set()
            await asyncio.to_thread(release.wait, 5)
        self.cache.on_reserved = pause
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(self.call, 'upload')
            try:
                self.assertTrue(reserved.wait(3))
                self.assertEqual(self.call('delete').json()['state'], 'deleted')
            finally:
                release.set()
            self.assertEqual(pending.result(timeout=5).json()['code'], 'conflict')
        self.assertFalse((Path(self.tmp.name) / 'images' / self.asset).exists())

    def test_absent_delete_fences_late_upload_even_when_quota_full(self):
        now = int(time.time())
        self.expiry = now + 1
        self.assertEqual(self.call('upload', owner='0'*64).status_code, 200)
        self.expiry = now + 100
        for index in range(1, 16):
            self.asset = str(uuid.uuid4())
            self.assertEqual(self.call('upload', owner=f'{index:064x}').status_code, 200)
        self.asset = str(uuid.uuid4())
        owner = 'f'*64
        self.assertEqual(self.call('delete', owner=owner).json()['state'], 'deleted')
        self.cache.clock = lambda: now + 67
        self.mono = 67
        self.client.portal.call(self.cache.sweep)
        self.cache.clock = time.time
        self.assertEqual(self.call('upload', owner=owner).json()['code'], 'conflict')
        self.assertFalse((Path(self.tmp.name) / 'images' / self.asset).exists())

    def test_wall_clock_jump_does_not_collect_live_tombstone(self):
        self.assertEqual(self.call('delete').json()['state'], 'deleted')
        self.cache.clock = lambda: self.expiry + 100
        self.client.portal.call(self.cache.sweep)
        self.cache.clock = time.time
        self.assertEqual(self.call('upload').json()['code'], 'conflict')
        self.assertFalse((Path(self.tmp.name) / 'images' / self.asset).exists())
