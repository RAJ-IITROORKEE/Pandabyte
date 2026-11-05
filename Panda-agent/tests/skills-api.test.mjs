import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true };
  if (specifier === './lightweight-connection') return { url: 'data:text/javascript,export%20const%20authenticateLightweight%3Dasync()%3D%3EglobalThis.testSkillsActor%3Bexport%20const%20currentLightweightSession%3Dasync()%3D%3Etrue', shortCircuit: true };
  if (specifier === '../lightweight/client') return nextResolve('../lightweight/client.ts', context);
  return nextResolve(specifier, context);
} });
const { skillsPATCH } = await import('../src/server/skills-api.ts');
const valid = '{"skillId":"embedded-project-guide","action":"review","bundleVersion":1,"expectedVersion":0,"reason":"review"}';
const request = body => new Request('https://example.test/api/admin/panda-agent/skills', { method: 'PATCH', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body });

test('malformed, duplicate-key and invalid UTF-8 return 400 without an RPC', async () => {
  let calls = 0;
  globalThis.testSkillsActor = { subject: 'actor', sessionId: 'session', client: { database: { rpc: async () => { calls++; return { data: {}, error: null }; } } } };
  for (const body of ['{', '{"skillId":"a","skillId":"b"}', new Uint8Array([0xff])]) {
    const response = await skillsPATCH(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid' });
  }
  assert.equal(calls, 0);
  const response = await skillsPATCH(request(valid));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test('authorization and backend failure keep their existing responses', async () => {
  globalThis.testSkillsActor = null;
  assert.equal((await skillsPATCH(request(valid))).status, 401);
  globalThis.testSkillsActor = { subject: 'actor', sessionId: 'session', client: { database: { rpc: async () => { throw Error('offline'); } } } };
  assert.equal((await skillsPATCH(request(valid))).status, 503);
});
