import test from 'node:test';
import assert from 'node:assert/strict';
import { createBasicRagCompletion, BasicRagProviderError } from '../src/server/basic-rag-openrouter.ts';

const model = 'xingchen-agi/xing4.0-29b-a4b:free';
const input = { question: 'Which MCU does this listing name?', passages: [{ rank: 1, text: 'The disposable listing names MCU TEST8266.' }] };
function fixture(options = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/endpoints/zdr')) return Response.json({ data: [{ model_id: model, tag: 'phala', safety_retention: options.retention ?? false }, ...(options.zdrExtra ?? [])] });
    if (url.endsWith('/endpoints')) return Response.json({ data: { endpoints: [{ tag: 'phala', pricing: { prompt: '0', completion: options.price ?? '0' }, supported_parameters: options.parameters ?? ['max_tokens', 'temperature', 'response_format', 'reasoning'] }, ...(options.catalogExtra ?? [])] } });
    return options.response?.() ?? Response.json({ model, provider: 'Phala', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: 'The listing names TEST8266.', evidence: [{ rank: 1, quote: 'MCU TEST8266', reason: 'Identifies the MCU.' }] }) } }], usage: { prompt_tokens: 40, completion_tokens: 25, cost: options.cost ?? 0 } });
  };
  let claims = 0;
  return { calls, get claims() { return claims; }, complete: createBasicRagCompletion({ apiKey: 'synthetic-credential-never-used-live', fetcher,
    policyCurrent: async () => options.policyHook ? options.policyHook() : options.policyCurrent ?? true,
    dispatchCurrent: options.dispatchCurrent ?? (() => true), claim: async () => { claims++; return options.claim ?? true; } }) };
}
test('one completion pins free strict-ZDR route, disables reasoning and exposes only checked usage', async () => {
  const f = fixture();
  const result = await f.complete(input, async () => true, new AbortController().signal);
  assert.equal(f.claims, 1);
  assert.equal(f.calls.length, 3);
  const body = JSON.parse(f.calls[2].init.body);
  assert.deepEqual(body.provider, { only: ['phala'], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: 0, completion: 0, request: 0, image: 0 } });
  assert.equal(body.model, model); assert.deepEqual(body.reasoning, { enabled: false });
  assert.deepEqual(body.plugins, []); assert.equal(body.tools, undefined); assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 700); assert.equal(body.messages.length, 2);
  assert.deepEqual(result.usage, { inputTokens: 40, outputTokens: 25, costNanoUsd: 0 });
  assert.equal(result.evaluation.evidence[0].quote, 'MCU TEST8266');
  await assert.rejects(f.complete(input, async () => true, new AbortController().signal), BasicRagProviderError);
  assert.equal(f.calls.length, 3);
});
test('validated question and passages are captured before asynchronous policy checks', async () => {
  const source = structuredClone(input);
  const f = fixture({ policyHook: async () => { source.question = 'changed'; source.passages[0].text = 'changed'; return true; } });
  await f.complete(source, async () => true, new AbortController().signal);
  const posted = JSON.parse(JSON.parse(f.calls[2].init.body).messages[1].content);
  assert.deepEqual(posted, input);
});
test('privacy, current sources, durable claim and fresh endpoint policy all gate the only POST', async () => {
  for (const options of [{ policyCurrent: false }, { retention: true }, { price: '0.001' }, { parameters: ['max_tokens', 'response_format'] }, { claim: false }]) {
    const f = fixture(options);
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal));
    assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
  }
  const f = fixture();
  await assert.rejects(f.complete(input, async () => false, new AbortController().signal));
  assert.equal(f.claims, 1); assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
});
test('unexpected Phala endpoint variants fail closed before claiming or sending', async () => {
  for (const options of [
    { catalogExtra: [{ tag: 'phala/extra' }] },
    { catalogExtra: [{ tag: 'Phala/extra' }] },
    { zdrExtra: [{ model_id: model, tag: 'phala/extra', safety_retention: false }] },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal), e => e.code === 'not_admitted');
    assert.equal(f.claims, 0);
    assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
  }
  const unrelated = fixture({ catalogExtra: [{ tag: 'other/extra' }], zdrExtra: [{ model_id: 'other:free', tag: 'phala/extra', safety_retention: false }] });
  assert.ok(await unrelated.complete(input, async () => true, new AbortController().signal));
});
test('synchronous dispatch lease is rechecked after source validation and before POST', async () => {
  let current = true;
  const f = fixture({ policyHook: async () => current, dispatchCurrent: () => current });
  await assert.rejects(f.complete(input, async () => { current = false; return true; }, new AbortController().signal), e => e.code === 'not_admitted');
  assert.equal(f.claims, 1);
  assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('withdrawal during the last slow policy check is caught by one final source check', async () => {
  let checks = 0, withdrawn = false, sourceChecks = 0;
  const f = fixture({ policyHook: async () => { await Promise.resolve(); if (++checks === 3) withdrawn = true; return true; } });
  await assert.rejects(f.complete(input, async () => { sourceChecks++; return !withdrawn; }, new AbortController().signal), e => e.code === 'not_admitted');
  assert.equal(checks, 3); assert.equal(sourceChecks, 1); assert.equal(f.claims, 1);
  assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('final source check is called once and no async policy work follows it', async () => {
  let sourceChecks = 0, afterSourcePolicy = 0, dispatchChecks = 0;
  const f = fixture({ policyHook: async () => { if (sourceChecks) afterSourcePolicy++; return true; }, dispatchCurrent: () => { dispatchChecks++; return true; } });
  await f.complete(input, async () => { sourceChecks++; return true; }, new AbortController().signal);
  assert.equal(sourceChecks, 1); assert.equal(afterSourcePolicy, 0); assert.equal(dispatchChecks, 1);
});
test('HTTP 200 pure embedded 429 is terminal while mixed outcomes remain unknown', async () => {
  for (const [value, code] of [
    [{ error: { code: 429, message: 'private provider message' } }, 'rate_limited'],
    [{ error: { code: 429 }, choices: [] }, 'outcome_unknown'],
    [{ error: { code: 429 }, usage: {} }, 'outcome_unknown'],
    [{ error: { code: 429 }, openrouter_metadata: {} }, 'outcome_unknown'],
    [{ error: { code: 429 }, id: 'ambiguous-completion' }, 'outcome_unknown'],
    [{ error: { code: 429 }, model, provider: 'Phala', choices: [{ finish_reason: 'stop', message: { content: '{"answer":"","evidence":[]}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }, 'outcome_unknown'],
    [{ error: { code: '429' } }, 'outcome_unknown'],
  ]) {
    const f = fixture({ response: () => Response.json(value) });
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal), e => e instanceof BasicRagProviderError && e.code === code && !e.message.includes('private'));
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal), e => e.code === 'not_admitted');
    assert.equal(f.claims, 1);
    assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 1);
  }
});
test('429 and lost responses never retry and never return a fabricated answer or zero-cost receipt', async () => {
  for (const response of [() => Response.json({ error: { message: 'private provider diagnostic' } }, { status: 429 }), () => { throw Error('private transport error'); }]) {
    const f = fixture({ response });
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal), e => e instanceof BasicRagProviderError && !e.message.includes('private'));
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal));
    assert.equal(f.claims, 1); assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 1);
  }
});
test('nonzero cost, wrong provider, tools, malformed/duplicate JSON and unsupported output cannot release', async () => {
  const good = { model, provider: 'Phala', choices: [{ finish_reason: 'stop', message: { content: '{"answer":"","evidence":[]}' } }], usage: { prompt_tokens: 20, completion_tokens: 15, cost: 0 } };
  const bad = [
    { ...good, usage: { ...good.usage, cost: 0.001 } }, { ...good, provider: 'Other' }, { ...good, model: 'other:free' },
    { ...good, choices: [{ finish_reason: 'length', message: good.choices[0].message }] },
    { ...good, choices: [{ finish_reason: 'stop', message: { ...good.choices[0].message, tool_calls: [{}] } }] },
    { ...good, choices: [{ finish_reason: 'stop', message: { content: '{"answer":"","answer":"forged","evidence":[]}' } }] },
    { ...good, choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] },
    { ...good, choices: [{ finish_reason: 'stop', message: { ...good.choices[0].message, reasoning: 'private reasoning' } }] },
  ];
  for (const value of bad) {
    const f = fixture({ response: () => Response.json(value) });
    await assert.rejects(f.complete(input, async () => true, new AbortController().signal));
    assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 1);
  }
});
