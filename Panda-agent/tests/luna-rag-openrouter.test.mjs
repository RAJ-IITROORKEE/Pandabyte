import test from 'node:test';
import assert from 'node:assert/strict';
import { createLunaRagCompletion, validateLunaRagResponse, lunaRagModel, lunaRagReportedModel, lunaRagReservationNanoUsd } from '../src/server/luna-rag-openrouter.ts';

const input = { question: 'Which MCU?', passages: [{ rank: 1, text: 'This disposable listing names MCU TEST8266.' }] };
const endpoint = () => ({ tag: 'azure/us', model_id: lunaRagModel, name: 'Azure | ' + lunaRagReportedModel, provider_name: 'Azure',
  pricing: { prompt: '0.00000011', completion: '0.00000055', web_search: '0.01', input_cache_read: '0.000000011', input_cache_write: '0.0000001375', discount: 0,
    overrides: [{ min_prompt_tokens: 272000, prompt: '0.00000022', completion: '0.000000825' }] },
  context_length: 1050000, max_completion_tokens: 128000, max_prompt_tokens: null, status: 0, supports_implicit_caching: false,
  supports_tool_choice: { none: true }, supported_parameters: ['reasoning', 'include_reasoning', 'max_completion_tokens', 'tool_choice', 'response_format'] });
const receipt = () => ({ model: lunaRagReportedModel, provider: 'Azure', choices: [{ finish_reason: 'stop', message: {
  content: JSON.stringify({ answer: 'The listing names TEST8266.', evidence: [{ rank: 1, quote: 'MCU TEST8266', reason: 'Names the MCU.' }] }) } }],
  usage: { prompt_tokens: 40, completion_tokens: 25, cost: 0.00001815 } });
function fixture(options = {}) {
  const calls = []; let claims = 0;
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/endpoints/zdr')) return Response.json({ data: [{ model_id: lunaRagModel, tag: 'azure/us', safety_retention: false, ...options.zdr }, ...(options.zdrExtra ?? [])] });
    if (url.endsWith('/endpoints')) return Response.json({ data: { id: lunaRagModel, architecture: { tokenizer: 'GPT' }, endpoints: [options.endpoint ?? endpoint(), ...(options.extra ?? [])] } });
    return options.response ? options.response() : Response.json(receipt());
  };
  return { calls, get claims() { return claims; }, complete: createLunaRagCompletion({ apiKey: 'synthetic-never-live', fetcher,
    policyCurrent: async () => options.policy ? options.policy() : true,
    dispatchCurrent: options.dispatchCurrent ?? (() => true), claim: async () => { claims++; return options.claim ?? true; } }) };
}
const run = (f, source = input, before = async () => true) => f.complete(source, before, new AbortController().signal);
const posts = f => f.calls.filter(c => c.init.method === 'POST');

test('one claimed Azure US request pins strict ZDR and actual bounded usage', async () => {
  const f = fixture(); const result = await run(f);
  assert.equal(f.claims, 1); assert.equal(posts(f).length, 1);
  const body = JSON.parse(posts(f)[0].init.body);
  assert.equal(body.model, lunaRagModel); assert.equal(body.max_completion_tokens, 700);
  assert.equal(body.max_tokens, undefined); assert.equal(body.temperature, undefined);
  assert.deepEqual(body.provider, { only: ['azure/us'], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: 0.11, completion: 0.55, request: 0, image: 0 } });
  assert.deepEqual(body.reasoning, { enabled: false }); assert.equal(body.include_reasoning, false);
  assert.equal(body.tool_choice, 'none'); assert.equal(body.tools, undefined); assert.deepEqual(body.plugins, []);
  assert.equal(posts(f)[0].init.headers['X-OpenRouter-Cache'], 'false');
  assert.deepEqual(result.usage, { inputTokens: 40, outputTokens: 25, costNanoUsd: 18150 });
  assert.equal(lunaRagReservationNanoUsd, 1597640);
  assert.equal(3 * 2697640 + lunaRagReservationNanoUsd, 9690560);
  assert.ok(3 * 2697640 + lunaRagReservationNanoUsd < 10000000);
  await assert.rejects(run(f), e => e.code === 'not_admitted'); assert.equal(posts(f).length, 1);
});

