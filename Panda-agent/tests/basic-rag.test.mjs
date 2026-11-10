import test from 'node:test';
import assert from 'node:assert/strict';
import { runBasicRag } from '../src/retrieval/basic-rag.ts';
import { createBasicRagCompletion, basicRagModel } from '../src/server/basic-rag-openrouter.ts';

const question = 'Which MCU does the x8266 use?';
const input = () => ({ question, signal: new AbortController().signal });

test('bounded paid receipt requires explicit test policy and does not change zero-cost default',async()=>{
 for(const policy of [undefined,'bounded_luna_test']){
  const f=fixture(),complete=f.deps.complete;f.deps.usagePolicy=policy;
  f.deps.complete=async(...args)=>{const r=await complete(...args);r.usage.costNanoUsd=20000;return r;};
  const r=await runBasicRag(input(),f.deps);
  assert.equal(r.status,policy?'answered':'unavailable');
  if(policy)assert.equal(r.usage.costNanoUsd,20000);
 }
 for(const usage of [{inputTokens:21025,outputTokens:20,costNanoUsd:20},{inputTokens:80,outputTokens:701,costNanoUsd:20},{inputTokens:80,outputTokens:20,costNanoUsd:2697641}]){
  const f=fixture(),complete=f.deps.complete;f.deps.usagePolicy='bounded_luna_test';f.deps.complete=async(...args)=>({...await complete(...args),usage});
  assert.equal((await runBasicRag(input(),f.deps)).status,'unavailable');
 }
});
function fixture() {
  let authorized = true, current = true, calls = 0;
  const context = {
    kind: 'ready',
    products: [{ id: 'private-product', sku: 'X8266', title: 'x8266' }],
    passages: [{ rank: 1, productSku: 'X8266', productTitle: 'x8266', title: 'x8266 listing',
      sourceUrl: 'https://www.pandabyte.in/product-page/x8266', capturedAt: '2026-11-04T00:00:00Z',
      sectionPath: ['Specifications'], text: 'The board uses the ESP8266 microcontroller.' }],
    sourceProofs: [{ productSku: 'X8266', fingerprint: 'private-fingerprint' }], digest: 'a'.repeat(64),
    revalidate: async () => current,
  };
  const deps = {
    authorize: async () => authorized,
    prepare: async () => context,
    complete: async (request, beforeSend) => {
      calls++;
      assert.equal(await beforeSend(), true);
      assert.deepEqual(request, { question, passages: [{ rank: 1, text: context.passages[0].text }] });
      return { evaluation: { answer: 'It uses the ESP8266.', evidence: [{ rank: 1, quote: 'ESP8266 microcontroller', reason: 'The listing names it.' }] },
        usage: { inputTokens: 80, outputTokens: 20, costNanoUsd: 0 } };
    },
  };
  return { context, deps, count: () => calls, revoke: () => { authorized = false; }, withdraw: () => { current = false; } };
}

test('an identical authorized context avoids redundant outer checks; other contexts keep them', async () => {
  for (const identity of ['same', 'different', 'missing']) {
    const f = fixture(); let checks = 0, reads = 0;
    const authorize = async () => { checks++; return true; };
    f.deps.authorize = authorize;
    if (identity !== 'missing') f.context.authorizedBy = identity === 'same' ? authorize : async () => true;
    f.context.revalidate = async () => { reads++; return await authorize() && await authorize(); };
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, 'answered'); assert.equal(reads, identity === 'same' ? 2 : 3);
    assert.equal(checks, identity === 'same' ? 6 : 14);
  }
});

test('revocation during preparation blocks model admission and scope-dependent outcomes', async () => {
  for (const kind of ['ready', 'clarification', 'insufficient']) {
    const f = fixture();
    f.context.authorizedBy = f.deps.authorize;
    f.deps.prepare = async () => {
      f.revoke();
      return kind === 'ready' ? f.context : { kind };
    };
    assert.equal((await runBasicRag(input(), f.deps)).status, 'unavailable', kind);
    assert.equal(f.count(), 0);
  }
});

test('matching context withholds a response when authorization changes during fresh source reads', async () => {
  const f = fixture(); let active = true;
  const authorize = async () => active;
  f.deps.authorize = authorize; f.context.authorizedBy = authorize;
  f.context.revalidate = async () => { if (!await authorize()) return false; active = false; return authorize(); };
  assert.equal((await runBasicRag(input(), f.deps)).status, 'unavailable');
  assert.equal(f.count(), 1);
});

test('matching context withholds late answers on source withdrawal or abort', async () => {
  for (const failure of ['withdrawn', 'aborted']) {
    const f = fixture(), controller = new AbortController(); let reads = 0, active = true;
    const authorize = async () => active;
    f.deps.authorize = authorize; f.context.authorizedBy = authorize;
    f.context.revalidate = async () => {
      if (!await authorize()) return false;
      if (++reads === 2) { if (failure === 'withdrawn') active = false; else controller.abort(); }
      return authorize();
    };
    const result = await runBasicRag({ question, signal: controller.signal }, f.deps);
    assert.equal(result.status, 'unavailable'); assert.equal(f.count(), 1); assert.equal('answer' in result, false);
  }
});

