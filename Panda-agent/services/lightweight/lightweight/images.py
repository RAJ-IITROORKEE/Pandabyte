"""Private, bounded volatile image scratch. No customer authority lives here."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import stat
import struct
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response

MAX_BYTES = 2097152
HEX = re.compile(r'^[0-9a-f]{64}$')
SEG = re.compile(r'^[A-Za-z0-9_-]+$')
FIELDS = {'v','aud','action','sub','sid','threadId','assetId','bodySha256','imageSha256','mediaType','width','height','bytes','expiresAt','exp','nonce'}

def sha(data): return hashlib.sha256(data).hexdigest()
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
def unb64(value):
    if not SEG.fullmatch(value): raise ValueError('encoding')
    result = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    if b64(result) != value: raise ValueError('encoding')
    return result
def pairs(items):
    result = {}
    for key, value in items:
        if key in result: raise ValueError('duplicate')
        result[key] = value
    return result
def parse(raw):
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('number')))
    def validate(item):
        if isinstance(item, str): item.encode('utf-16-le')
        elif isinstance(item, list):
            for child in item: validate(child)
        elif isinstance(item, dict):
            for key, child in item.items(): validate(key); validate(child)
    validate(value)
    return value
def valid_uuid(value):
    try: return isinstance(value, str) and str(uuid.UUID(value)) == value
    except (ValueError, AttributeError): return False
def metadata(claim): return (claim['sub'], claim['threadId'], claim['imageSha256'], claim['width'], claim['height'], claim['bytes'], claim['expiresAt'])
def append_bounded(data, chunk, limit):
    if len(chunk) > limit - len(data): raise ValueError('too large')
    data.extend(chunk)

class ImageCache:
    def __init__(self, journal, root, clock=time.time, on_reserved=None, monotonic=time.monotonic):
        self.db = journal.db; self.root = Path(root); self.clock = clock; self.on_reserved = on_reserved; self.monotonic = monotonic; self.deadlines = {}
        self.lock = asyncio.Lock(); self.uploading = False; self.task = None; self.closed = True
        self.db.execute('CREATE TABLE IF NOT EXISTS image_cache (asset TEXT PRIMARY KEY, actor TEXT NOT NULL, thread TEXT NOT NULL, sha TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL)')

    def unlink(self, name):
        if not (valid_uuid(name) or (name.endswith('.tmp') and valid_uuid(name[:-4]))): return
        try: os.unlink(self.root / name)
        except FileNotFoundError: pass

    def expire(self):
        now = int(self.clock()); mono = self.monotonic()
        for asset, expires in self.db.execute("SELECT asset,expires FROM image_cache WHERE state IN ('pending','ready')").fetchall():
            if expires <= now or mono >= self.deadlines.get(asset, float('-inf')):
                self.db.execute("UPDATE image_cache SET state='expired' WHERE asset=?", (asset,)); self.unlink(asset); self.unlink(asset + '.tmp')
        for asset, in self.db.execute("SELECT asset FROM image_cache WHERE expires+65<=? AND state IN ('expired','deleted')", (now,)).fetchall():
            if mono >= self.deadlines.get(asset, float('inf')) + 65:
                self.db.execute('DELETE FROM image_cache WHERE asset=?', (asset,)); self.deadlines.pop(asset, None)

    async def sweep(self):
        async with self.lock: self.expire()

    async def start(self):
        if self.root.exists() and (self.root.is_symlink() or not self.root.is_dir()): raise RuntimeError('invalid image root')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True); os.chmod(self.root, 0o700)
        self.db.execute("UPDATE image_cache SET state='deleted' WHERE state IN ('pending','ready')")
        self.deadlines.clear()
        for entry in os.scandir(self.root): self.unlink(entry.name)
        # Retain restart tombstones conservatively even if wall time moved forward.
        self.deadlines.update({asset: self.monotonic() + 900 for asset, in self.db.execute('SELECT asset FROM image_cache')})
        self.expire()
        self.closed = False
        async def janitor():
            while True:
                await asyncio.sleep(60)
                await self.sweep()
        self.task = asyncio.create_task(janitor())

    async def close(self):
        if self.task:
            self.task.cancel()
            try: await self.task
            except asyncio.CancelledError: pass
            self.task = None
        async with self.lock:
            self.closed = True
            assets = self.db.execute("SELECT asset FROM image_cache WHERE state IN ('pending','ready')").fetchall()
            self.db.execute("UPDATE image_cache SET state='deleted' WHERE state IN ('pending','ready')")
            self.deadlines.clear()
            for asset, in assets: self.unlink(asset); self.unlink(asset + '.tmp')

    def row(self, claim):
        return self.db.execute('SELECT actor,thread,sha,width,height,bytes,expires,state FROM image_cache WHERE asset=?', (claim['assetId'],)).fetchone()

    def quota(self, claim):
        count, size = self.db.execute('SELECT count(*),coalesce(sum(bytes),0) FROM image_cache').fetchone()
        owned = self.db.execute('SELECT count(*) FROM image_cache WHERE actor=?', (claim['sub'],)).fetchone()[0]
        return count < 16 and owned < 3 and size + claim['bytes'] <= 32 * 1024 * 1024

    def reserve(self, claim, state):
        self.db.execute('INSERT INTO image_cache VALUES (?,?,?,?,?,?,?,?,?)', (claim['assetId'], *metadata(claim), state))
        self.deadlines[claim['assetId']] = self.monotonic() + min(900, max(0, claim['expiresAt'] - self.clock()))

    def read_file(self, asset, limit):
        fd = os.open(self.root / asset, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode): raise ValueError('invalid file')
            with os.fdopen(fd, 'rb', closefd=False) as source: data = source.read(limit + 1)
            if len(data) > limit: raise ValueError('too large')
            return data
        finally: os.close(fd)

def authenticate(request, action, secret, now):
    header = request.headers.get('authorization', '')
    if len(header) > 4096 or not header.startswith('Bearer '): raise ValueError('auth')
    token = header[7:].split('.')
    if len(token) != 2 or not hmac.compare_digest(unb64(token[1]), hmac.new(secret, token[0].encode('ascii'), hashlib.sha256).digest()): raise ValueError('auth')
    claim = parse(unb64(token[0]))
    if not isinstance(claim, dict) or set(claim) != FIELDS or type(claim['v']) is not int or claim['v'] != 1 or claim['aud'] != 'panda-image-v1' or claim['action'] != action + 'image' or claim['mediaType'] != 'image/png': raise ValueError('auth')
    if not all(isinstance(claim[k], str) and HEX.fullmatch(claim[k]) for k in ('sub','sid','bodySha256','imageSha256')) or not all(valid_uuid(claim[k]) for k in ('threadId','assetId','nonce')): raise ValueError('auth')
    if any(type(claim[k]) is not int for k in ('width','height','bytes','expiresAt','exp')) or not 1 <= claim['width'] <= 2048 or not 1 <= claim['height'] <= 2048 or claim['width'] * claim['height'] > 4194304 or not 1 <= claim['bytes'] <= MAX_BYTES or not now < claim['exp'] <= now + 60 or not 0 <= claim['expiresAt'] <= now + 900: raise ValueError('auth')
    if action == 'upload' and (claim['expiresAt'] <= now or claim['bodySha256'] != claim['imageSha256']): raise ValueError('auth')
    return claim

def create_image_router(secret, journal, root='/tmp/panda-diagnostic-images', *, clock=time.time, on_reserved=None, upload_enabled=True, monotonic=time.monotonic):
    if not isinstance(secret, bytes) or len(secret) < 32: raise ValueError('invalid secret')
    if not isinstance(upload_enabled, bool) and not callable(upload_enabled): raise ValueError('invalid upload flag')
    cache = ImageCache(journal, root, clock, on_reserved, monotonic); router = APIRouter()
    def respond(claim, status, value, content_type='application/json'):
        body = value if isinstance(value, bytes) else json.dumps(value, separators=(',', ':')).encode()
        receipt = hmac.new(secret, f"panda-image-response-v1\n{claim['nonce']}\n{status}\n{sha(body)}\n{content_type}".encode(), hashlib.sha256).hexdigest()
        return Response(body, status_code=status, headers={'Content-Type': content_type, 'X-Panda-Image-Receipt': receipt, 'Cache-Control': 'no-store'})
    def simple(claim, status, state, code=None):
        return respond(claim, status, {'version': 1, 'state': state, **({'code': code} if code else {})})
    async def bounded(request, limit):
        data = bytearray()
        async def receive():
            async for chunk in request.stream():
                append_bounded(data, chunk, limit)
            return bytes(data)
        return await asyncio.wait_for(receive(), 5)
    async def handle(request, action):
        try: claim = authenticate(request, action, secret, int(clock()))
        except (ValueError, TypeError, KeyError, UnicodeError): return Response(status_code=401)
        nonce = journal.nonce(claim['nonce'])
        if nonce: return simple(claim, 409 if nonce == 'capability_replayed' else 503, 'rejected', 'replayed' if nonce == 'capability_replayed' else 'busy')
        if cache.closed: return simple(claim, 503, 'rejected', 'unavailable')
        if action == 'upload' and (upload_enabled() if callable(upload_enabled) else upload_enabled) is not True: return simple(claim, 503, 'rejected', 'unavailable')
        if request.headers.get('content-type') != ('image/png' if action == 'upload' else 'application/json'): return simple(claim, 400, 'rejected', 'invalid')
        if action == 'upload':
            async with cache.lock:
                cache.expire(); row = cache.row(claim)
                if row and row[:2] != metadata(claim)[:2]: return simple(claim, 409, 'rejected', 'conflict')
                if row and (row[:7] != metadata(claim) or row[-1] != 'ready'): return simple(claim, 409, 'rejected', 'conflict')
                if cache.uploading: return simple(claim, 503, 'rejected', 'busy')
                replay = bool(row)
                if not replay:
                    if not cache.quota(claim): return simple(claim, 429, 'rejected', 'quota')
                    cache.reserve(claim, 'pending')
                cache.uploading = True
            try:
                if cache.on_reserved: await cache.on_reserved()
                body = await bounded(request, MAX_BYTES)
                if len(body) != claim['bytes'] or sha(body) != claim['imageSha256'] or len(body) < 24 or body[:8] != b'\x89PNG\r\n\x1a\n' or body[8:12] != b'\x00\x00\x00\r' or body[12:16] != b'IHDR' or struct.unpack('>II', body[16:24]) != (claim['width'], claim['height']): raise ValueError('invalid image')
                async with cache.lock:
                    cache.expire(); row = cache.row(claim)
                    if cache.closed or not row or row[:7] != metadata(claim) or row[-1] != ('ready' if replay else 'pending'): return simple(claim, 409, 'rejected', 'conflict')
                    if replay:
                        existing = cache.read_file(claim['assetId'], MAX_BYTES)
                        if len(existing) != claim['bytes'] or sha(existing) != claim['imageSha256']: return simple(claim, 503, 'rejected', 'unavailable')
                        return respond(claim, 200, {'version': 1, 'state': 'ready', 'assetId': claim['assetId'], 'expiresAt': claim['expiresAt'], 'width': claim['width'], 'height': claim['height'], 'bytes': claim['bytes'], 'sha256': claim['imageSha256']})
                    fd = os.open(cache.root / (claim['assetId'] + '.tmp'), os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                    try:
                        with os.fdopen(fd, 'wb') as out: out.write(body)
                        os.replace(cache.root / (claim['assetId'] + '.tmp'), cache.root / claim['assetId'])
                    except BaseException:
                        cache.unlink(claim['assetId'] + '.tmp'); raise
                    cache.db.execute("UPDATE image_cache SET state='ready' WHERE asset=? AND state='pending'", (claim['assetId'],))
                return respond(claim, 200, {'version': 1, 'state': 'ready', 'assetId': claim['assetId'], 'expiresAt': claim['expiresAt'], 'width': claim['width'], 'height': claim['height'], 'bytes': claim['bytes'], 'sha256': claim['imageSha256']})
            except (ValueError, asyncio.TimeoutError):
                async with cache.lock:
                    cache.db.execute("UPDATE image_cache SET state='deleted' WHERE asset=? AND state='pending'", (claim['assetId'],)); cache.unlink(claim['assetId'] + '.tmp')
                return simple(claim, 400, 'rejected', 'invalid')
            except OSError:
                async with cache.lock:
                    cache.db.execute("UPDATE image_cache SET state='deleted' WHERE asset=? AND state='pending'", (claim['assetId'],)); cache.unlink(claim['assetId'] + '.tmp')
                return simple(claim, 503, 'rejected', 'unavailable')
            finally:
                async with cache.lock: cache.uploading = False
        try:
            body = await bounded(request, 512)
            value = parse(body)
            if sha(body) != claim['bodySha256'] or value != {'version': 1, 'threadId': claim['threadId'], 'assetId': claim['assetId']} or type(value.get('version')) is not int: raise ValueError('invalid')
        except (ValueError, UnicodeError, AttributeError, asyncio.TimeoutError): return simple(claim, 400, 'rejected', 'invalid')
        async with cache.lock:
            cache.expire(); row = cache.row(claim)
            if row and row[:2] != metadata(claim)[:2]: return simple(claim, 200, 'deleted') if action == 'delete' else simple(claim, 410, 'missing')
            if row and row[:7] != metadata(claim): return simple(claim, 409, 'rejected', 'conflict')
            if action == 'delete':
                if not row:
                    # Each new tombstone consumed a unique nonce in the shared bounded journal.
                    cache.reserve(claim, 'deleted')
                else: cache.db.execute("UPDATE image_cache SET state='deleted' WHERE asset=?", (claim['assetId'],))
                cache.unlink(claim['assetId']); cache.unlink(claim['assetId'] + '.tmp')
                return simple(claim, 200, 'deleted')
            if not row: return simple(claim, 410, 'missing')
            if row[-1] in ('expired','deleted'): return simple(claim, 410, row[-1])
            if row[-1] == 'pending': return simple(claim, 202, 'pending')
            if action == 'status': return respond(claim, 200, {'version': 1, 'state': 'ready', 'assetId': claim['assetId'], 'expiresAt': claim['expiresAt'], 'width': claim['width'], 'height': claim['height'], 'bytes': claim['bytes'], 'sha256': claim['imageSha256']})
            try: data = cache.read_file(claim['assetId'], MAX_BYTES)
            except (OSError, ValueError): return simple(claim, 503, 'rejected', 'unavailable')
            if len(data) != claim['bytes'] or sha(data) != claim['imageSha256'] or int(clock()) >= claim['expiresAt']: return simple(claim, 503, 'rejected', 'unavailable')
            return respond(claim, 200, data, 'image/png')
    for name in ('upload', 'status', 'read', 'delete'):
        def route(action):
            async def endpoint(request: Request):
                try: return await handle(request, action)
                except Exception:
                    try: claim = authenticate(request, action, secret, int(clock()))
                    except (ValueError, TypeError, KeyError, UnicodeError): return Response(status_code=401)
                    return simple(claim, 503, 'rejected', 'unavailable')
            return endpoint
        router.add_api_route('/v1/images/' + name, route(name), methods=['POST'])
    return router, cache
