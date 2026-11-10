import test from 'node:test';
import assert from 'node:assert/strict';
import { createBasicRagChatService } from '../src/server/basic-rag-chat-service.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const turn = { thread: '10000000-0000-4000-8000-000000000001', request: '20000000-0000-4000-8000-000000000001', question: 'Which MCU does the x8266 use?' };
const productId = '30000000-0000-4000-8000-000000000001';
const context = () => ({ kind: 'ready', products: [{ id: productId, sku: 'X8266', title: 'x8266' }],
  passages: [{ rank: 1, productSku: 'X8266', productTitle: 'x8266', title: 'x8266 listing', sourceUrl: 'https://www.pandabyte.in/product-page/x8266',
    capturedAt: '2026-11-04T00:00:00Z', sectionPath: ['Specifications'], text: 'The board uses the ESP8266 microcontroller.' }],
  digest: 'a'.repeat(64), sourceProofs: [{ productSku: 'X8266', fingerprint: 'private-fingerprint' }], revalidate: async () => true });
const answer = { answer: 'The board uses ESP8266.', evidence: [{ rank: 1, quote: 'ESP8266 microcontroller', reason: 'The listing names it.' }] };

function fixture() {
  let row = null, current = true, enabled = true, sends = 0, begins = 0, preparations = 0, completes = 0, cancels = 0, sourceCurrent = true;
  let result = answer, providerError = null, beforeResult = null, beforeClaim = null, scopeOverride = null, duplicateClaim = false;
  const progress = [];
  const read = () => ({ thread: { id: turn.thread, title: 'Disposable', updatedAt: '2026-11-09T00:00:00Z', status: row?.status === 'pending' ? 'pending' : 'idle' },
    messages: [], turns: row ? [{ requestId: turn.request, question: row.question, status: row.status, response: row.response ?? null, createdAt: '2026-11-09T00:00:00Z' }] : [] });
  const store = {
    async state(thread, request) {
      if (thread !== turn.thread || request !== turn.request) return null;
      return row ? { question: row.question, status: row.status, prepared: row.prepared, cancelled: row.cancelled } : null;
    },
    async begin(thread, request, question) {
      begins++;
      if (thread !== turn.thread || request !== turn.request) throw new ChatStoreError('not_found');
      const admitted = row === null;
      if (admitted) row = { question, status: 'pending', prepared: false, cancelled: false, response: null };
      else if (row.question !== question) throw new ChatStoreError('conflict');
      return { ...read(), admitted };
    },
    async scope(id) {
      assert.equal(id, productId);
      return scopeOverride ?? { productId, sku: 'X8266', scopeHash: 'b'.repeat(64) };
    },
    async prepare(thread, request, question, scope, digest) {
      preparations++;
      assert.equal(thread, turn.thread); assert.equal(request, turn.request); assert.equal(question, turn.question);
      assert.equal(scope.productId, productId); assert.equal(scope.sku, 'X8266'); assert.equal(digest, 'a'.repeat(64));
      if (!row || row.status !== 'pending') throw new ChatStoreError('conflict');
      if (row.prepared || duplicateClaim) return false;
      row.prepared = true;
      return true;
    },
    async complete(thread, request, value) {
      completes++;
      assert.equal(thread, turn.thread); assert.equal(request, turn.request);
      if (!row || row.status !== 'pending' || row.cancelled) throw new ChatStoreError('conflict');
      row.status = 'complete'; row.response = value;
      return read();
    },
    async cancel(thread, request) {
      cancels++;
      assert.equal(thread, turn.thread); assert.equal(request, turn.request);
      if (!row) throw new ChatStoreError('not_found');
      if (row.status === 'pending') {
        row.status = 'complete'; row.cancelled = true;
        row.response = { outcome: 'insufficient', text: 'Stopped waiting. The provider may still process the request; no answer will be saved.', citations: [] };
      }
      return read();
    },
  };
  const deps = {
    store, current: async () => current, enabled: async () => enabled,
    prepareContext: async () => ({ ...context(), revalidate: async () => sourceCurrent }),
    completion: claim => async (_input, beforeSend) => {
      if (beforeClaim) await beforeClaim();
      if (!await claim()) throw Object.assign(Error('not admitted'), { code: 'not_admitted' });
      if (!await beforeSend()) throw Object.assign(Error('not admitted'), { code: 'not_admitted' });
      sends++;
      if (beforeResult) await beforeResult();
      if (providerError) throw Object.assign(Error('provider private payload'), { code: providerError });
      return { evaluation: result, usage: { inputTokens: 10, outputTokens: 7, costNanoUsd: 0 } };
    },
  };
  return {
    deps, service: () => createBasicRagChatService(deps), row: () => row, progress,
    counts: () => ({ sends, begins, preparations, completes, cancels }),
    revoke: () => { current = false; }, deny: () => { enabled = false; }, withdraw: () => { sourceCurrent = false; },
    error: code => { providerError = code; }, pause: fn => { beforeResult = fn; }, beforeClaim: fn => { beforeClaim = fn; },
    invalidScope: value => { scopeOverride = value; }, duplicateClaim: () => { duplicateClaim = true; },
    context: value => { deps.prepareContext = async () => value; }, result: value => { result = value; },
  };
}
const signal = () => new AbortController().signal;