test('measures source validations and accepts only bounded integer provider timings', async () => {
  for (const [timing, expected] of [
    [{ admissionMs: 29, providerRoundTripMs: 11 }, [29, 11]], [{ admissionMs: 0, providerRoundTripMs: 120000 }, [0, 120000]],
    [undefined, [null, null]], [{ admissionMs: -1, providerRoundTripMs: 1 }, [null, null]],
    [{ admissionMs: 1, providerRoundTripMs: 120001 }, [null, null]],
    [{ admissionMs: 0.5, providerRoundTripMs: 1 }, [null, null]],
    [{ admissionMs: 1, providerRoundTripMs: Infinity }, [null, null]], [{ admissionMs: 1, providerRoundTripMs: 1, private: 'do-not-release' }, [null, null]],
  ]) {
    const f = fixture(), complete = f.deps.complete;
    f.deps.complete = async (...args) => ({ ...await complete(...args), timing });
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, 'answered'); assert.equal(result.metrics.contextRevalidationCount, 3);
    assert.ok(Number.isSafeInteger(result.metrics.contextRevalidationMs) && result.metrics.contextRevalidationMs >= 0);
    assert.deepEqual([result.metrics.admissionMs, result.metrics.providerRoundTripMs], expected);
    assert.equal(f.count(), 1);
  }
});

test('a failing timing observer does not block a validated answer', async () => {
  const f = fixture(), complete = f.deps.complete;
  f.deps.complete = async (...args) => { const value = await complete(...args); Object.defineProperty(value, 'timing', { get() { throw Error('private observer error'); } }); return value; };
  const result = await runBasicRag(input(), f.deps);
  assert.equal(result.status, 'answered'); assert.equal(result.metrics.admissionMs, null); assert.equal(result.metrics.providerRoundTripMs, null);
  assert.doesNotMatch(JSON.stringify(result), /private observer error/);
});