test('serialized bytes including escaping and multibyte text gate before any claim', async () => {
  for (const text of ['界'.repeat(3500), '\\'.repeat(5000), 'a'.repeat(10000)]) {
    const f = fixture(); await assert.rejects(run(f, { ...input, passages: [{ rank: 1, text }] }), e => e.code === 'not_admitted');
    assert.equal(f.claims, 0); assert.equal(f.calls.length, 0);
  }
});

test('input snapshot cannot change during asynchronous policy validation', async () => {
  const source = structuredClone(input); const f = fixture({ policy: async () => { source.question = 'changed'; source.passages[0].text = 'changed'; return true; } });
  await run(f, source);
  assert.deepEqual(JSON.parse(JSON.parse(posts(f)[0].init.body).messages[1].content), input);
});

test('fresh exact endpoint identity, safe prices, byte tokenizer, variants and privacy fail closed', async () => {
  const changes = [
    { name: 'Azure | openai/gpt-6-luna-other' }, { provider_name: 'Other' }, { model_id: 'other' },
    { supports_implicit_caching: true }, { status: -1 }, { max_completion_tokens: 699 },
    { supported_parameters: ['response_format'] }, { supports_tool_choice: { none: false } },
    { pricing: { ...endpoint().pricing, prompt: '0.00000012' } },
    { pricing: { ...endpoint().pricing, request: '0.001' } },
    { pricing: { ...endpoint().pricing, overrides: [{ min_prompt_tokens: 11024, prompt: '1' }] } },
  ];
  const cases = changes.map(change => ({ endpoint: { ...endpoint(), ...change } }));
  cases.push({ zdr: { safety_retention: true } }, { zdr: { tag: 'Azure/us' } }, { extra: [{ tag: 'azure/us/extra' }] },
    { extra: [{ tag: 'Azure/US' }] }, { extra: [endpoint()] }, { zdrExtra: [{ model_id: lunaRagModel, tag: 'azure/us/extra', safety_retention: false }] });
  for (const options of cases) {
    const f = fixture(options); await assert.rejects(run(f), e => e.code === 'not_admitted'); assert.equal(f.claims, 0); assert.equal(posts(f).length, 0);
  }
  const f = fixture({ extra: [{ tag: 'azure/eu' }, { tag: 'azure' }], zdrExtra: [{ model_id: 'other', tag: 'azure/us/extra' }] });
  assert.ok(await run(f));
});

test('durable admission, final source/actor validation and current policy gate POST', async () => {
  for (const options of [{ claim: false }, { policy: async () => false }]) {
    const f = fixture(options); await assert.rejects(run(f), e => e.code === 'not_admitted'); assert.equal(posts(f).length, 0);
  }
  let current = true; const f = fixture({ policy: async () => current, dispatchCurrent: () => current });
  await assert.rejects(run(f, input, async () => { current = false; return true; }), e => e.code === 'not_admitted');
  assert.equal(f.claims, 1); assert.equal(posts(f).length, 0);
  const denied = fixture(); await assert.rejects(run(denied, input, async () => false)); assert.equal(denied.claims, 1); assert.equal(posts(denied).length, 0);
});

test('withdrawal during the last slow policy check is caught by one final source check', async () => {
  let checks = 0, withdrawn = false, sourceChecks = 0;
  const f = fixture({ policy: async () => { await Promise.resolve(); if (++checks === 3) withdrawn = true; return true; } });
  await assert.rejects(run(f, input, async () => { sourceChecks++; return !withdrawn; }), e => e.code === 'not_admitted');
  assert.equal(checks, 3); assert.equal(sourceChecks, 1); assert.equal(f.claims, 1); assert.equal(posts(f).length, 0);
});

test('final source check is called once and no async policy work follows it', async () => {
  let sourceChecks = 0, afterSourcePolicy = 0, dispatchChecks = 0;
  const f = fixture({ policy: async () => { if (sourceChecks) afterSourcePolicy++; return true; }, dispatchCurrent: () => { dispatchChecks++; return true; } });
  await run(f, input, async () => { sourceChecks++; return true; });
  assert.equal(sourceChecks, 1); assert.equal(afterSourcePolicy, 0); assert.equal(dispatchChecks, 1);
});

