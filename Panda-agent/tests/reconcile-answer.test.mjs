import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWithFreshSession, reconcileSavedAnswer } from '../src/ui/reconcile-answer.ts';

const threadId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const path = `/api/panda-agent/chats/${threadId}?requestId=${requestId}`;
const saved = () => ({
  thread: { id: threadId, status: 'idle', title: 'xC3 question', updatedAt: '2026-11-10T00:00:00Z' },
  attemptStatus: 'complete',
  messages: [
    { id: 'question-id', role: 'user', text: 'Which MCU does xC3 use?', createdAt: '2026-11-10T00:00:00Z', citations: [] },
    { id: 'different-assistant-uuid', role: 'assistant', text: 'The approved documentation identifies ESP32-C3.', createdAt: '2026-11-10T00:00:01Z', citations: [] },
  ],
  projectMemory: null,
});
function fixture(overrides = {}) {
  const reads = [], tokens = [];
  const controller = new AbortController();
  const options = {
    signal: controller.signal, isCurrent: () => true,
    getToken: async options => { tokens.push(options); return 'fresh-session-jwt'; },
    fetcher: async (url, init) => { reads.push({ url, init }); return Response.json(saved()); },
    readJson: response => response.json(),
    ...overrides,
  };
  return { options, controller, reads, tokens };
}

test('restores the exact completed request with one fresh JWT and one private read, never a prompt POST', async () => {
  const f = fixture();
  const result = await reconcileSavedAnswer(threadId, requestId, f.options);
  assert.deepEqual(result, saved());
  assert.deepEqual(f.tokens, [{ skipCache: true }]);
  assert.equal(f.reads.length, 1);
  const { url, init } = f.reads[0];
  assert.equal(url, path);
  assert.equal(init.method, 'GET');
  assert.equal(init.body, undefined);
  assert.deepEqual(init.headers, { Authorization: 'Bearer fresh-session-jwt', Accept: 'application/json' });
  assert.equal(init.credentials, 'omit');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error');
  assert.equal(result.messages[0].text, saved().messages[0].text);
});

test('a complete status is necessary; pending, absent and unproven idle answers stay uncertain', async () => {
  for (const attemptStatus of ['pending', 'absent', undefined, 'idle']) {
    const f = fixture({ fetcher: async () => Response.json({ ...saved(), attemptStatus }) });
    assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  }
});

test('rejects a foreign or busy thread, malformed messages and an incomplete answer', async () => {
  const examples = [
    { ...saved(), thread: { ...saved().thread, id: requestId } },
    ...['pending', 'blocked'].map(status => ({ ...saved(), thread: { ...saved().thread, status } })),
    { ...saved(), thread: null }, { ...saved(), messages: null },
    { ...saved(), messages: [] }, { ...saved(), messages: [saved().messages[0]] },
    { ...saved(), messages: [{ ...saved().messages[1], text: ' ' }] },
    { ...saved(), messages: [{ ...saved().messages[1], citations: null }] },
    { ...saved(), messages: [{ ...saved().messages[1], role: 'system' }] },
  ];
  for (const data of examples) {
    const f = fixture({ fetcher: async () => Response.json(data) });
    assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  }
});

test('authorization failures and not found never retry, relax auth or parse a response', async () => {
  for (const status of [401, 403, 404, 503]) {
    let count = 0;
    const f = fixture({ fetcher: async () => { count++; return new Response(null, { status }); }, readJson: () => { throw new Error('must not parse'); } });
    assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
    assert.equal(count, 1);
    assert.equal(f.tokens.length, 1);
  }
});

test('failed or missing fresh JWT never falls back to cookies or sends a request', async () => {
  for (const getToken of [async () => null, async () => { throw new Error('signed out'); }, async () => 'bad\r\ntoken']) {
    const f = fixture({ getToken });
    assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
    assert.equal(f.reads.length, 0);
  }
});

