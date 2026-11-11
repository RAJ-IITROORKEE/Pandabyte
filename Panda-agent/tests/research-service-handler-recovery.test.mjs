import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { signDispatch, verifyResult, researchSubjectHash, researchPromptHash, researchRunId } from '../src/server/research-envelopes.ts';
import { createResearchServiceHandler, isPrivateBindAddress } from '../src/server/research-service-handler.ts';
import { researchQueryInScope } from '../src/server/research-turn-runner.ts';

const clock = 1794400000000, now = () => clock, secs = () => Math.floor(clock / 1000);
const keys = { dispatchKey: randomBytes(32), resultKey: randomBytes(32), serviceToken: randomBytes(32) };
const token = keys.serviceToken.toString('base64');
const subjectHash = researchSubjectHash('user_synthetic'), chatId = '11111111-2222-4333-8444-555555555555';
const rid = n => '66666666-7777-4888-9999-' + String(n).padStart(12, '0');
const prompt = 'Which interfaces does the RP2040 PIO support?';
const answer = { outcome: 'evidence', text: 'PIO supports UART and SPI.', citations: [] };
const usage = { calls: 3, inputTokens: 9000, outputTokens: 500, costNanoUsd: 2172800 };
const zero = { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 };
const dispatch = (action, n) => ({ v: 1, action, subjectHash, chatId, requestId: rid(n), profile: 'tavily-hosted-haiku', modelId: 'anthropic/claude-haiku-5.5', promptHash: researchPromptHash(prompt), exp: secs() + 30 });
const request = (method, url, d, extra = {}) => ({ method, path: url, headers: { authorization: 'Bearer ' + token }, body: Buffer.from(JSON.stringify({ dispatch: d, mac: signDispatch(keys.dispatchKey, d, secs()), ...extra })) });
const turn = n => request('POST', '/v1/research/turns', dispatch('turn', n), { prompt });
const status = n => request('GET', '/v1/research/turns/' + rid(n), dispatch('status', n));
const collect = async res => { const lines = []; for await (const l of res.stream) lines.push(JSON.parse(l)); return lines; };
const fileFor = n => createHash('sha256').update(subjectHash + '\n' + chatId + '\n' + rid(n)).digest('hex') + '.json';
const stored = over => ({ promptHash: researchPromptHash(prompt), runId: researchRunId(subjectHash, chatId, rid(1)), profile: 'tavily-hosted-haiku', modelId: 'anthropic/claude-haiku-5.5', createdAt: now(), state: 'unknown', usage: zero, ...over });
function setup(runner, log = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-research-recovery-')), requests = path.join(root, 'requests');
  fs.mkdirSync(requests, { mode: 0o700 });
  return { root, requests, handler: createResearchServiceHandler({ root, keys, runner, now, cancelWaitMs: 2000, log }), cleanup: () => fs.rmSync(root, { recursive: true, force: true }), make: (r, l) => createResearchServiceHandler({ root, keys, runner: r, now, log: l ?? log }) };
}
const never = { async run() { throw Error('never'); } };
const evidenceRunner = () => { const r = { calls: 0, async run() { r.calls++; await new Promise(x => setTimeout(x, 40)); return { state: 'evidence', answer, usage }; } }; return r; };

test('restart reclaims a lease still holding a slot for a TERMINAL request and keeps its file until removal is proven', async () => {
  const lease = 'panda-n45-' + '1'.repeat(32), s = setup(never);
  try {
    fs.writeFileSync(path.join(s.requests, 'e'.repeat(64) + '.json'), JSON.stringify(stored({ lease, createdAt: now() - 9 * 24 * 3600 * 1000 })));
    fs.writeFileSync(path.join(s.requests, 'f'.repeat(64) + '.json'), JSON.stringify(stored({ lease: 'panda-n45-' + '2'.repeat(32) })));
    let ok = false; const reclaimed = [], handler = s.make({ ...never, heldLeases: async () => [lease], reclaimLease: async l => { reclaimed.push(l); return ok; } });
    assert.deepEqual(await handler.reconcile(), { interrupted: 0, deleted: 0, skipped: 0, reclaimed: 0 }); assert.deepEqual(reclaimed, [lease], 'only the held lease is reclaimed');
    assert.equal(fs.existsSync(path.join(s.requests, 'e'.repeat(64) + '.json')), true, 'old terminal file kept while its slot is unproven');
    ok = true; assert.deepEqual(await handler.reconcile(), { interrupted: 0, deleted: 1, skipped: 0, reclaimed: 1 });
  } finally { s.cleanup(); }
});

