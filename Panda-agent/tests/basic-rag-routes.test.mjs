import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightweightHandler } from '../src/server/lightweight-handler.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const thread = '11111111-1111-4111-8111-111111111111';
const request = '22222222-2222-4222-8222-222222222222';
const question = 'Which MCU does the x8266 use?';
const timestamp = '2026-11-06T00:00:00Z';
const answer = { outcome: 'evidence', text: 'The board uses ESP8266. [S1]', citations: [{ id: 'S1', title: 'x8266 listing',
  sourceUrl: 'https://www.pandabyte.in/product-page/x8266', capturedAt: timestamp, quote: 'ESP8266', sectionPath: ['Specifications'] }] };
const message = (data = { requestId: request, question }, headers = {}) => new Request(`http://localhost/api/panda-agent/chats/${thread}/messages`, {
  method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify(data),
});
const read = () => new Request(`http://localhost/api/panda-agent/chats/${thread}?requestId=${request}`);
const cancel = (headers = {}) => new Request(`http://localhost/api/panda-agent/chats/${thread}/cancel`, {
  method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify({ requestId: request }),
});

function fixture(options = {}) {
  const calls = [];
  let kind = options.kind ?? 'none', saved = Boolean(options.saved), active = true, present = kind !== 'none';
  const snapshot = async () => {
    calls.push('read');
    if (options.foreign) throw new ChatStoreError('not_found');
    return { thread: { id: thread, title: 'Fixture', updatedAt: timestamp, status: present && !saved ? 'pending' : 'idle' },
      messages: saved ? [{ id: request, role: 'assistant', text: answer.text, citations: answer.citations, createdAt: timestamp }] : [],
      turns: present ? [{ requestId: request, question, status: saved ? 'complete' : 'pending', response: saved ? answer : null, createdAt: timestamp }] : [],
      privateField: 'PRIVATE_SERVER_STATE' };
  };
  const basic = {
    state: async () => { calls.push('basic_state'); if (options.classificationError) throw Error('PRIVATE_SQL'); return kind === 'basic'; },
    start: async turn => { calls.push('basic_start'); assert.deepEqual(turn, { thread, request, question }); kind = 'basic'; present = true; saved = !options.pendingStart; return { status: saved ? 'saved' : 'unknown' }; },
    status: async () => { calls.push('basic_status'); if (options.revokeOnStatus) active = false; if (options.statusError) throw new ChatStoreError('unavailable'); if (options.saveOnStatus) saved = true; return { status: saved ? 'saved' : 'unknown' }; },
    cancel: async () => { calls.push('basic_cancel'); if (options.cancelUnknown) return { status: 'unknown' }; saved = true; return { status: 'saved' }; },
  };
  const native = {
    read: snapshot, state: async () => { calls.push('native_state'); return kind === 'native' ? { phase: 'unknown' } : null; },
    start: async () => { calls.push('native_start'); return { status: 'unknown' }; },
    status: async () => { calls.push('native_status'); saved = true; return { status: 'saved' }; },
    cancel: async () => { calls.push('native_cancel'); saved = true; return { status: 'saved' }; },
    cleanup: async () => { calls.push('native_cleanup'); return { status: 'retired' }; },
    cleanupThread: async () => { calls.push('native_cleanup_thread'); return true; },
  };
  const store = {
    read: snapshot, begin: async () => { calls.push('legacy_begin'); return { ...await snapshot(), admitted: false }; },
    execution: async () => { calls.push('legacy_execution'); return { prepared: false, digest: null, sku: null, scopeHash: null, productId: null }; },
    complete: async () => { calls.push('legacy_complete'); saved = true; }, cancel: async () => { calls.push('legacy_cancel'); saved = true; },
    delete: async () => { calls.push('legacy_delete'); return { ok: true }; },
  };
  const deps = { enabled: () => true, authenticate: async () => options.anonymous ? null : { subject: 'OWNER', sessionId: 'SESSION', client: {} },
    current: async () => active, store: () => store, products: async () => [], answer: async () => { calls.push('legacy_answer'); return answer; },
    native: () => native, nativeNewMessages: () => Boolean(options.nativeNew), basicRag: () => basic,
    basicRagNewMessages: () => Boolean(options.basicNew) };
  return { calls, deps, basic, native, deactivate: () => { active = false; },
    concurrentAdmission: () => { kind = 'basic'; present = true; }, handler: createLightweightHandler(deps) };
}
const privateWire = async response => {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const value = await response.text(); assert.doesNotMatch(value, /PRIVATE|requestId|runtimeBinding|receipt/); return value;
};