test('cancelled or already superseded attempts do not refresh a token', async () => {
  const f = fixture(); f.controller.abort();
  assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  assert.equal(f.tokens.length, 0);
  const stale = fixture({ isCurrent: () => false });
  assert.equal(await reconcileSavedAnswer(threadId, requestId, stale.options), null);
  assert.equal(stale.tokens.length, 0);
});

test('cancellation during a stuck refresh finishes immediately without a GET', async () => {
  let refreshing;
  const started = new Promise(resolve => { refreshing = resolve; });
  const f = fixture({ getToken: () => { refreshing(); return new Promise(() => {}); } });
  const result = reconcileSavedAnswer(threadId, requestId, f.options);
  await started; f.controller.abort();
  assert.equal(await result, null);
  assert.equal(f.reads.length, 0);
});

test('account change or newer attempt during refresh prevents the read', async () => {
  let current = true;
  const f = fixture({ isCurrent: () => current, getToken: async () => { current = false; return 'fresh-session-jwt'; } });
  assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  assert.equal(f.reads.length, 0);
});

test('late responses and parsed answers are discarded after unmount or cancellation', async () => {
  for (const stage of ['fetch', 'parse']) {
    let current = true;
    const f = fixture({
      isCurrent: () => current,
      fetcher: async () => { if (stage === 'fetch') current = false; return Response.json(saved()); },
      readJson: async response => { const value = await response.json(); current = false; return value; },
    });
    assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  }
});

test('cancelling an in-flight GET or body read aborts recovery even if the operation ignores abort', async () => {
  for (const stage of ['fetch', 'parse']) {
    let started;
    const waiting = new Promise(resolve => { started = resolve; });
    let requestSignal;
    const f = fixture({
      fetcher: async (_url, init) => { requestSignal = init.signal; if (stage === 'fetch') { started(); return new Promise(() => {}); } return Response.json(saved()); },
      readJson: async () => { started(); return new Promise(() => {}); },
    });
    const result = reconcileSavedAnswer(threadId, requestId, f.options);
    await waiting; f.controller.abort();
    assert.equal(await result, null);
    assert.equal(requestSignal.aborted, true);
  }
});

test('redirects, non-JSON and rejected bounded parsing stay uncertain', async () => {
  const redirected = Response.json(saved()); Object.defineProperty(redirected, 'redirected', { value: true });
  for (const response of [redirected, new Response('<html>sign in</html>')]) {
    const f = fixture({ fetcher: async () => response });
    assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  }
  const f = fixture({ readJson: async () => { throw new Error('Response too large'); } });
  assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
});

test('fresh session reads are restricted to the fixed local read endpoints', async () => {
  for (const url of ['https://evil.example/api/panda-agent/capabilities', '//evil.example', '/api/panda-agent/chats', `${path}&redirect=https://evil.example`, '/api/panda-agent/chats/not-a-uuid?requestId=bad']) {
    const f = fixture();
    assert.equal(await readWithFreshSession(url, f.options), null);
    assert.equal(f.tokens.length, 0);
  }
  const f = fixture();
  assert.deepEqual(await readWithFreshSession('/api/panda-agent/capabilities', f.options), saved());
  assert.equal(f.reads.length, 1);
});

test('the entire read including a hanging token refresh is bounded to five seconds', { timeout: 7000 }, async () => {
  const f = fixture({ getToken: () => new Promise(() => {}) });
  const start = performance.now();
  assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 4900 && elapsed < 6500, `elapsed ${elapsed}`);
  assert.equal(f.reads.length, 0);
});

test('a hanging body parser is also bounded and aborts the GET signal', { timeout: 7000 }, async () => {
  const f = fixture({ readJson: () => new Promise(() => {}) });
  assert.equal(await reconcileSavedAnswer(threadId, requestId, f.options), null);
  assert.equal(f.reads.length, 1);
  assert.equal(f.reads[0].init.signal.aborted, true);
});
