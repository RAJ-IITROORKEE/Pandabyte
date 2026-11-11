import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const h = c => c.repeat(64);
const binding = { binding: h('a'), owner: h('b'), sessionID: 'ses_' + '1'.repeat(26), profileHash: h('c'), imageId: 'sha256:' + h('d'), created: 1 };
const receipt = () => ({ binding: binding.binding, owner: binding.owner, runID: randomUUID(), messageID: 'msg_' + '2'.repeat(26), promptHash: h('e'), sourceRevision: h('f'), generation: h('1') });
const op = (key = '2', request = '3') => ({ kind: 'primary', key: h(key), requestHash: h(request) });
async function fixture(t, options) {
 let m;
 await assert.doesNotReject(async () => { m = await import('../src/server/research-runtime-store.ts'); }, 'private durable runtime authority exists');
 const root = await mkdtemp(path.join(tmpdir(), 'panda-research-'));
 await chmod(root, 0o700); t.after(() => rm(root, { recursive: true, force: true }));
 const store = await m.openResearchRuntimeStore(root, options);
 await store.createBinding(binding);
 await store.startGeneration(binding, null, h('1'));
 assert.equal((await store.claimCreate(binding, h('1'))).state, 'dispatch');
 assert.equal(await store.markCreated(binding, h('1'), { sessionID: binding.sessionID, profileHash: binding.profileHash }), true);
 const r = receipt(); await store.admitRun(r);
 assert.equal((await store.claimPrompt(r)).state, 'dispatch');
 await store.markPromptAccepted(r);
 return { m, root, store, r };
}
const terminal = r => async () => ({ sessionID: binding.sessionID, messageID: r.messageID, promptHash: r.promptHash, outcome: 'succeeded', active: false });

test('exclusive durable claims dispatch once across stores, replay settled results and reject changed payload', async t => {
 const { m, root, store, r } = await fixture(t);
 const other = await m.openResearchRuntimeStore(root);
 const claims = await Promise.all([store.claimOperation(r, op()), other.claimOperation(r, op())]);
 assert.deepEqual(claims.map(x => x.state).sort(), ['dispatch', 'unknown']);
 assert.equal((await store.claimOperation(r, op('2', '4'))).state, 'conflict');
 assert.equal((await store.claimOperation(r, op('4', '5'))).state, 'unknown');
 assert.equal(await store.settleOperation(r, op(), h('8'), { text: 'unsent' }), false);
 const { grant } = await store.markSending(r, op());
 assert.equal(await store.markSending(r, op()), null);
 assert.equal(await store.settleOperation(r, op(), grant, { text: 'verified' }), true);
 assert.equal(await store.settleOperation(r, op(), grant, { text: 'rewrite' }), false);
 assert.deepEqual(await other.recoverOperation(r, op()), { state: 'cached', result: { text: 'verified' } });
 assert.deepEqual(await store.claimOperation(r, op('7', '3')), { state: 'cached', result: { text: 'verified' } });
 assert.equal(await store.authorizeRelease(r, op(), m.hashResearchJSON({ text: 'verified' })), true);
 assert.equal(await store.authorizeRelease(r, op('7', '3'), m.hashResearchJSON({ text: 'verified' })), true);
 assert.equal(await store.authorizeRelease(r, op(), h('0')), false);
 const clone = await store.readRun(r); clone.receipt.owner = h('0');
 assert.equal((await store.readRun(r)).receipt.owner, r.owner);
});

test('send then cancel, retire or rotate permits exact private settlement but never release or egress', async t => {
 for (const action of ['cancelled', 'source_retired', 'rotate']) {
  const { store, r, m } = await fixture(t);
  await store.claimOperation(r, op()); const { grant } = await store.markSending(r, op());
  if (action === 'rotate') assert.equal(await store.startGeneration(binding, h('1'), h('9')), true);
  else assert.equal(await store.cancelRun(r, action), true);
  assert.equal(await store.current(r), false);
  assert.equal(await store.settleOperation(r, op(), grant, { ok: true }), true);
  assert.equal((await store.recoverOperation(r, op())).state, 'cached');
  assert.equal(await store.authorizeRelease(r, op(), m.hashResearchJSON({ ok: true })), false);
  assert.equal(await store.markSending(r, op('4', '5')), null);
  assert.equal((await store.claimOperation(r, op('4', '5'))).state, 'conflict');
 }
});

