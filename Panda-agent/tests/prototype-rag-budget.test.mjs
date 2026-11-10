import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createPrototypeRagBudget } from '../src/server/prototype-rag-budget.ts';

const key = 'a'.repeat(64), keySha256 = 'b'.repeat(64), workspaceSha256 = 'c'.repeat(64);
const budgetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', request = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const goodStatus = () => ({ enabled: true, limitNanoUsd: 1000000000, reservedNanoUsd: 10000000, remainingNanoUsd: 990000000,
  reservationNanoUsd: 1597640, model: 'openai/gpt-6-luna', provider: 'azure/us' });
function fixture() {
  const calls = []; let response;
  const actor = { subject: 'owner-test', client: { database: { rpc: async (name, args) => { calls.push({ name, args }); return response; } } } };
  const options = { actor, key, budgetId, keySha256, workspaceSha256 };
  return { calls, options, store: createPrototypeRagBudget(options), reply(value) { response = value; } };
}

test('status and reservation use a distinct owner-bound server signature and replay stays false', async () => {
  const f = fixture(); f.reply({ data: goodStatus(), error: null });
  assert.deepEqual(await f.store.status(), goodStatus());
  f.reply({ data: { execute: true }, error: null });
  assert.equal(await f.store.reserve({ request, surface: 'chat', fingerprint: 'd'.repeat(64) }), true);
  f.reply({ data: { execute: false }, error: null });
  assert.equal(await f.store.reserve({ request, surface: 'chat', fingerprint: 'd'.repeat(64) }), false);
  for (const [i, call] of f.calls.entries()) {
    const value = JSON.parse(call.args.p_payload);
    assert.equal(call.name, 'panda_agent_rag_budget_' + (i ? 'reserve' : 'status'));
    assert.equal(call.args.p_mac, createHmac('sha256', Buffer.from(key, 'hex')).update('panda-rag-budget-db-v1\n' + call.args.p_payload).digest('hex'));
    assert.equal(value.subject, 'owner-test'); assert.equal(value.budget, budgetId);
    assert.equal(value.keySha256, keySha256); assert.equal(value.workspaceSha256, workspaceSha256);
    assert.ok(value.exp >= Math.floor(Date.now() / 1000) && value.exp <= Math.floor(Date.now() / 1000) + 60);
    assert.deepEqual(Object.keys(value).sort(), (i ? ['action','budget','exp','fingerprint','keySha256','request','subject','surface','v','workspaceSha256']
      : ['action','budget','exp','keySha256','subject','v','workspaceSha256']).sort());
  }
});

test('malformed balances, configured identity and reservation inputs fail closed', async () => {
  for (const patch of [{limitNanoUsd:1000000001}, {reservedNanoUsd:-1}, {remainingNanoUsd:5}, {reservationNanoUsd:1},
    {enabled:'true'}, {provider:'other'}, {model:'openai/gpt-6-luna:free'}, {extra:'value'}]) {
    const f = fixture(); f.reply({ data: { ...goodStatus(), ...patch }, error: null }); await assert.rejects(f.store.status());
  }
  const f = fixture(); f.reply({ data: { execute: true, duplicate: true }, error: null });
  await assert.rejects(f.store.reserve({ request, surface:'chat', fingerprint:'d'.repeat(64) }));
  for (const invalid of [{request:request.toUpperCase(),surface:'chat',fingerprint:'d'.repeat(64)},
    {request,surface:'other',fingerprint:'d'.repeat(64)}, {request,surface:'chat',fingerprint:'secret'},
    {request,surface:'chat',fingerprint:'d'.repeat(64),amount:1}]) await assert.rejects(f.store.reserve(invalid));
  assert.equal(f.calls.length, 1);
  for (const changed of [{key:'abcd'}, {budgetId:'bad'}, {keySha256:'not-a-hash'}, {workspaceSha256:'D'.repeat(64)}])
    assert.throws(() => createPrototypeRagBudget({ ...f.options, ...changed }));
});

test('database errors do not expose details or retry an uncertain reservation', async () => {
  const f = fixture(); f.reply({ data: null, error: { code:'unexpected', message:'private provider data' } });
  await assert.rejects(f.store.reserve({ request, surface:'playground', fingerprint:'e'.repeat(64) }), error => !String(error).includes('private provider data'));
  assert.equal(f.calls.length, 1);
});