test('rate limits and uncertain outcomes spend the one claim without retry', async () => {
  for (const [response, code] of [
    [() => Response.json({}, { status: 429 }), 'rate_limited'],
    [() => Response.json({ error: { code: 429 } }), 'rate_limited'],
    [() => Response.json({ error: { code: 429 }, usage: {} }), 'outcome_unknown'],
    [() => { throw Error('private detail'); }, 'outcome_unknown'],
  ]) {
    const f = fixture({ response }); await assert.rejects(run(f), e => e.code === code && !e.message.includes('private'));
    await assert.rejects(run(f), e => e.code === 'not_admitted'); assert.equal(f.claims, 1); assert.equal(posts(f).length, 1);
  }
});

test('exact served identity, no tools/reasoning, JSON quotes and receipts gate released answer', async () => {
  const good = receipt(); const m = good.choices[0].message;
  const bad = [
    { ...good, model: 'openai/gpt-6-luna-20260923' }, { ...good, model: lunaRagReportedModel + '-other' }, { ...good, provider: 'Other' },
    ...[undefined, -1, 0.002697641, '0.00001'].map(cost => ({ ...good, usage: { ...good.usage, cost } })),
    ...[{ prompt_tokens: 11025 }, { completion_tokens: 701 }, { prompt_tokens: 1.5 },
      ...[null, [], { cached_tokens: 1 }, { cache_write_tokens: 1 }, { unknown_tokens: 0 }, { audio_tokens: 1 }, { video_tokens: '0' }]
        .map(prompt_tokens_details => ({ prompt_tokens_details })),
      ...[null, [], { reasoning_tokens: 1 }, { reasoning_tokens: '0' }, { reasoning_tokens: -1 }, { hidden_tokens: 0 }]
        .map(completion_tokens_details => ({ completion_tokens_details }))]
      .map(change => ({ ...good, usage: { ...good.usage, ...change } })),
    ...[{ tool_calls: [{}] }, { reasoning: 'private' }, { reasoning_details: [{}] }, { content: 'not JSON' },
      { content: '{"answer":"a","answer":"b","evidence":[]}' },
      { content: '{"answer":"invented","evidence":[{"rank":1,"quote":"absent","reason":"unsupported"}]}' }]
      .map(change => ({ ...good, choices: [{ finish_reason: 'stop', message: { ...m, ...change } }] })),
    { ...good, choices: [{ finish_reason: 'length', message: m }] },
  ];
  for (const value of bad) { const f = fixture({ response: () => Response.json(value) }); await assert.rejects(run(f), e => e.code === 'outcome_unknown'); assert.equal(posts(f).length, 1); }
});

test('actual decimal costs round upward to nanoUSD without binary multiplication error', async () => {
  for (const [cost, expected] of [[0.00159764, 1597640], [0.0000000001, 1], [0.00000000101, 2], [0, 0]]) {
    const value = receipt(); value.usage.cost = cost;
    const result = await run(fixture({ response: () => Response.json(value) })); assert.equal(result.usage.costNanoUsd, expected);
  }
});

test('explicit zero reasoning receipt is accepted without hiding billed reasoning', async () => {
  const value = receipt(); value.usage.completion_tokens_details = { reasoning_tokens: 0, image_tokens: 0, audio_tokens: 0, accepted_prediction_tokens: 0, rejected_prediction_tokens: 0 };
  value.usage.prompt_tokens_details = { cached_tokens: 0, cache_write_tokens: 0, audio_tokens: 0, video_tokens: 0 };
  assert.ok(await run(fixture({ response: () => Response.json(value) })));
});

test('only the exact catalog alias or pinned dated identity may reconcile a retained receipt offline', async () => {
  for (const model of [lunaRagModel, lunaRagReportedModel]) {
    const value = receipt(); value.model = model;
    assert.equal(validateLunaRagResponse(value, input.passages).usage.costNanoUsd, 18150);
    assert.ok(await run(fixture({ response: () => Response.json(value) })));
  }
  for (const model of ['openai/gpt-6-luna-20260923', lunaRagModel + '-extra', lunaRagReportedModel + '-extra']) {
    const value = receipt(); value.model = model;
    assert.throws(() => validateLunaRagResponse(value, input.passages), e => e.code === 'outcome_unknown');
  }
});