test('composed real transport contract classifies a definitive HTTP429 as unavailable without retry', async () => {
  const f = fixture(); let posts = 0;
  f.deps.complete = createBasicRagCompletion({ apiKey: 'synthetic-key', policyCurrent: async () => true, claim: async () => true,
    fetcher: async (url, options) => {
      if (options.method === 'POST') { posts++; return Response.json({ error: 'synthetic upstream limit' }, { status: 429 }); }
      if (url.endsWith('/endpoints/zdr')) return Response.json({ data: [{ model_id: basicRagModel, tag: 'phala', safety_retention: false }] });
      return Response.json({ data: { endpoints: [{ tag: 'phala', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens', 'temperature', 'response_format', 'reasoning'] }] } });
    } });
  const result = await runBasicRag(input(), f.deps);
  assert.equal(result.status, 'unavailable'); assert.equal(posts, 1);
  assert.equal('answer' in result, false); assert.equal('usage' in result, false);
});

test('one guarded synthetic completion yields literal cited answer without exposing source internals', async () => {
  const f = fixture(), result = await runBasicRag(input(), f.deps);
  assert.equal(result.status, 'answered');
  assert.equal(f.count(), 1);
  assert.equal(result.answer.outcome, 'evidence');
  assert.match(result.answer.text, /It uses the ESP8266\./);
  assert.match(result.answer.text, /\[S1\]/);
  assert.equal(result.answer.citations[0].quote, 'ESP8266 microcontroller');
  assert.equal(result.answer.citations[0].sourceUrl, f.context.passages[0].sourceUrl);
  assert.deepEqual(result.usage, { inputTokens: 80, outputTokens: 20, costNanoUsd: 0 });
  assert.ok(result.metrics.retrievalMs >= 0 && result.metrics.generationMs >= 0 && result.metrics.totalMs >= 0);
  assert.doesNotMatch(JSON.stringify(result), /private-product|private-fingerprint|sourceProofs/);
});

test('missing evidence, unsupported product scope, invalid input and initial denial never call a model', async () => {
  for (const kind of ['clarification', 'insufficient', 'unavailable']) {
    const f = fixture(); f.deps.prepare = async () => ({ kind });
    assert.equal((await runBasicRag(input(), f.deps)).status, kind);
    assert.equal(f.count(), 0);
  }
  const f = fixture(); f.context.products.push({ id: 'other', sku: 'OTHER', title: 'Other' });
  assert.equal((await runBasicRag(input(), f.deps)).status, 'clarification');
  assert.equal(f.count(), 0);
  const invalid = fixture(); assert.equal((await runBasicRag({ ...input(), question: 'x'.repeat(2001) }, invalid.deps)).status, 'invalid');
  invalid.revoke(); assert.equal((await runBasicRag(input(), invalid.deps)).status, 'unavailable');
  assert.equal(invalid.count(), 0);
});

test('withdrawal or session revocation before send prevents the external fixture dispatch', async () => {
  for (const failure of ['withdraw', 'revoke']) {
    const f = fixture(); let sends = 0;
    f.deps.complete = async (_, beforeSend) => { f[failure](); if (await beforeSend()) sends++; return { evaluation: {} }; };
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, 'unavailable'); assert.equal(sends, 0);
  }
});

test('withdrawal or session revocation after a completion withholds the whole answer', async () => {
  for (const failure of ['withdraw', 'revoke']) {
    const f = fixture(), complete = f.deps.complete;
    f.deps.complete = async (...args) => { const result = await complete(...args); f[failure](); return result; };
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, 'unavailable'); assert.equal(f.count(), 1);
    assert.equal('answer' in result, false); assert.doesNotMatch(JSON.stringify(result), /ESP8266 microcontroller/);
  }
});

test('malformed, invented, source-label-only and private-pointer output never reaches the caller', async () => {
  const variants = [
    { answer: 'Incorrect', evidence: [{ rank: 1, quote: 'ESP32', reason: 'invented' }] },
    { answer: 'Incorrect', evidence: [{ rank: 2, quote: 'ESP8266', reason: 'wrong rank' }] },
    { answer: 'See s3://private-bucket/key', evidence: [{ rank: 1, quote: 'ESP8266', reason: 'leak' }] },
    { answer: 'No evidence', evidence: [] },
  ];
  for (const evaluation of variants) {
    const f = fixture(); f.deps.complete = async (_, beforeSend) => { assert.ok(await beforeSend()); return { evaluation }; };
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, 'outcome_unknown'); assert.equal('answer' in result, false);
  }
  const f = fixture(), label = `Source: ${f.context.passages[0].sourceUrl}`;
  f.context.passages[0].text = label;
  f.deps.complete = async (_, beforeSend) => { assert.ok(await beforeSend()); return { evaluation: { answer: 'A listing.', evidence: [{ rank: 1, quote: label, reason: 'source label' }] } }; };
  assert.equal((await runBasicRag(input(), f.deps)).status, 'outcome_unknown');
});

test('an honest abstention requires empty answer and evidence', async () => {
  const f = fixture(); f.deps.complete = async (_, beforeSend) => { assert.ok(await beforeSend()); return { evaluation: { answer: '', evidence: [] }, usage: { inputTokens: 80, outputTokens: 20, costNanoUsd: 0 } }; };
  const result = await runBasicRag(input(), f.deps);
  assert.equal(result.status, 'insufficient'); assert.equal('answer' in result, false);
});

test('missing, malformed or nonzero provider usage never releases an answer', async () => {
  for (const invalid of [undefined, { inputTokens: -1, outputTokens: 20, costNanoUsd: 0 },
    { inputTokens: 80, outputTokens: 20, costNanoUsd: 1 }, { inputTokens: 80, outputTokens: 20, costNanoUsd: 0, extra: 'unexpected' }]) {
    const f = fixture(), complete = f.deps.complete;
    f.deps.complete = async (...args) => ({ ...await complete(...args), usage: invalid });
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, 'unavailable'); assert.equal('answer' in result, false); assert.equal(f.count(), 1);
  }
});

test('provider 429 and unknown response are sanitized and never retried', async () => {
  for (const code of ['quota', 'outcome_unknown']) {
    const f = fixture(); let attempts = 0;
    f.deps.complete = async (_, beforeSend) => { attempts++; assert.ok(await beforeSend()); throw Object.assign(Error('private response'), { code }); };
    const result = await runBasicRag(input(), f.deps);
    assert.equal(result.status, code === 'quota' ? 'unavailable' : 'outcome_unknown');
    assert.equal(attempts, 1); assert.doesNotMatch(JSON.stringify(result), /private response/);
  }
});

test('an ignored or repeated send gate cannot produce a released answer', async () => {
  const f = fixture(); f.deps.complete = async () => ({ evaluation: { answer: 'A', evidence: [{ rank: 1, quote: 'ESP8266', reason: 'Name' }] } });
  assert.equal((await runBasicRag(input(), f.deps)).status, 'outcome_unknown');
  const g = fixture(); g.deps.complete = async (_, gate) => { assert.equal(await gate(), true); assert.equal(await gate(), false); return { evaluation: { answer: 'A', evidence: [{ rank: 1, quote: 'ESP8266', reason: 'Name' }] } }; };
  assert.equal((await runBasicRag(input(), g.deps)).status, 'outcome_unknown');
});

test('abort before preparation or during completion prevents a released answer', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  assert.equal((await runBasicRag({ question, signal: controller.signal }, f.deps)).status, 'unavailable');
  assert.equal(f.count(), 0);
  const g = fixture(), later = new AbortController(), complete = g.deps.complete;
  g.deps.complete = async (...args) => { const value = await complete(...args); later.abort(); return value; };
  assert.equal((await runBasicRag({ question, signal: later.signal }, g.deps)).status, 'unavailable');
});