test('new ordinary basic-RAG request runs once before native or legacy admission and returns private saved history', async () => {
  const f = fixture({ basicNew: true, nativeNew: true });
  const response = await f.handler.messagePOST(message(), thread);
  assert.equal(response.status, 200); assert.match(await privateWire(response), /ESP8266/);
  assert.equal(f.calls.filter(x => x === 'basic_start').length, 1);
  assert.equal(f.calls.includes('native_start'), false); assert.equal(f.calls.includes('legacy_begin'), false);
});
test('persisted basic requests are observed only, including when new admission is disabled', async () => {
  const f = fixture({ kind: 'basic', saveOnStatus: true });
  const response = await f.handler.messagePOST(message(), thread);
  assert.equal(response.status, 200); await privateWire(response);
  assert.equal(f.calls.includes('basic_status'), true); assert.equal(f.calls.includes('basic_start'), false);
  assert.equal(f.calls.some(x => x === 'legacy_begin' || x === 'legacy_answer' || x === 'native_start'), false);
  const again = await f.handler.messagePOST(message(), thread);
  assert.equal(again.status, 200); assert.equal(f.calls.filter(x => x === 'basic_start').length, 0);
});
test('changed question for an existing basic request conflicts before observing or mutating it', async () => {
  const f = fixture({ kind: 'basic', saved: true });
  const response = await f.handler.messagePOST(message({ requestId: request, question: 'A different question' }), thread);
  assert.equal(response.status, 409); await privateWire(response);
  assert.equal(f.calls.includes('basic_status'), false); assert.equal(f.calls.includes('basic_start'), false);
});
test('pending basic GET is status-only, and unknown or unavailable results preserve pending state', async () => {
  for (const statusError of [false, true]) {
    const f = fixture({ kind: 'basic', statusError });
    const response = await f.handler.readGET(read(), thread);
    assert.equal(response.status, 200); const data = JSON.parse(await privateWire(response)); assert.equal(data.attemptStatus, 'pending');
    assert.equal(f.calls.includes('basic_status'), true); assert.equal(f.calls.includes('basic_start'), false);
    assert.equal(f.calls.some(x => x.startsWith('legacy_')), false);
  }
});
test('pending basic cancellation goes only to its own bridge and keeps unknown outcomes pending', async () => {
  for (const cancelUnknown of [false, true]) {
    const f = fixture({ kind: 'basic', cancelUnknown });
    const response = await f.handler.cancelPOST(cancel(), thread);
    assert.equal(response.status, cancelUnknown ? 503 : 200); await privateWire(response);
    assert.equal(f.calls.includes('basic_cancel'), true);
    assert.equal(f.calls.some(x => x.startsWith('legacy_') || x === 'native_cancel'), false);
  }
});
test('persisted native runs retain native status/cancellation even when basic admission is selected', async () => {
  const status = fixture({ kind: 'native', basicNew: true });
  assert.equal((await status.handler.messagePOST(message(), thread)).status, 200);
  assert.equal(status.calls.includes('native_status'), true); assert.equal(status.calls.includes('basic_start'), false);
  const stop = fixture({ kind: 'native', basicNew: true });
  assert.equal((await stop.handler.cancelPOST(cancel(), thread)).status, 200);
  assert.equal(stop.calls.includes('native_cancel'), true); assert.equal(stop.calls.includes('basic_cancel'), false);
});
test('pre-existing legacy requests are not reclassified by the new-admission flag', async () => {
  const f = fixture({ kind: 'legacy', basicNew: true });
  assert.equal((await f.handler.messagePOST(message(), thread)).status, 200);
  assert.equal(f.calls.includes('legacy_begin'), true); assert.equal(f.calls.includes('basic_start'), false);
});
test('origin, anonymous and foreign owner denial cannot reach a basic bridge action', async () => {
  for (const [options, requestValue, status] of [
    [{ basicNew: true }, message(undefined, { origin: 'https://other.test' }), 403],
    [{ anonymous: true, basicNew: true }, message(), 401],
    [{ foreign: true, basicNew: true }, message(), 404],
  ]) {
    const f = fixture(options), response = await f.handler.messagePOST(requestValue, thread);
    assert.equal(response.status, status); await privateWire(response);
    assert.equal(f.calls.some(x => x === 'basic_start' || x === 'basic_status' || x === 'basic_cancel'), false);
  }
});
test('revoked session or unknown classification never releases or falls back to legacy', async () => {
  const revoked = fixture({ kind: 'basic', saveOnStatus: true, revokeOnStatus: true });
  const response = await revoked.handler.messagePOST(message(), thread); assert.equal(response.status, 401); await privateWire(response);
  const unknown = fixture({ kind: 'basic', classificationError: true });
  const failed = await unknown.handler.readGET(read(), thread); assert.equal(failed.status, 503); await privateWire(failed);
  assert.equal(unknown.calls.some(x => x.startsWith('legacy_')), false);
});
test('unknown start does not fall back or report a completed answer', async () => {
  const f = fixture({ basicNew: true, pendingStart: true });
  const response = await f.handler.messagePOST(message(), thread);
  assert.equal(response.status, 503); assert.doesNotMatch(await privateWire(response), /ESP8266/);
  assert.equal(f.calls.includes('basic_start'), true); assert.equal(f.calls.some(x => x.startsWith('legacy_')), false);
});
test('a bridge claiming saved cannot produce HTTP 200 while durable history is still pending or absent', async () => {
  const fresh = fixture({ basicNew: true }); fresh.basic.start = async () => ({ status: 'saved' });
  assert.equal((await fresh.handler.messagePOST(message(), thread)).status, 503);
  const replay = fixture({ kind: 'basic' }); replay.basic.status = async () => ({ status: 'saved' });
  assert.equal((await replay.handler.messagePOST(message(), thread)).status, 503);
  const stopped = fixture({ kind: 'basic' }); stopped.basic.cancel = async () => ({ status: 'saved' });
  assert.equal((await stopped.handler.cancelPOST(cancel(), thread)).status, 503);
});
test('configured basic admission without its durable classifier fails closed', async () => {
  const f = fixture({ basicNew: true }); delete f.deps.basicRag;
  const response = await f.handler.messagePOST(message(), thread);
  assert.equal(response.status, 503); await privateWire(response);
  assert.equal(f.calls.some(x => x.startsWith('legacy_') || x === 'native_start'), false);
});
test('revocation during classification prevents even a status-only basic bridge action', async () => {
  const f = fixture({ kind: 'basic' });
  f.basic.state = async () => { f.deactivate(); return true; };
  const response = await f.handler.readGET(read(), thread);
  assert.equal(response.status, 401); await privateWire(response);
  assert.equal(f.calls.includes('basic_status'), false); assert.equal(f.calls.some(x => x.startsWith('legacy_')), false);
});
test('concurrent basic admission is reread and observed without starting a second run', async () => {
  const f = fixture({ basicNew: true, saveOnStatus: true });
  f.basic.state = async () => { f.concurrentAdmission(); return true; };
  const response = await f.handler.messagePOST(message(), thread);
  assert.equal(response.status, 200); await privateWire(response);
  assert.equal(f.calls.includes('basic_status'), true); assert.equal(f.calls.includes('basic_start'), false);
  assert.ok(f.calls.filter(x => x === 'read').length >= 3);
});