test('passes the service authorization callback into request-scoped context preparation', async () => {
  const f = fixture(); let received;
  f.deps.prepareContext = async (_question, _signal, authorizeCurrent) => {
    received = authorizeCurrent; const ready = context();
    ready.authorizedBy = authorizeCurrent;
    ready.revalidate = async () => await authorizeCurrent() && await authorizeCurrent();
    return ready;
  };
  assert.deepEqual(await f.service().start(turn, signal()), { status: 'saved' });
  assert.equal(typeof received, 'function'); assert.equal(f.counts().sends, 1);
});

test('fresh admission dispatches once, saves a validated citation and reports only safe activity', async () => {
  const f = fixture(), service = f.service();
  assert.deepEqual(await service.start(turn, signal(), stage => f.progress.push(stage)), { status: 'saved' });
  assert.deepEqual(f.counts(), { sends: 1, begins: 1, preparations: 1, completes: 1, cancels: 0 });
  assert.equal(f.row().response.outcome, 'evidence');
  assert.equal(f.row().response.citations[0].quote, 'ESP8266 microcontroller');
  assert.ok(f.progress.every(s => ['reading_sources', 'selecting_evidence', 'checking_citations', 'saving_answer'].includes(s)));
  assert.doesNotMatch(JSON.stringify(f.row().response), /private-fingerprint|private payload/);
  assert.deepEqual(await service.start(turn, signal()), { status: 'saved' });
  assert.equal(f.counts().sends, 1);
});

test('recovery and duplicate starts observe a pending claimed turn without redispatch, including after restart', async () => {
  const f = fixture(); f.error('outcome_unknown');
  assert.deepEqual(await f.service().start(turn, signal()), { status: 'unknown' });
  assert.equal(f.row().prepared, true); assert.equal(f.row().status, 'pending');
  f.deny();
  const restarted = f.service();
  assert.equal(await restarted.state(turn.thread, turn.request), true);
  assert.deepEqual(await restarted.status(turn, signal()), { status: 'unknown' });
  assert.deepEqual(await restarted.start(turn, signal()), { status: 'unknown' });
  assert.equal(f.counts().sends, 1); assert.equal(f.counts().preparations, 1); assert.equal(f.counts().completes, 0);
  await assert.rejects(restarted.start({ ...turn, question: 'Different question' }, signal()), e => e instanceof ChatStoreError && e.code === 'conflict');
});

test('disabled or revoked session cannot admit a turn, and status/cancel remain available while disabled', async () => {
  const f = fixture(), service = f.service(); f.deny();
  await assert.rejects(service.start(turn, signal()), e => e instanceof ChatStoreError && e.code === 'unavailable');
  assert.equal(f.counts().begins, 0);
  const g = fixture(); g.error('outcome_unknown'); const started = g.service();
  assert.deepEqual(await started.start(turn, signal()), { status: 'unknown' }); g.deny();
  assert.deepEqual(await started.cancel(turn, signal()), { status: 'saved' });
  assert.match(g.row().response.text, /provider may still process/);
  assert.equal(g.counts().sends, 1);
  const h = fixture(); h.revoke();
  await assert.rejects(h.service().start(turn, signal()), e => e instanceof ChatStoreError && e.code === 'unauthenticated');
  assert.equal(h.counts().begins, 0);
});

test('429 and known no-evidence outcomes save safe messages, not synthetic answers', async () => {
  for (const mode of ['rate_limited', 'clarification', 'insufficient', 'unavailable']) {
    const f = fixture();
    if (mode === 'rate_limited') f.error(mode); else f.context({ kind: mode });
    const result = await f.service().start(turn, signal());
    assert.deepEqual(result, { status: 'saved' }, mode);
    assert.equal(f.row().response.citations.length, 0);
    assert.equal(f.row().response.outcome, mode === 'clarification' ? 'clarification' : 'insufficient');
    assert.doesNotMatch(JSON.stringify(f.row().response), /provider private payload|ESP8266 microcontroller/);
    assert.equal(f.counts().sends, mode === 'rate_limited' ? 1 : 0);
  }
});

