import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { compileOnService, parseCompileResponse } from '../src/device/compile-client.ts';

const bin = Buffer.from('firmware-bytes-0123456789');
const good = { ok: true, board: 'ESPXS3', fqbn: 'esp32:esp32:esp32s3', address: 0, size: bin.length, sha256: 'a'.repeat(64), binBase64: bin.toString('base64'), warnings: '', durationMs: 31000 };

test('compile client: signs timestamp.body with HMAC-SHA256 and parses a success', async () => {
  let seen;
  const fetcher = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify(good), { status: 200 }); };
  const r = await compileOnService({ url: 'https://example.lambda-url.ap-south-1.on.aws/', secret: 's'.repeat(40), board: 'ESPXS3', sketch: 'void setup(){} void loop(){}', signal: new AbortController().signal, fetcher, now: () => 1_800_000_000_000 });
  assert.equal(r.ok, true); assert.equal(r.size, bin.length);
  const ts = seen.init.headers['x-panda-timestamp'];
  assert.equal(ts, '1800000000');
  assert.equal(seen.init.headers['x-panda-signature'], createHmac('sha256', 's'.repeat(40)).update(`${ts}.${seen.init.body}`).digest('hex'));
  assert.deepEqual(JSON.parse(seen.init.body), { board: 'ESPXS3', sketch: 'void setup(){} void loop(){}' });
  assert.equal(seen.init.redirect, 'error');
});

test('compile client: compile errors pass through; malformed replies and HTTP errors throw', async () => {
  assert.deepEqual(parseCompileResponse({ ok: false, errors: 'sketch.ino:3: error: x' }), { ok: false, errors: 'sketch.ino:3: error: x' });
  for (const bad of [{ ...good, board: 'NOPE' }, { ...good, address: 4096 }, { ...good, sha256: 'xyz' }, { ...good, binBase64: 'AAAA' }, { ...good, size: 5 * 1024 * 1024 }, { ok: true }, null, []])
    assert.equal(parseCompileResponse(bad), null, JSON.stringify(bad)?.slice(0, 60));
  const call = status => compileOnService({ url: 'https://x/', secret: 's'.repeat(40), board: 'ESPXS3', sketch: 'x', signal: new AbortController().signal, fetcher: async () => new Response(status === 200 ? '{"ok":true}' : 'no', { status }) });
  await assert.rejects(call(401), /compile service 401/); await assert.rejects(call(200), /malformed/);
});
