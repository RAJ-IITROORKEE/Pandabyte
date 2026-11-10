import test from 'node:test';
import assert from 'node:assert/strict';
import { createBasicLlmRelay } from '../src/opencode/basic-llm-relay.ts';

const token = 'a'.repeat(64), question = 'Explain I2C briefly.';
const body = () => ({ model: 'openai/gpt-6-luna', stream: true, messages: [{ role: 'system', content: 'Untrusted native builtin prompt' }, { role: 'user', content: [{ type: 'text', text: question }] }] });
async function fixture(run, options = {}) {
  const calls = []; const controller = new AbortController();
  const relay = createBasicLlmRelay({ token, question, signal: controller.signal, current: options.current ?? (async () => true), complete: options.complete ?? (async (input, before, signal) => {
    calls.push(input); assert.equal(await before(), true); assert.equal(signal.aborted, false);
    return { answer: 'I2C is a two-wire serial bus.', usage: { inputTokens: 10, outputTokens: 10, costNanoUsd: 100 } };
  }) });
  const base = await relay.listen();
  const send = (value, headers = {}) => fetch(base + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  try { await run({ relay, send, calls, controller }); } finally { await relay.close(); }
}

test('one exact question strips native instructions/history and returns validated SSE once', async () => fixture(async ({ relay, send, calls }) => {
  const result = await send(body()); assert.equal(result.status, 200); const text = await result.text();
  assert.match(text, /I2C is a two-wire serial bus/); assert.match(text, /data: \[DONE\]/);
  assert.deepEqual(calls, [{ question }]);
  const second = await send(body()); assert.equal(second.status, 409); await second.body.cancel();
  assert.equal(calls.length, 1); assert.equal(relay.snapshot().attempts, 2);
}));

test('foreign token is denied without consuming the native instance admission', async () => fixture(async ({ send, calls }) => {
  const denied = await send(body(), { Authorization: 'Bearer ' + 'b'.repeat(64) }); assert.equal(denied.status, 401); await denied.body.cancel();
  const allowed = await send(body()); assert.equal(allowed.status, 200); await allowed.body.cancel(); assert.equal(calls.length, 1);
}));

test('answer length has its own limit, independent of the question limit', async () => {
  for (const length of [2001, 10000, 10001]) {
    const complete = async () => ({ answer: 'x'.repeat(length), usage: { inputTokens: 1, outputTokens: 1, costNanoUsd: 1 } });
    await fixture(async ({ send, relay }) => {
      const response = await send(body());
      assert.equal(response.status, length <= 10000 ? 200 : 503);
      assert.equal(relay.snapshot().result?.answer.length ?? 0, length <= 10000 ? length : 0);
      await response.body.cancel();
    }, { complete });
  }
});

test('tools, altered question, history, wrong model and auxiliary requests fail closed', async () => {
  const cases = [v => ({ ...v, tools: [{ type: 'function', function: { name: 'read_file' } }] }), v => ({ ...v, model: 'other' }),
    v => ({ ...v, messages: [{ role: 'user', content: 'Generate title' }] }), v => ({ ...v, messages: [...v.messages, { role: 'assistant', content: 'Earlier' }] }),
    v => ({ ...v, messages: [...v.messages, { role: 'user', content: question }] })];
  for (const change of cases) await fixture(async ({ send, calls }) => {
    const denied = await send(change(body())); assert.ok([400, 403].includes(denied.status)); await denied.body.cancel();
    const retry = await send(body()); assert.equal(retry.status, 409); await retry.body.cancel(); assert.equal(calls.length, 0);
  });
});

test('revoked actor, cancellation and uncertain provider result cannot retry or release', async () => {
  await fixture(async ({ send, calls }) => { const r = await send(body()); assert.equal(r.status, 403); await r.body.cancel(); assert.equal(calls.length, 0); }, { current: async () => false });
  await fixture(async ({ send, controller, calls }) => { controller.abort(); const r = await send(body()); assert.equal(r.status, 503); await r.body.cancel(); assert.equal(calls.length, 0); });
  let posts = 0;
  await fixture(async ({ send }) => { const r = await send(body()); assert.equal(r.status, 503); await r.body.cancel(); const second = await send(body()); assert.equal(second.status, 409); await second.body.cancel(); assert.equal(posts, 1); }, { complete: async () => { posts++; throw Error('uncertain'); } });
});

test('actor revoked during provider roundtrip releases no answer', async () => {
  let current = true;
  await fixture(async ({ relay, send }) => { const r = await send(body()); assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /secret answer/); assert.equal(relay.snapshot().result, null); },
    { current: async () => current, complete: async () => { current = false; return { answer: 'secret answer', usage: { inputTokens: 1, outputTokens: 1, costNanoUsd: 1 } }; } });
});