test('source checks fail closed at claim, final send and release, without executing getters', async t => {
 let allowed = true; const { store, r } = await fixture(t, { isCurrent: async () => allowed });
 await store.claimOperation(r, op()); allowed = false;
 assert.equal(await store.markSending(r, op()), null);
 assert.equal(await store.current(r), false);
 assert.equal(await store.finishRun(r, terminal(r)), false);
 let touched = false; const evil = { ...op() }; Object.defineProperty(evil, 'requestHash', { enumerable: true, get() { touched = true; return h('3'); } });
 assert.equal((await store.claimOperation(r, evil)).state, 'conflict'); assert.equal(touched, false);
});

test('restart reconciles settled native terminal state while unresolved attempts remain fenced', async t => {
 const { store, r } = await fixture(t);
 await store.claimOperation(r, op());
 assert.equal(await store.finishRun(r, terminal(r)), false);
 await store.startGeneration(binding, h('1'), h('9'));
 assert.equal(await store.reconcileTerminal(binding, h('9'), terminal(r)), false);
 assert.equal((await store.admitRun({ ...receipt(), generation: h('9') })).state, 'conflict');
 const f = await fixture(t); await f.store.claimOperation(f.r, op());
 const { grant } = await f.store.markSending(f.r, op()); await f.store.settleOperation(f.r, op(), grant, { ok: true });
 await f.store.startGeneration(binding, h('1'), h('9'));
 assert.equal(await f.store.reconcileTerminal(binding, h('9'), async () => ({ ...await terminal(f.r)(), messageID: 'msg_' + '9'.repeat(26) })), false);
 assert.equal(await f.store.reconcileTerminal(binding, h('9'), terminal(f.r)), true);
 const next = { ...receipt(), generation: h('9'), messageID: 'msg_' + '3'.repeat(26) };
 assert.equal((await f.store.admitRun(next)).state, 'admitted');
 assert.equal((await f.store.readRun(f.r)).receipt.generation, h('1'));
});

test('immutable owners, prompt/create claims and generations cannot be replaced or replayed', async t => {
 const { store, r } = await fixture(t);
 assert.equal((await store.createBinding({ ...binding, owner: h('0') })).state, 'conflict');
 assert.equal(await store.startGeneration(binding, null, h('9')), false);
 assert.equal((await store.claimCreate(binding, h('1'))).state, 'created');
 assert.equal((await store.claimPrompt(r)).state, 'accepted');
 assert.equal((await store.admitRun({ ...r, promptHash: h('0') })).state, 'conflict');
 assert.equal(await store.readRun({ ...r, owner: h('0') }), null);
 assert.equal(await store.finishRun(r, terminal(r)), true);
 assert.equal((await store.admitRun(r)).state, 'finished');
 assert.equal((await store.claimPrompt(r)).state, 'conflict');
});

test('result validation and association are immutable and preserve unresolved claims', async t => {
 const { store, r, m } = await fixture(t); await store.claimOperation(r, op());
 const { grant } = await store.markSending(r, op());
 for (const result of [{ x: Infinity }, { x: 'x'.repeat(2097153) }, { toJSON() { throw Error('never'); } }]) assert.equal(await store.settleOperation(r, op(), grant, result), false);
 assert.equal((await store.recoverOperation(r, op())).state, 'unknown');
 assert.equal(await store.settleOperation(r, op(), grant, { b: 1, a: 2 }), true);
 assert.equal(m.hashResearchJSON({ a: 2, b: 1 }), m.hashResearchJSON({ b: 1, a: 2 }));
 const association = { assistantMessageID: 'msg_' + '4'.repeat(26), callsDigest: h('5') };
 assert.equal(await store.associateOperation(r, op(), association), true);
 assert.equal(await store.associateOperation(r, op(), association), true);
 assert.equal(await store.associateOperation(r, op(), { ...association, callsDigest: h('6') }), false);
});

