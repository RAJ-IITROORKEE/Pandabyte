import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { signDispatch, verifyResult, researchSubjectHash, researchPromptHash } from '../src/server/research-envelopes.ts';
import { createResearchServiceHandler } from '../src/server/research-service-handler.ts';

let clock = 1794400000000;
const now = () => clock, secs = () => Math.floor(clock / 1000);
const keys = { dispatchKey: randomBytes(32), resultKey: randomBytes(32), serviceToken: randomBytes(32) };
const token = keys.serviceToken.toString('base64');
const subjectHash = researchSubjectHash('user_synthetic'), chatId = '11111111-2222-4333-8444-555555555555';
const rid = n => '66666666-7777-4888-9999-' + String(n).padStart(12, '0');
const prompt = 'Which interfaces does the RP2040 PIO support?';
const answer = { outcome: 'evidence', text: 'PIO supports UART and SPI.', citations: [{ id: 'S1', title: 'RP2040', sourceUrl: 'https://example.com/a', capturedAt: '2026-11-11T00:00:00.000Z', quote: 'PIO state machines', sectionPath: [] }] };
const usage = { calls: 3, inputTokens: 9000, outputTokens: 500, costNanoUsd: 2172800 };
const zero = { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 };
const dispatch = (action, n, text = prompt, over = {}) => ({ v: 1, action, subjectHash, chatId, requestId: rid(n), profile: 'tavily-hosted-haiku', modelId: 'anthropic/claude-haiku-5.5', promptHash: researchPromptHash(text), exp: secs() + 30, ...over });
const request = (method, url, d, extra = {}) => {
  const mac = signDispatch(keys.dispatchKey, d, secs());
  return { method, path: url, headers: { authorization: 'Bearer ' + token }, body: Buffer.from(JSON.stringify({ dispatch: d, mac, ...extra })) };
};
const turn = (n, text = prompt) => request('POST', '/v1/research/turns', dispatch('turn', n, text), { prompt: text });
const collect = async res => { const lines = []; for await (const l of res.stream) lines.push(JSON.parse(l)); return lines; };
function setup(runner) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-research-handler-')), handler = createResearchServiceHandler({ root, keys, runner, now, cancelWaitMs: 2000 });
  return { root, handler, requests: path.join(root, 'requests'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const okRunner = () => {
  const r = { calls: 0, async run(input, hooks) { r.calls++; hooks.onProgress('searching_web'); hooks.onProgress('checking_citations'); await hooks.onLease('panda-n45-' + 'a'.repeat(32)); return { state: 'evidence', answer, usage }; } };
  return r;
};

test('turn streams progress then one result whose MAC verifies; the result is persisted unsigned before the final line', async () => {
  const runner = okRunner(), s = setup(runner);
  try {
    const res = await s.handler.handle(turn(1)); assert.equal(res.status, 200); assert.equal(res.contentType, 'application/x-ndjson');
    const lines = []; let persistedAtFinal;
    for await (const l of res.stream) { const v = JSON.parse(l); lines.push(v); if (v.type === 'result') persistedAtFinal = JSON.parse(fs.readFileSync(path.join(s.requests, fs.readdirSync(s.requests)[0]), 'utf8')); }
    assert.deepEqual(lines.map(l => l.type), ['progress', 'progress', 'result']);
    assert.deepEqual(lines.slice(0, 2).map(l => l.stage), ['searching_web', 'checking_citations']);
    const final = lines[2]; assert.equal(verifyResult(keys.resultKey, final.payload, final.mac, secs()), true);
    assert.equal(final.payload.state, 'evidence'); assert.deepEqual(final.answer, answer); assert.deepEqual(final.payload.usage, usage);
    assert.equal(persistedAtFinal.state, 'evidence'); assert.equal(persistedAtFinal.mac, undefined, 'stored result is unsigned'); assert.equal(persistedAtFinal.lease, 'panda-n45-' + 'a'.repeat(32));
    if (process.platform !== 'win32') {
      for (const name of fs.readdirSync(s.requests)) assert.equal(fs.statSync(path.join(s.requests, name)).mode & 0o777, 0o600);
      assert.equal(fs.statSync(s.requests).mode & 0o777, 0o700);
    }
  } finally { s.cleanup(); }
});

test('same request replays the stored result re-signed with a fresh expiry; the runner is never re-run', async () => {
  const runner = okRunner(), s = setup(runner);
  try {
    const first = (await collect(await s.handler.handle(turn(2)))).at(-1);
    clock += 200000; // the first MAC (exp 120 s) has expired
    assert.equal(verifyResult(keys.resultKey, first.payload, first.mac, secs()), false);
    const second = (await collect(await s.handler.handle(turn(2)))).at(-1);
    assert.equal(runner.calls, 1); assert.equal(verifyResult(keys.resultKey, second.payload, second.mac, secs()), true);
    assert.equal(second.payload.answerHash, first.payload.answerHash); assert.ok(second.payload.exp > first.payload.exp);
    const status = await s.handler.handle(request('GET', '/v1/research/turns/' + rid(2), dispatch('status', 2)));
    assert.equal(status.status, 200); assert.equal(verifyResult(keys.resultKey, status.json.payload, status.json.mac, secs()), true);
  } finally { s.cleanup(); }
});

test('a different prompt or profile for the same request is a 409 and never runs', async () => {
  const runner = okRunner(), s = setup(runner);
  try {
    await collect(await s.handler.handle(turn(3)));
    assert.equal((await s.handler.handle(turn(3, 'A different question entirely'))).status, 409);
    const other = request('POST', '/v1/research/turns', dispatch('turn', 3, prompt, { profile: 'tavily-hosted-luna', modelId: 'openai/gpt-6-luna' }), { prompt });
    assert.equal((await s.handler.handle(other)).status, 409);
    assert.equal(runner.calls, 1);
  } finally { s.cleanup(); }
});

test('busy: a second request while a turn runs gets a signed failed:busy result and the runner is not called', async () => {
  let release; const held = new Promise(r => { release = r; });
  const runner = { calls: 0, async run() { runner.calls++; await held; return { state: 'insufficient', answer: { outcome: 'insufficient', text: 'x', citations: [] }, usage }; } };
  const s = setup(runner);
  try {
    const pending = collect(await s.handler.handle(turn(4)));
    const second = (await collect(await s.handler.handle(turn(5)))).at(-1);
    assert.equal(second.payload.state, 'failed'); assert.equal(second.payload.reason, 'busy'); assert.equal(verifyResult(keys.resultKey, second.payload, second.mac, secs()), true);
    assert.deepEqual(second.payload.usage, zero); assert.equal(runner.calls, 1);
    const attached = collect(await s.handler.handle(turn(4))); // same-request retry attaches instead of starting another
    release(); const [a, b] = await Promise.all([pending, attached]);
    assert.equal(a.at(-1).payload.state, 'insufficient'); assert.equal(b.at(-1).payload.state, 'insufficient'); assert.equal(runner.calls, 1);
  } finally { release(); s.cleanup(); }
});

test('runner-reported busy and thrown errors map to signed failed/unknown results', async () => {
  const s1 = setup({ async run() { return { state: 'failed', reason: 'busy', usage: zero }; } });
  const s2 = setup({ async run() { throw Error('boom'); } });
  try {
    assert.equal((await collect(await s1.handler.handle(turn(6)))).at(-1).payload.reason, 'busy');
    const r = (await collect(await s2.handler.handle(turn(7)))).at(-1); assert.equal(r.payload.state, 'unknown'); assert.equal(verifyResult(keys.resultKey, r.payload, r.mac, secs()), true);
  } finally { s1.cleanup(); s2.cleanup(); }
});

test('auth, envelope and input guards reject before any store or runner work', async () => {
  const runner = okRunner(), s = setup(runner);
  try {
    const good = turn(8);
    assert.equal((await s.handler.handle({ ...good, headers: { authorization: 'Bearer ' + 'f'.repeat(64) } })).status, 401);
    assert.equal((await s.handler.handle({ ...good, headers: {} })).status, 401);
    const tampered = JSON.parse(good.body.toString()); tampered.dispatch.chatId = rid(9);
    assert.equal((await s.handler.handle({ ...good, body: Buffer.from(JSON.stringify(tampered)) })).status, 403, 'bad MAC');
    const forged = JSON.parse(good.body.toString()); forged.mac = 'a'.repeat(64);
    assert.equal((await s.handler.handle({ ...good, body: Buffer.from(JSON.stringify(forged)) })).status, 403);
    assert.equal((await s.handler.handle(request('POST', '/v1/research/turns', dispatch('status', 8), { prompt }))).status, 403, 'wrong action for route');
    assert.equal((await s.handler.handle(request('POST', '/v1/research/turns/' + rid(1) + '/cancel', dispatch('cancel', 8)))).status, 403, 'path id must equal requestId');
    clock += 90000; assert.equal((await s.handler.handle(good)).status, 403, 'expired'); clock -= 90000;
    assert.equal((await s.handler.handle({ ...good, body: Buffer.alloc(16385) })).status, 413);
    assert.equal((await s.handler.handle(request('POST', '/v1/research/turns', dispatch('turn', 8), { prompt: 'different text' }))).status, 400, 'prompt must hash to promptHash');
    const big = 'é'.repeat(4001); // 8002 bytes
    assert.equal((await s.handler.handle(request('POST', '/v1/research/turns', dispatch('turn', 8, big), { prompt: big }))).status, 400, 'prompt <= 8000 UTF-8 bytes');
    assert.equal((await s.handler.handle({ ...good, path: '/v1/other' })).status, 404);
    assert.equal(runner.calls, 0); assert.equal(fs.existsSync(s.requests) ? fs.readdirSync(s.requests).length : 0, 0);
  } finally { s.cleanup(); }
});

test('cancel aborts the runner, answers unknown (never evidence) and status guards prompt hash', async () => {
  const runner = { async run(input, hooks) { await new Promise(r => hooks.signal.addEventListener('abort', r)); return { state: 'unknown', usage: { calls: 1, inputTokens: 100, outputTokens: 10, costNanoUsd: 1000 } }; } };
  const s = setup(runner);
  try {
    const pending = collect(await s.handler.handle(turn(10)));
    const running = await s.handler.handle(request('POST', '/v1/research/turns/' + rid(10) + '/status', dispatch('status', 10)));
    assert.deepEqual(running.json, { type: 'status', state: 'running' });
    assert.equal((await s.handler.handle(request('POST', '/v1/research/turns/' + rid(10) + '/status', dispatch('status', 10, 'other')))).status, 409);
    assert.equal((await s.handler.handle(request('GET', '/v1/research/turns/' + rid(99), dispatch('status', 99)))).status, 404);
    const cancelled = await s.handler.handle(request('POST', '/v1/research/turns/' + rid(10) + '/cancel', dispatch('cancel', 10)));
    assert.equal(cancelled.status, 200); assert.equal(cancelled.json.payload.state, 'unknown'); assert.equal(cancelled.json.answer, undefined);
    assert.equal(verifyResult(keys.resultKey, cancelled.json.payload, cancelled.json.mac, secs()), true); assert.equal(cancelled.json.payload.usage.calls, 1);
    assert.equal((await pending).at(-1).payload.state, 'unknown');
  } finally { s.cleanup(); }
});

test('restart reconciliation turns running entries unknown, reclaims their lease and applies 7-day retention', async () => {
  let release; const held = new Promise(r => { release = r; }), lease = 'panda-n45-' + 'b'.repeat(32);
  const runner = { async run(input, hooks) { await hooks.onLease(lease); await held; return { state: 'insufficient', answer: { outcome: 'insufficient', text: 'x', citations: [] }, usage }; } };
  const s = setup(runner);
  try {
    void collect(await s.handler.handle(turn(11))); await new Promise(r => setTimeout(r, 50));
    const reclaimed = [], restarted = createResearchServiceHandler({ root: s.root, keys, now, runner: { run: async () => { throw Error('never'); }, reclaimLease: async l => { reclaimed.push(l); return true; } } });
    const old = JSON.parse(fs.readFileSync(path.join(s.requests, fs.readdirSync(s.requests)[0]), 'utf8')); // a stale terminal file is deleted
    fs.writeFileSync(path.join(s.requests, 'c'.repeat(64) + '.json'), JSON.stringify({ ...old, state: 'unknown', createdAt: now() - 8 * 24 * 3600 * 1000 }));
    assert.deepEqual(await restarted.reconcile(), { interrupted: 1, deleted: 1, skipped: 0, reclaimed: 1 }); assert.deepEqual(reclaimed, [lease]);
    const status = await restarted.handle(request('GET', '/v1/research/turns/' + rid(11), dispatch('status', 11)));
    assert.equal(status.json.payload.state, 'unknown'); assert.equal(verifyResult(keys.resultKey, status.json.payload, status.json.mac, secs()), true);
    assert.equal((await collect(await restarted.handle(turn(11)))).at(-1).payload.state, 'unknown');
  } finally { release(); s.cleanup(); }
});
