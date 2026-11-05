import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createImageClient } from '../src/diagnostics/image-client.ts';

test('read requires a valid receipt and the authoritative image hash', async () => {
  const old = globalThis.fetch, secret = Buffer.alloc(32, 7), bytes = new Uint8Array([1, 2, 3]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const args = { subject: 'actor', sessionId: 'session', threadId: '12345678-1234-4123-8123-123456789abc', assetId: '22345678-1234-4123-8123-123456789abc', sha256, width: 1, height: 1, bytes: 3, expiresAt: Math.floor(Date.now()/1000)+100 };
  try {
    globalThis.fetch = async (_url, init) => {
      const claim = JSON.parse(Buffer.from(init.headers.Authorization.slice(7).split('.')[0], 'base64url').toString());
      const hash = createHash('sha256').update(bytes).digest('hex');
      const receipt = createHmac('sha256', secret).update(`panda-image-response-v1\n${claim.nonce}\n200\n${hash}\nimage/png`).digest('hex');
      return new Response(bytes, { headers: { 'content-type': 'image/png', 'X-Panda-Image-Receipt': receipt } });
    };
    const client = createImageClient({ baseUrl: 'http://127.0.0.1:8080', secret });
    assert.deepEqual((await client.read(args)).bytes, bytes);
    await assert.rejects(client.read({ ...args, sha256: 'a'.repeat(64) }));
  } finally { globalThis.fetch = old; }
});

test('signed JSON cannot use another action response union', async () => {
  const old = globalThis.fetch, secret = Buffer.alloc(32, 7), sha256 = 'a'.repeat(64);
  const args = { subject: 'actor', sessionId: 'session', threadId: '12345678-1234-4123-8123-123456789abc', assetId: '22345678-1234-4123-8123-123456789abc', sha256, width: 1, height: 1, bytes: 3, expiresAt: Math.floor(Date.now()/1000)+100 };
  try {
    globalThis.fetch = async (_url, init) => {
      const claim = JSON.parse(Buffer.from(init.headers.Authorization.slice(7).split('.')[0], 'base64url').toString());
      const raw = JSON.stringify({ version: 1, state: 'ready', assetId: args.assetId, expiresAt: args.expiresAt, width: 1, height: 1, bytes: 3, sha256 });
      const digest = createHash('sha256').update(raw).digest('hex');
      const receipt = createHmac('sha256', secret).update(`panda-image-response-v1\n${claim.nonce}\n200\n${digest}\napplication/json`).digest('hex');
      return new Response(raw, { headers: { 'content-type': 'application/json', 'X-Panda-Image-Receipt': receipt } });
    };
    await assert.rejects(createImageClient({ baseUrl: 'http://127.0.0.1:8080', secret }).delete(args));
  } finally { globalThis.fetch = old; }
});
