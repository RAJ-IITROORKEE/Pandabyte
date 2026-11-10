import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeProviderGateway } from '../src/opencode/native-provider-gateway.ts';
const token = 'a'.repeat(64);
const body = { model: 'openai/gpt-6-luna', stream: true, messages: [{ role: 'system', content: 'Native system' }, { role: 'user', content: 'Earlier' }, { role: 'assistant', content: 'History' }, { role: 'user', content: 'Now' }] };
async function fixture(run, overrides = {}) {
  const calls = [], receipts = [];
  const gateway = createNativeProviderGateway({ token, signal: new AbortController().signal,
    authorize: async bodyHash => ({ owner: 'owner', rootRun: 'root', session: 'session', message: 'message', step: 'step', kind: 'main', bodyHash }),
    current: async () => true, reserve: async () => true,
    complete: async (messages, before) => { assert.equal(await before(), true); calls.push(messages); return { content: 'answer', usage: { inputTokens: 10, outputTokens: 5, costNanoUsd: 100 } }; },
    receipt: async (binding, usage) => { receipts.push({ binding, usage }); }, ...overrides });
  const url = await gateway.listen();
  const send = (value = body, authorization = token) => fetch(url + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  try { await run({ send, calls, receipts }); } finally { await gateway.close(); }
}
test('native system and history reach trusted transport once and receipt precedes response', async () => fixture(async ({send,calls,receipts}) => {
  const response = await send(); assert.equal(response.status, 200); assert.match(await response.text(), /answer/); assert.deepEqual(calls, [body.messages]); assert.equal(receipts.length, 1);
  const replay = await send(); assert.equal(replay.status, 409); await replay.body.cancel();
}));
test('foreign, tool, auxiliary, oversized, revoked and exhausted calls do not dispatch', async () => {
  await fixture(async ({send,calls}) => { const r = await send(body, 'b'.repeat(64)); assert.equal(r.status,401); await r.body.cancel(); assert.equal(calls.length,0); });
  await fixture(async ({send,calls}) => { for (const b of [{...body,tools:[{type:'function'}]}, {...body,messages:[{role:'user',content:'x'.repeat(10000)}]}]) { const r=await send(b); assert.equal(r.status,400); await r.body.cancel(); } assert.equal(calls.length,0); });
  for (const override of [{ authorize: async () => null }, { current: async () => false }, { reserve: async () => false }]) await fixture(async ({send,calls}) => { const r=await send(); assert.equal(r.status,403); await r.body.cancel(); assert.equal(calls.length,0); }, override);
});
test('failed or revoked send cannot be retried or release a response', async () => {
  await fixture(async ({send}) => { const r=await send(); assert.equal(r.status,503); await r.body.cancel(); const replay=await send(); assert.equal(replay.status,409); await replay.body.cancel(); }, { complete: async () => { throw Error('429 or unknown'); } });
  let current = true;
  await fixture(async ({send}) => { const r=await send(); assert.equal(r.status,503); assert.doesNotMatch(await r.text(), /secret/); }, { current: async () => current, complete: async (_m,before) => { await before(); current=false; return { content:'secret',usage:{inputTokens:1,outputTokens:1,costNanoUsd:1} }; } });
});

test('authorization sees a deeply immutable transcript and cannot mutate what reaches completion', async () => {
  let observed;
  await fixture(async ({send,calls}) => { const r = await send(); assert.equal(r.status,200); await r.body.cancel(); assert.deepEqual(calls,[body.messages]); assert.deepEqual(observed,body.messages); },
    { authorize: async (bodyHash, messages) => { observed = messages; assert.equal(Object.isFrozen(messages),true); assert.equal(Object.isFrozen(messages[0]),true); assert.throws(() => { messages[0].content = 'modified'; }, TypeError); return {owner:'owner',rootRun:'root',session:'session',message:'message',step:'step',kind:'main',bodyHash}; } });
});
test('unrecognized auxiliary transcript is denied by trusted admission', async () => {
  await fixture(async ({send,calls}) => { const r=await send({...body,messages:[{role:'user',content:'Generate title'}]}); assert.equal(r.status,403); await r.body.cancel(); assert.equal(calls.length,0); }, {authorize: async (_hash,messages) => JSON.stringify(messages) === JSON.stringify(body.messages) ? {owner:'o',rootRun:'r',session:'s',message:'m',step:'1',kind:'main',bodyHash:_hash} : null});
});