test('private layout rejects unexpected records, symlinks and locks without stale reclamation', async t => {
 const { m, root, store, r } = await fixture(t);
 const dir = path.join(root, 'bindings', binding.binding);
 await mkdir(path.join(dir, '.lock'));
 await assert.rejects(store.claimOperation(r, op()), /lock/i);
 await rm(path.join(dir, '.lock'), { recursive: true });
 await writeFile(path.join(root, 'unexpected'), 'x');
 await assert.rejects(m.openResearchRuntimeStore(root), /layout/i);
 await rm(path.join(root, 'unexpected'));
 const result = path.join(dir, 'results', h('2') + '.json');
 if (process.platform !== 'win32') {
  await symlink(path.join(root, 'bindings'), result);
  await assert.rejects(store.claimOperation(r, op()), /symlink|layout/i);
  await rm(result);
  await chmod(dir, 0o755); await assert.rejects(store.current(r), /private|mode/i);
 }
 assert.ok(JSON.parse(await readFile(path.join(dir, 'binding.json'), 'utf8')).owner === binding.owner);
});

test('primary digest replay precedes frontier conflicts while distinct native tools retain separate claims', async t => {
 const { store, r } = await fixture(t);
 for (const operation of [op('2', '3'), op('4', '5')]) {
  assert.equal((await store.claimOperation(r, operation)).state, 'dispatch'); const { grant } = await store.markSending(r, operation);
  await store.settleOperation(r, operation, grant, { request: operation.requestHash });
 }
 assert.deepEqual(await store.claimOperation(r, op('4', '3')), { state: 'cached', result: { request: h('3') } });
 const first = { ...op('6', '7'), kind: 'tool' }, second = { ...op('8', '7'), kind: 'tool' };
 await store.claimOperation(r, first); const { grant } = await store.markSending(r, first); await store.settleOperation(r, first, grant, { ok: true });
 assert.equal((await store.claimOperation(r, second)).state, 'dispatch');
});

test('crashes between finish snapshot and admission release reconcile without replay', async t => {
 const { store, root, r } = await fixture(t);
 assert.equal(await store.finishRun(r, terminal(r)), true);
 const currentFile = path.join(root, 'bindings', binding.binding, 'current.json');
 const current = JSON.parse(await readFile(currentFile, 'utf8')); current.activeRun = r.runID;
 await writeFile(currentFile, JSON.stringify(current));
 assert.equal(await store.startGeneration(binding, h('1'), h('9')), true);
 assert.equal(await store.reconcileTerminal(binding, h('9'), terminal(r)), true);
 assert.equal((await store.admitRun({ ...receipt(), generation: h('9'), messageID: 'msg_' + '3'.repeat(26) })).state, 'admitted');
});

test('cancel before claim and a failing current-source callback deny every dispatch boundary', async t => {
 const f = await fixture(t); await f.store.cancelRun(f.r, 'cancelled');
 assert.equal((await f.store.claimOperation(f.r, op())).state, 'conflict');
 assert.equal(await f.store.markSending(f.r, op()), null);
 let fail = false; const g = await fixture(t, { isCurrent() { if (fail) throw Error('private access failure'); return true; } }); fail = true;
 assert.equal((await g.store.claimOperation(g.r, op())).state, 'conflict');
 assert.equal(await g.store.current(g.r), false);
 assert.equal(await g.store.markPromptAccepted(g.r), false);
});

test('native and UUID identifiers require literal strings before any filesystem mutation', async t => {
 const { store, r } = await fixture(t);
 await store.finishRun(r, terminal(r));
 assert.equal((await store.admitRun({ ...receipt(), runID: [randomUUID()], messageID: 'msg_' + '3'.repeat(26) })).state, 'conflict');
 assert.equal((await store.createBinding({ ...binding, binding: h('9'), imageId: [binding.imageId] })).state, 'conflict');
 assert.equal((await store.admitRun({ ...r, messageID: 'msg_' + 'Z'.repeat(26) })).state, 'conflict');
});

