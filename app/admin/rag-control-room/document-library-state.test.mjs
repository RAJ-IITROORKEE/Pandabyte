import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentWithdrawal, filterProductListings, parseDocumentSearch, parseWithdrawalReceipt } from './document-library-state.ts';

test('fallback search matches literal title or SKU without inventing a match', () => {
  const rows = [{ title:'Board Alpha', sku:'SKU-A' }, { title:'Sensor', sku:'BETA-2' }];
  assert.deepEqual(filterProductListings(rows, ' alpha '), [rows[0]]);
  assert.deepEqual(filterProductListings(rows, 'beta'), [rows[1]]);
  assert.deepEqual(filterProductListings(rows, '%'), []);
  assert.deepEqual(filterProductListings(rows, 'alpha sku'), []);
  assert.deepEqual(filterProductListings(rows, ''), rows);
});

const receipt = { reference: '12345678-1234-4234-9234-123456789abc', expectedVersion: 3 };
const other = { reference: '22345678-1234-4234-9234-123456789abc', expectedVersion: 1 };
const withdrawn = { reference: receipt.reference, status: 'withdrawn', version: 4 };
const document = (overrides = {}) => ({ kind: 'uploaded_document', reference: receipt.reference, title: 'Private fixture', status: 'withdrawn', version: 4, ...overrides });
const metadata = (items = [], nextCursor = null) => ({ items, nextCursor, stats: { uploadedDocuments: 1, uploadedChunks: 1, productDocuments: 0 } });
function memory() {
  const values = new Map();
  return { values, failSet: false, failRemove: false, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { if (this.failSet) throw Error('storage unavailable'); values.set(key, value); }, removeItem(key) { if (this.failRemove) throw Error('cleanup unavailable'); values.delete(key); } };
}

test('withdrawal receipt accepts only exact document reference and safe expected document version', () => {
  assert.deepEqual(parseWithdrawalReceipt(receipt), receipt);
  for (const value of [null, {}, { ...receipt, sourceVersion: 3 }, { ...receipt, reference: 'not-a-reference' }, { ...receipt, expectedVersion: 0 }, { ...receipt, expectedVersion: 1.5 }, { ...receipt, expectedVersion: Number.MAX_SAFE_INTEGER }]) assert.equal(parseWithdrawalReceipt(value), null);
});

