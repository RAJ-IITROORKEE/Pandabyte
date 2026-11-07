import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const origin = 'http://localhost:3001';
const admin = { allowed: true, subject: 'fixture-owner', sessionId: 'fixture-session' };
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/control-room/playground-tool-fixture.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function fixture({ access = [admin, admin], env = {}, upstream = { toolStatus: 'completed', toolCalls: 1 } } = {}) {
  const exports = {}, calls = [];
  runInNewContext(outputText, {
    exports, URL, Response, AbortSignal,
    process: { env: {
      NODE_ENV: 'development',
      PANDA_PLAYGROUND_FIXTURE_PORT: '10001', PANDA_PLAYGROUND_FIXTURE_TOKEN: 'a'.repeat(64),
      PANDA_PLAYGROUND_FIXTURE_OWNER: createHash('sha256').update(admin.subject).digest('hex'),
      PANDA_PLAYGROUND_FIXTURE_EXPIRES: String(Date.now() + 60_000), ...env,
    } },
    require: name => name === './clerk' ? { controlRoomAdminAccess: async () => access.shift() }
      : name === 'node:crypto' ? { createHash } : {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      const body = JSON.stringify(upstream);
      return new Response(body, { headers: { 'content-length': String(body.length) } });
    },
  });
  return { ...exports, calls };
}

function request({ query = '?case=allow', headers = {}, body } = {}) {
  return new Request(origin + '/api/admin/panda-agent/playground/tool-fixture' + query, {
    method: 'POST', headers: { origin, ...headers }, body, duplex: 'half',
  });
}

test('a bodyless Next POST stream reaches only the fixed loopback case and returns only tool evidence', async () => {
  const probe = fixture({ upstream: { toolStatus: 'completed', toolCalls: 1, internal: 'discard' } });
  const response = await probe.playgroundToolFixturePOST(request({ body: new ReadableStream({ start: stream => stream.close() }) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { toolStatus: 'completed', toolCalls: 1 });
  assert.equal(probe.calls.length, 1);
  assert.equal(probe.calls[0].url, 'http://127.0.0.1:10001/allow');
  assert.equal(probe.calls[0].options.redirect, 'error');
});

test('production, other owners, invalid requests and unauthorized users cannot spend a case', async () => {
  for (const [setup, input, status] of [
    [{ env: { NODE_ENV: 'production' } }, {}, 404],
    [{ env: { PANDA_PLAYGROUND_FIXTURE_EXPIRES: '1' } }, {}, 404],
    [{ access: [{ ...admin, subject: 'other' }] }, {}, 404],
    [{ access: [{ allowed: false, status: 401 }] }, {}, 401],
    [{ access: [{ allowed: false, status: 403 }] }, {}, 403],
    [{}, { headers: { origin: 'https://example.invalid' } }, 403],
    [{}, { query: '?case=allow&case=deny' }, 400],
    [{}, { headers: { 'content-length': '2' }, body: '{}' }, 400],
  ]) {
    const probe = fixture(setup);
    assert.equal((await probe.playgroundToolFixturePOST(request(input))).status, status);
    assert.equal(probe.calls.length, 0);
  }
});

test('a result is withheld if the session changes or the observed dispatch contradicts the case', async () => {
  const changed = fixture({ access: [admin, { ...admin, sessionId: 'another-session' }] });
  assert.equal((await changed.playgroundToolFixturePOST(request())).status, 403);
  assert.equal(changed.calls.length, 1);
  const mismatched = fixture({ upstream: { toolStatus: 'error', toolCalls: 1 } });
  assert.equal((await mismatched.playgroundToolFixturePOST(request({ query: '?case=deny' }))).status, 503);
});