async function fresh(t) {
 const m = await import('../src/server/research-runtime-store.ts');
 const root = await mkdtemp(path.join(tmpdir(), 'panda-research-')); await chmod(root, 0o700); t.after(() => rm(root, { recursive: true, force: true }));
 const store = await m.openResearchRuntimeStore(root);
 await store.createBinding(binding); await store.startGeneration(binding, null, h('1'));
 assert.equal((await store.claimCreate(binding, h('1'))).state, 'dispatch');
 assert.equal(await store.markCreated(binding, h('1'), { sessionID: binding.sessionID, profileHash: binding.profileHash }), true);
 return { m, store };
}
const imageReceipt = (over = {}) => ({ ...receipt(), imageSha256: h('a'), ...over });

test('receipt validity: exactly the 7 keys, or those plus a hex imageSha256', async t => {
 const { store } = await fresh(t);
 for (const bad of [imageReceipt({ imageSha256: 'abc' }), imageReceipt({ imageSha256: h('A') }), imageReceipt({ imageSha256: null }), imageReceipt({ imageSha256: undefined }), imageReceipt({ imageSha256: [h('a')] }), imageReceipt({ extra: 1 })])
  assert.equal((await store.admitRun(bad)).state, 'conflict');
 const text = receipt(); assert.equal((await store.admitRun(text)).state, 'admitted');
});
test('an image run is single-turn per binding: admitted first, then nothing else, and failed runs keep blocking', async t => {
 const { store } = await fresh(t);
 const image = imageReceipt(); assert.equal((await store.admitRun(image)).state, 'admitted');
 assert.equal((await store.admitRun(image)).state, 'admitted', 'replay returns the old state');
 assert.equal((await store.claimPrompt(image)).state, 'dispatch');
 assert.equal((await store.admitRun(image)).state, 'prompt_claimed', 'replay keeps returning the stored state, never image_single_turn');
 assert.equal((await store.admitRun({ ...receipt(), messageID: 'msg_' + '3'.repeat(26) })).state, 'image_single_turn', 'text follow-up blocked');
 assert.equal((await store.admitRun(imageReceipt({ messageID: 'msg_' + '4'.repeat(26) }))).state, 'image_single_turn', 'second image blocked');
 assert.equal(await store.cancelRun(image, 'cancelled'), true);
 assert.equal((await store.admitRun({ ...receipt(), messageID: 'msg_' + '5'.repeat(26) })).state, 'image_single_turn', 'a cancelled image run still blocks its binding');
 assert.equal((await store.readRun(image)).receipt.imageSha256, h('a'), 'stored receipt keeps the image hash');
});
test('an image run cannot join a binding that already has runs, even a finished one', async t => {
 const { store, r } = await fixture(t);
 assert.equal((await store.admitRun(imageReceipt({ messageID: 'msg_' + '6'.repeat(26) }))).state, 'image_single_turn');
 assert.equal(await store.cancelRun(r, 'cancelled'), true);
 assert.equal((await store.admitRun(imageReceipt({ messageID: 'msg_' + '6'.repeat(26) }))).state, 'image_single_turn');
 assert.equal((await store.admitRun({ ...receipt(), messageID: 'msg_' + '7'.repeat(26) })).state, 'conflict', 'text follow-up keeps the pre-existing active-run conflict');
});
test('image receipts survive reopen and keep operation authority', async t => {
 const { m, store } = await fresh(t); const image = imageReceipt();
 assert.equal((await store.admitRun(image)).state, 'admitted'); assert.equal((await store.claimPrompt(image)).state, 'dispatch'); await store.markPromptAccepted(image);
 assert.equal((await store.claimOperation(image, op())).state, 'dispatch');
 assert.equal((await store.claimOperation({ ...image, imageSha256: h('b') }, op())).state, 'conflict', 'a different image hash is a different receipt');
 const { claimOperation } = store; assert.equal(typeof claimOperation, 'function'); void m;
});