test('cancel never reports an answer that raced it, and the stored result keeps its usage', async () => {
  const s = setup({ async run(input, hooks) { await new Promise(r => hooks.signal.addEventListener('abort', r)); return { state: 'evidence', answer, usage }; } });
  try {
    const pending = collect(await s.handler.handle(turn(30)));
    const cancelled = await s.handler.handle(request('POST', '/v1/research/turns/' + rid(30) + '/cancel', dispatch('cancel', 30)));
    assert.equal(cancelled.json.payload.state, 'unknown'); assert.equal(cancelled.json.answer, undefined); assert.equal(verifyResult(keys.resultKey, cancelled.json.payload, cancelled.json.mac, secs()), true);
    await pending; const file = JSON.parse(fs.readFileSync(path.join(s.requests, fileFor(30)), 'utf8')); assert.equal(file.state, 'evidence'); assert.deepEqual(file.usage, usage);
  } finally { s.cleanup(); }
});

test('two identical concurrent turns share one run: the loser replays or attaches instead of getting 409', async () => {
  const runner = evidenceRunner(), s = setup(runner);
  try {
    const [a, b] = await Promise.all([s.handler.handle(turn(31)), s.handler.handle(turn(31))]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const [la, lb] = await Promise.all([collect(a), collect(b)]); assert.equal(la.at(-1).payload.state, 'evidence'); assert.equal(lb.at(-1).payload.state, 'evidence'); assert.equal(runner.calls, 1);
  } finally { s.cleanup(); }
});

test('an unsignable result degrades to unknown with capped usage instead of failing forever', async () => {
  const s = setup({ async run() { return { state: 'evidence', answer, usage: { calls: 99, inputTokens: 9e9, outputTokens: 9e9, costNanoUsd: 9e12 } }; } });
  try {
    const last = (await collect(await s.handler.handle(turn(32)))).at(-1);
    assert.equal(last.payload.state, 'unknown'); assert.equal(last.answer, undefined); assert.deepEqual(last.payload.usage, { calls: 6, inputTokens: 192000, outputTokens: 4200, costNanoUsd: 1000000000 });
    assert.equal(verifyResult(keys.resultKey, last.payload, last.mac, secs()), true);
    assert.equal((await s.handler.handle(status(32))).json.payload.state, 'unknown');
  } finally { s.cleanup(); }
});

test('a running file with no live runner is reported unknown; corrupt, oversize and stale tmp files are handled without throwing', async () => {
  const logs = [], s = setup(never, m => logs.push(m));
  try {
    fs.writeFileSync(path.join(s.requests, fileFor(33)), JSON.stringify(stored({ state: 'running', runId: researchRunId(subjectHash, chatId, rid(33)) })));
    const st = await s.handler.handle(status(33));
    assert.equal(st.json.payload.state, 'unknown'); assert.equal(verifyResult(keys.resultKey, st.json.payload, st.json.mac, secs()), true);
    assert.equal((await collect(await s.handler.handle(turn(33)))).at(-1).payload.state, 'unknown', 'replay also answers unknown');
    fs.writeFileSync(path.join(s.requests, '9'.repeat(64) + '.json'), '{not json'); fs.writeFileSync(path.join(s.requests, '8'.repeat(64) + '.json'), 'x'.repeat(70000)); fs.writeFileSync(path.join(s.requests, 'old.tmp'), '');
    const result = await s.handler.reconcile(); assert.equal(result.skipped, 2); assert.equal(logs.length, 2); assert.ok(logs.every(m => !m.includes('not json')));
    assert.equal(fs.existsSync(path.join(s.requests, 'old.tmp')), false);
  } finally { s.cleanup(); }
});

test('bind address must be loopback or a private IPv4', () => {
  for (const ok of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.5', '169.254.1.1', '::1']) assert.equal(isPrivateBindAddress(ok), true, ok);
  for (const bad of ['0.0.0.0', '::', '8.8.8.8', '172.32.0.1', '192.169.0.1', '256.1.1.1', '1.2.3', '', null, 'fe80::1']) assert.equal(isPrivateBindAddress(bad), false, String(bad));
});

test('query scope refuses Unicode look-alikes and double separators', () => {
  const text = 'rp2040 pio cafe resume';
  for (const q of ['rp2040--pio', 'rp2040 -pio', 'rp2040- pio', '-rp2040', 'rp2040-', 'café', 'ｒｐ' + '2040', 'rp2040​pio', 'rp2040 pio', 'İ', 'ſ', 'rp2040\tpio']) assert.equal(researchQueryInScope(q, text), false, JSON.stringify(q));
  assert.equal(researchQueryInScope('rp2040-pio', text), true);
});
