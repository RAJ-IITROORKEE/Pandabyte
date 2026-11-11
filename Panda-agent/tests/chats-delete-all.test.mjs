import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLightweightHandler } from '../src/server/lightweight-handler.ts';

function fixture({ native } = {}) {
  let calls = 0;
  const store = { deleteAll: async () => { calls++; return { deleted: 7, skipped: 1 }; } };
  const deps = { enabled: () => true, authenticate: async () => ({ subject: 'OWNER', sessionId: 'SESSION', client: {} }), current: async () => true,
    store: () => store, products: async () => [], answer: async () => { throw Error('unused'); }, ...(native ? { native: () => ({}) } : {}) };
  return { handler: createLightweightHandler(deps), calls: () => calls };
}
const request = (init = {}) => new Request('http://localhost/api/panda-agent/chats', { method: 'DELETE', headers: { origin: 'http://localhost' }, ...init });

test('delete all returns deleted and skipped counts for the signed-in user', async () => {
  const f = fixture();
  const response = await f.handler.deleteAllDELETE(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: 7, skipped: 1 });
  assert.equal(f.calls(), 1);
});

test('delete all refuses other origins, wrong methods, a body and the native runtime', async () => {
  const f = fixture();
  assert.equal((await f.handler.deleteAllDELETE(request({ headers: { origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await f.handler.deleteAllDELETE(new Request('http://localhost/api/panda-agent/chats', { method: 'POST', headers: { origin: 'http://localhost' } }))).status, 405);
  assert.equal((await f.handler.deleteAllDELETE(request({ body: 'x', duplex: 'half' }))).status, 400);
  assert.equal(f.calls(), 0);
  const n = fixture({ native: true });
  assert.notEqual((await n.handler.deleteAllDELETE(request())).status, 200);
  assert.equal(n.calls(), 0);
});

test('the migration keeps pending chats and grants only signed-in users', () => {
  const sql = readFileSync(new URL('../migrations/20261112120000_panda-agent-chats-delete-all.sql', import.meta.url), 'utf8');
  assert.match(sql, /owner_subject=a/);
  assert.match(sql, /NOT EXISTS\(SELECT 1 FROM public\.panda_agent_chat_turns t WHERE t\.thread_id=c\.id AND t\.status='pending'\)/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.panda_agent_chats_delete_all\(\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.panda_agent_chats_delete_all\(\) TO authenticated;/);
});