test('withdrawal persists before exactly one POST and verifies correlated success before clearing recovery', async () => {
  const storage = memory(), calls = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const control = createDocumentWithdrawal(storage, async (url, init) => {
    calls.push({ url, init });
    assert.deepEqual(JSON.parse([...storage.values.values()][0]), receipt);
    await held;
    return Response.json(withdrawn);
  });
  const operation = control.submit(receipt);
  assert.equal(control.snapshot().busy, true);
  await control.submit(receipt);
  await control.submit(other);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/api/admin/panda-agent/documents/${receipt.reference}/withdraw`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].init.body), { expectedVersion: 3 });
  release(); await operation;
  assert.equal(control.snapshot().phase, 'confirmed');
  assert.equal(control.snapshot().pending, null);
  assert.equal(storage.values.size, 0);
});

test('loss, unavailable and malformed successes retain unknown receipt across reload without another POST', async () => {
  for (const make of [() => { throw Error('lost response'); }, () => Response.json({}, { status: 503 }), () => Response.json({ ...withdrawn, reference: other.reference }), () => Response.json({ ...withdrawn, version: 9 }), () => Response.json({ ...withdrawn, status: 'prepared' }), () => new Response('invalid', { status: 200 })]) {
    const storage = memory(); let calls = 0;
    const control = createDocumentWithdrawal(storage, async () => { calls++; return make(); });
    await control.submit(receipt); await control.submit(receipt);
    assert.equal(control.snapshot().phase, 'unknown');
    assert.deepEqual(control.snapshot().pending, receipt);
    const restored = createDocumentWithdrawal(storage, async () => { calls++; throw Error(); });
    await restored.submit(other);
    assert.equal(restored.snapshot().phase, 'unknown');
    assert.equal(calls, 1);
  }
});

test('unreadable, invalid, failed or ineffective storage prevents dispatch', async () => {
  const invalid = memory(); invalid.values.set('panda-document-pending-withdrawal', 'invalid');
  const failed = memory(); failed.failSet = true;
  for (const storage of [invalid, failed, { getItem() { throw Error(); }, setItem() {}, removeItem() {} }, { getItem() { return null; }, setItem() {}, removeItem() {} }]) {
    let calls = 0;
    const control = createDocumentWithdrawal(storage, async () => { calls++; return Response.json(withdrawn); });
    await control.submit(receipt);
    assert.equal(control.snapshot().phase, 'storage');
    assert.equal(calls, 0);
  }
});

test('a timed out POST releases busy state while retaining the unknown guard without retry', async () => {
  const storage = memory(); let calls = 0;
  const control = createDocumentWithdrawal(storage, async (url, init) => {
    calls++; assert.ok(init.signal instanceof AbortSignal);
    throw new DOMException('Injected timeout', 'TimeoutError');
  });
  await control.submit(receipt); await control.submit(receipt);
  assert.equal(control.snapshot().busy, false); assert.equal(control.snapshot().phase, 'unknown');
  assert.deepEqual(control.snapshot().pending, receipt); assert.equal(calls, 1); assert.equal(storage.values.size, 1);
});

test('known access and conflict guards survive reload and require fresh metadata plus explicit re-review', async () => {
  for (const status of [401, 403, 409]) {
    const storage = memory(); let posts = 0, gets = 0;
    const transport = async (url, init) => {
      if (init.method === 'POST') { posts++; return posts === 1 ? Response.json({}, { status }) : Response.json({ ...withdrawn, version: 6 }); }
      gets++; return Response.json(metadata([document({ status: 'prepared', version: 5 })]));
    };
    const initial = createDocumentWithdrawal(storage, transport); await initial.submit(receipt);
    const control = createDocumentWithdrawal(storage, transport);
    assert.equal(control.snapshot().phase, status === 409 ? 'conflict' : 'denied');
    await control.submit(receipt); assert.equal(posts, 1);
    await control.check();
    assert.equal(control.snapshot().phase, 'review');
    assert.deepEqual(control.snapshot().fresh, { title: 'Private fixture', version: 5 });
    assert.equal(posts, 1); assert.equal(gets, 1);
    await control.submit(receipt); await control.submit(other); assert.equal(posts, 1);
    await control.submit({ ...receipt, expectedVersion: 5 });
    assert.equal(posts, 2); assert.equal(control.snapshot().phase, 'confirmed');
  }
});

test('unknown status readback uses bounded list GETs and exact reference/document version only', async () => {
  const storage = memory(), calls = [];
  const initial = createDocumentWithdrawal(storage, async () => { throw Error('lost'); }); await initial.submit(receipt);
  const control = createDocumentWithdrawal(storage, async (url, init) => {
    calls.push({ url, init });
    return Response.json(calls.length === 1 ? metadata([document({ reference: other.reference, sourceVersion: 99 })], 'page_two') : metadata([document({ sourceVersion: 1 })]));
  });
  await control.check();
  assert.equal(control.snapshot().phase, 'confirmed'); assert.equal(storage.values.size, 0);
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(init.method, undefined); assert.equal(init.body, undefined); assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(url.includes('sourceVersion'), false); assert.equal(url.includes('/status'), false);
    assert.equal(new URL(url, 'https://local.test').searchParams.get('limit'), '50');
  }
  assert.equal(new URL(calls[1].url, 'https://local.test').searchParams.get('cursor'), 'page_two');
});

test('prepared, absent, stale, fallback, malformed and unavailable readbacks never unlock an unknown request', async () => {
  for (const make of [() => Response.json(metadata([document({ status: 'prepared', version: 3 })])), () => Response.json(metadata()), () => Response.json(metadata([document({ version: 3, sourceVersion: 99 })])), () => Response.json({ ...metadata([document()]), listingsOnly: true }), () => Response.json({ ...metadata([document()]), stats: null }), () => Response.json(metadata([document(), document()])), () => Response.json({}, { status: 503 }), () => { throw Error('read failed'); }]) {
    const storage = memory(); const initial = createDocumentWithdrawal(storage, async () => { throw Error('lost'); }); await initial.submit(receipt);
    let posts = 0;
    const control = createDocumentWithdrawal(storage, async (url, init) => { if (init.method === 'POST') posts++; return make(); });
    await control.check(); await control.submit(receipt);
    assert.equal(control.snapshot().phase, 'unknown'); assert.deepEqual(control.snapshot().pending, receipt); assert.equal(posts, 0);
  }
});

test('metadata checks stop at five pages or repeated cursor, retaining recovery', async () => {
  for (const repeat of [false, true]) {
    const storage = memory(); const initial = createDocumentWithdrawal(storage, async () => { throw Error(); }); await initial.submit(receipt);
    let calls = 0;
    const control = createDocumentWithdrawal(storage, async () => Response.json(metadata([], repeat ? 'same_cursor' : `page_${++calls}`)));
    if (repeat) { let n = 0; const repeated = createDocumentWithdrawal(storage, async () => { n++; return Response.json(metadata([], 'same_cursor')); }); await repeated.check(); assert.equal(n, 2); }
    else { await control.check(); assert.equal(calls, 5); }
    assert.equal(storage.values.size, 1);
  }
});

test('a denied status check cannot turn an unknown dispatched request into a retryable rejection', async () => {
  const storage = memory(); const initial = createDocumentWithdrawal(storage, async () => { throw Error(); }); await initial.submit(receipt);
  let reads = 0, posts = 0;
  const control = createDocumentWithdrawal(storage, async (url, init) => {
    if (init.method === 'POST') posts++;
    return ++reads === 1 ? Response.json({}, { status: 403 }) : Response.json(metadata([document({ status: 'prepared', version: 3 })]));
  });
  await control.check(); assert.equal(control.snapshot().phase, 'denied');
  await control.check(); assert.equal(control.snapshot().phase, 'unknown');
  await control.submit(receipt); assert.equal(posts, 0); assert.equal(storage.values.size, 1);
});

test('failed cleanup preserves confirmed truth and blocks another operation until local cleanup succeeds', async () => {
  const storage = memory(); storage.failRemove = true; let calls = 0;
  const control = createDocumentWithdrawal(storage, async () => { calls++; return Response.json(withdrawn); });
  await control.submit(receipt); await control.submit(other);
  assert.equal(control.snapshot().phase, 'confirmed'); assert.deepEqual(control.snapshot().pending, receipt); assert.equal(calls, 1);
  storage.failRemove = false; await control.check();
  assert.equal(calls, 1); assert.equal(control.snapshot().pending, null); assert.equal(storage.values.size, 0);
});

test('a stale controller cannot overwrite or remove a newer recovery receipt', async () => {
  const storage = memory(); let release;
  const held = new Promise(resolve => { release = resolve; });
  const stale = createDocumentWithdrawal(storage, async () => { await held; return Response.json(withdrawn); });
  const operation = stale.submit(receipt);
  const current = createDocumentWithdrawal(storage, async (url, init) => init.method === 'POST' ? Promise.reject(Error('new unknown')) : Response.json(metadata([document()])));
  await current.check(); await current.submit(other);
  release(); await operation;
  assert.deepEqual(JSON.parse([...storage.values.values()][0]), other);
  assert.deepEqual(stale.snapshot().pending, receipt);
  let calls = 0;
  const shared = memory(); const first = createDocumentWithdrawal(shared, async () => { throw Error(); });
  const second = createDocumentWithdrawal(shared, async () => { calls++; return Response.json(withdrawn); });
  await first.submit(receipt); await second.submit(other);
  assert.equal(calls, 0); assert.equal(second.snapshot().phase, 'storage');
  assert.deepEqual(JSON.parse([...shared.values.values()][0]), receipt);
});

test('document search accepts only correlated versioned passages and honest empty results', () => {
  const source = { kind:'uploaded_document', reference:'doc-a', version:2, title:'Guide', ordinal:1, sectionPath:['Setup'] };
  const result = { outcome:'retrieved', retrieval:'lexical', relevance:'unverified', passages:[{ rank:1, text:'Captured text', source }] };
  assert.deepEqual(parseDocumentSearch(result, 'doc-a', 2, 'Guide'), result);
  assert.equal(parseDocumentSearch(result, 'doc-b', 2, 'Guide'), null);
  assert.equal(parseDocumentSearch(result, 'doc-a', 3, 'Guide'), null);
  assert.equal(parseDocumentSearch(result, 'doc-a', 2, 'Other'), null);
  assert.equal(parseDocumentSearch({ ...result, passages:[] }, 'doc-a', 2, 'Guide'), null);
  assert.deepEqual(parseDocumentSearch({ ...result, outcome:'insufficient', passages:[] }, 'doc-a', 2, 'Guide')?.passages, []);
});