test('a declined or uncertain durable claim never sends a prompt or writes a final answer', async () => {
  const f = fixture(); f.duplicateClaim();
  assert.deepEqual(await f.service().start(turn, signal()), { status: 'unknown' });
  assert.equal(f.counts().sends, 0); assert.equal(f.counts().completes, 0);
  const g = fixture();
  g.deps.store.prepare = async () => { throw Error('lost database response'); };
  assert.deepEqual(await g.service().start(turn, signal()), { status: 'unknown' });
  assert.equal(g.counts().sends, 0); assert.equal(g.counts().completes, 0);
});

test('logical cancellation wins a race against a late completion and no answer overwrites it', async () => {
  const f = fixture(); let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  f.pause(async () => { entered(); await wait; });
  const service = f.service(), pending = service.start(turn, signal());
  await started;
  assert.deepEqual(await service.cancel(turn, signal()), { status: 'saved' });
  release();
  assert.deepEqual(await pending, { status: 'saved' });
  assert.equal(f.row().cancelled, true); assert.match(f.row().response.text, /provider may still process/);
  assert.equal(f.row().response.citations.length, 0); assert.equal(f.counts().sends, 1);
});

test('concurrent duplicate request is status-only while the first completion is in flight', async () => {
  const f = fixture(); let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  f.pause(async () => { entered(); await wait; });
  const service = f.service(), first = service.start(turn, signal());
  await started;
  assert.deepEqual(await f.service().start(turn, signal()), { status: 'unknown' });
  assert.equal(f.counts().sends, 1); assert.equal(f.counts().preparations, 1);
  release();
  assert.deepEqual(await first, { status: 'saved' });
  assert.equal(f.counts().sends, 1);
});

test('cancellation before the durable dispatch claim prevents the provider call', async () => {
  const f = fixture(), service = f.service();
  f.beforeClaim(async () => { assert.deepEqual(await service.cancel(turn, signal()), { status: 'saved' }); });
  assert.deepEqual(await service.start(turn, signal()), { status: 'saved' });
  assert.equal(f.counts().sends, 0); assert.equal(f.row().cancelled, true);
  assert.match(f.row().response.text, /provider may still process/);
});

test('a current-source fence rejection stays pending and never saves the stale answer', async () => {
  const f = fixture(); f.pause(async () => f.withdraw());
  f.deps.store.complete = async () => { throw new ChatStoreError('conflict'); };
  assert.deepEqual(await f.service().start(turn, signal()), { status: 'unknown' });
  assert.equal(f.row().status, 'pending'); assert.equal(f.row().response, null);
  assert.equal(f.counts().sends, 1);
});

test('revoked source/session, abort and mismatched scope prevent a released model answer', async () => {
  for (const scenario of ['withdraw', 'revoke', 'abort', 'scope']) {
    const f = fixture(), controller = new AbortController();
    if (scenario === 'scope') f.invalidScope({ productId, sku: 'OTHER', scopeHash: 'b'.repeat(64) });
    if (scenario === 'withdraw') f.pause(async () => f.withdraw());
    if (scenario === 'revoke') f.pause(async () => f.revoke());
    if (scenario === 'abort') f.pause(async () => controller.abort());
    let response;
    try { response = await f.service().start(turn, controller.signal); } catch (e) { assert.ok(e instanceof ChatStoreError); }
    assert.notEqual(f.row()?.response?.outcome, 'evidence', scenario);
    if (scenario === 'abort' || scenario === 'revoke' || scenario === 'scope') assert.notEqual(response?.status, 'saved', scenario);
    if (scenario === 'scope') assert.equal(f.counts().sends, 0);
  }
});

test('revocation during status or store errors are private and do not call a completion', async () => {
  const f = fixture(); f.deps.store.state = async () => { f.revoke(); return null; };
  await assert.rejects(f.service().state(turn.thread, turn.request), e => e instanceof ChatStoreError && e.code === 'unauthenticated');
  assert.equal(f.counts().sends, 0);
  const g = fixture(); g.deps.store.state = async () => { throw Error('private customer record'); };
  await assert.rejects(g.service().state(turn.thread, turn.request), e => e instanceof ChatStoreError && !e.message.includes('private'));
  assert.equal(g.counts().sends, 0);
});
