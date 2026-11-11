import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createResearchChat, researchProfileFor, withResearch, researchWebSearchEnabled } from '../src/server/research-chat.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const key = randomBytes(32).toString('hex'), subject = 'user_owner';
const turn = { thread: '10000000-0000-4000-8000-000000000001', request: '20000000-0000-4000-8000-000000000001', question: 'Which interfaces does the RP2040 PIO support?', webSearch: true };
const answer = { outcome: 'evidence', text: 'PIO implements UART and SPI.', citations: [{ id: 'S1', title: 'RP2040', sourceUrl: 'https://www.raspberrypi.com/x', capturedAt: '2026-11-12T00:00:00Z', quote: 'PIO', sectionPath: [] }] };
const usage = { calls: 2, inputTokens: 4000, outputTokens: 300, costNanoUsd: 600000 };

// A fake D1 journal: verifies the HMAC like panda_agent_llm_verify and keeps one turn's state.
function rig({ admin = true, searchAllowed = true, claimExecute = true, gateway = {}, claimLost = false, onClaim } = {}) {
  const ops = [], calls = { turn: 0, status: 0, cancel: 0 }; let row = null;
  const rpc = async (name, params) => {
    if (name === 'panda_agent_web_search_consume') { ops.push('consume:' + params.p_limit); return { data: { allowed: searchAllowed, used: 1, limit: params.p_limit }, error: null }; }
    assert.equal(name, 'panda_agent_research_chat_v1');
    assert.equal(createHmac('sha256', Buffer.from(key, 'hex')).update('panda-llm-db-v1\n' + params.p_payload).digest('hex'), params.p_mac);
    const p = JSON.parse(params.p_payload); assert.equal(p.action, 'research_chat'); assert.equal(p.subject, subject);
    const { op, ...v } = p.input; ops.push(op);
    if (!admin) return { data: null, error: { code: 'P0001', details: 'forbidden' } };
    if (op === 'state') return { data: row && { question: row.question, status: row.status, claimed: row.claimed, cancelled: false, failed: !!row.failed, unknown: false, profile: row.profile }, error: null };
    if (op === 'begin') { const admitted = !row; row ??= { question: v.question, profile: v.profile, status: 'pending', claimed: false }; return { data: { admitted }, error: null }; }
    if (op === 'claim') { if (claimExecute) row.claimed = true; onClaim?.(); if (claimLost) return { data: null, error: { message: 'network' } }; return { data: claimExecute ? { execute: true } : { execute: false, reason: 'budget' }, error: null }; }
    if (op === 'receipt') { row.receipt = v; return { data: { recorded: true }, error: null }; }
    if (op === 'finish') { row.status = 'complete'; row.answer = v.answer; return { data: {}, error: null }; }
    if (op === 'fail') { row.status = 'complete'; row.failed = v.reason; row.failUsage = v.usage; return { data: {}, error: null }; }
    if (op === 'cancel') { row.status = 'complete'; return { data: {}, error: null }; }
    throw Error('op ' + op);
  };
  const g = { turn: async () => { calls.turn++; return gateway.turn ? gateway.turn() : { state: 'evidence', answer, answerHash: 'a'.repeat(64), usage }; },
    status: async () => { calls.status++; return gateway.status ? gateway.status() : { state: 'running' }; }, cancel: async () => { calls.cancel++; return { state: 'unknown' }; } };
  let t = 0;
  const chat = createResearchChat({ actor: { subject, client: { database: { rpc } } }, key, current: async () => true, profile: 'tavily-hosted-haiku', searchLimit: 20,
    gateway: () => g, now: () => t, sleep: async ms => { t += ms; }, pollMs: 3000, deadlineMs: 330000 });
  return { chat, ops, calls, row: () => row };
}
const signal = () => new AbortController().signal;

test('a web-search turn begins, uses one daily search, claims, dispatches once and saves the verified cited answer', async () => {
  const r = rig(), stages = [];
  assert.deepEqual(await r.chat.start(turn, signal(), s => stages.push(s)), { status: 'saved' });
  assert.deepEqual(r.ops, ['state', 'begin', 'consume:20', 'claim', 'receipt', 'finish']);
  assert.equal(r.calls.turn, 1); assert.deepEqual(r.row().answer, answer); assert.deepEqual(r.row().receipt.usage, usage);
  assert.match(r.row().receipt.promptHash, /^[a-f0-9]{64}$/); assert.match(r.row().receipt.runId, /^[a-f0-9]{64}$/);
  assert.deepEqual(stages, ['routing_question', 'searching_web', 'saving_answer']);
  assert.deepEqual(await r.chat.start(turn, signal()), { status: 'saved' }, 'replay reads state, never dispatches again'); assert.equal(r.calls.turn, 1);
  await assert.rejects(r.chat.start({ ...turn, question: 'Something else?' }, signal()), e => e instanceof ChatStoreError && e.code === 'conflict');
});

test('the daily search limit and the $1 claim budget stop a turn before any dispatch, saved as a fixed failure', async () => {
  for (const options of [{ searchAllowed: false }, { claimExecute: false }]) {
    const r = rig(options);
    assert.deepEqual(await r.chat.start(turn, signal()), { status: 'saved' });
    assert.equal(r.calls.turn, 0); assert.equal(r.row().failed, 'budget'); assert.deepEqual(r.row().failUsage, { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 });
  }
});

test('host failures save their reason; an uncertain dispatch is polled by status, never re-sent', async () => {
  const failed = rig({ gateway: { turn: () => ({ state: 'failed', reason: 'attestation_expired', usage: { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 } }) } });
  assert.deepEqual(await failed.chat.start(turn, signal()), { status: 'saved' }); assert.equal(failed.row().failed, 'attestation_expired');

  let polls = 0;
  const late = rig({ gateway: { turn: () => ({ state: 'unknown' }), status: () => ++polls < 3 ? { state: 'running' } : { state: 'evidence', answer, answerHash: 'a'.repeat(64), usage } } });
  assert.deepEqual(await late.chat.start(turn, signal()), { status: 'saved' }); assert.equal(late.calls.turn, 1); assert.equal(late.calls.status, 3);

  const stuck = rig({ gateway: { turn: () => ({ state: 'unknown' }) } });
  assert.deepEqual(await stuck.chat.start(turn, signal()), { status: 'unknown' });
  assert.equal(stuck.calls.turn, 1); assert.equal(stuck.calls.status, 110, '330 s deadline at 3 s steps'); assert.equal(stuck.row().status, 'pending', 'left claimed for later status');
  assert.deepEqual(await stuck.chat.status(turn, signal()), { status: 'unknown' }); assert.equal(stuck.calls.turn, 1);

  const thrown = rig({ gateway: { turn: () => { throw Error('network'); } } });
  assert.deepEqual(await thrown.chat.start(turn, signal()), { status: 'unknown' }); assert.equal(thrown.calls.turn, 1);
});

test('cancel asks the host to stop a claimed turn and saves the fixed cancel text; non-Admins see no research turns', async () => {
  const r = rig({ gateway: { turn: () => ({ state: 'unknown' }), status: () => ({ state: 'not_found' }) } });
  await r.chat.start(turn, signal());
  assert.deepEqual(await r.chat.cancel(turn, signal()), { status: 'saved' }); assert.equal(r.calls.cancel, 1); assert.equal(r.row().status, 'complete');
  const outsider = rig({ admin: false });
  assert.equal(await outsider.chat.state(turn.thread, turn.request), false);
  await assert.rejects(outsider.chat.start(turn, signal()), ChatStoreError);
  assert.equal(outsider.calls.turn, 0);
});

test('the model picker maps to research profiles; GPT-OSS and no header use Haiku', () => {
  assert.equal(researchProfileFor('anthropic/claude-haiku-5.5'), 'tavily-hosted-haiku');
  assert.equal(researchProfileFor('openai/gpt-6-luna'), 'tavily-hosted-luna');
  assert.equal(researchProfileFor('openai/gpt-6.1-terra'), 'tavily-hosted-terra');
  assert.equal(researchProfileFor('openai/gpt-oss-20b'), 'tavily-hosted-haiku');
  assert.equal(researchProfileFor(null), 'tavily-hosted-haiku');
});


test('a committed claim that never dispatches (lost claim response, or abort before dispatch) closes with zero usage', async () => {
  const zero = { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 };
  const lost = rig({ claimLost: true });
  await assert.rejects(lost.chat.start(turn, signal()), ChatStoreError);
  assert.equal(lost.calls.turn, 0); assert.equal(lost.row().claimed, true); assert.equal(lost.row().failed, 'invalid'); assert.deepEqual(lost.row().failUsage, zero);

  const controller = new AbortController(), aborted = rig({ onClaim: () => controller.abort() });
  assert.deepEqual(await aborted.chat.start(turn, controller.signal), { status: 'saved' });
  assert.equal(aborted.calls.turn, 0); assert.equal(aborted.row().failed, 'invalid'); assert.deepEqual(aborted.row().failUsage, zero);
});

test('withResearch: web-search turns and research-owned ids go to research; a failing research lookup never breaks ordinary chat', async () => {
  const log = [], bridge = (name, owns) => ({ state: async () => { log.push(name + '.state'); if (owns instanceof Error) throw owns; return owns; },
    start: async () => { log.push(name + '.start'); return { status: 'saved' }; }, status: async () => { log.push(name + '.status'); return { status: 'saved' }; }, cancel: async () => { log.push(name + '.cancel'); return { status: 'saved' }; } });
  const ref = { thread: turn.thread, request: turn.request };
  let w = withResearch(bridge('base', true), bridge('research', false));
  await w.start({ ...turn, webSearch: false }, signal()); await w.start(turn, signal()); await w.status(ref, signal()); await w.cancel(ref, signal());
  assert.deepEqual(log.filter(x => !x.endsWith('.state')), ['base.start', 'research.start', 'base.status', 'base.cancel']);
  log.length = 0; w = withResearch(bridge('base', false), bridge('research', true));
  await w.status(ref, signal()); await w.cancel(ref, signal()); assert.equal(await w.state(ref.thread, ref.request), true);
  assert.deepEqual(log.filter(x => !x.endsWith('.state')), ['research.status', 'research.cancel']);
  for (const error of [new ChatStoreError('unavailable'), new ChatStoreError('not_found'), Error('PRIVATE')]) {
    log.length = 0; w = withResearch(bridge('base', true), bridge('research', error));
    assert.equal(await w.state(ref.thread, ref.request), true); await w.status(ref, signal()); assert.ok(log.includes('base.status'));
  }
  await assert.rejects(withResearch(bridge('base', true), bridge('research', new ChatStoreError('unauthenticated'))).state(ref.thread, ref.request), e => e.code === 'unauthenticated');
});

test('researchWebSearchEnabled requires the flag, endpoint, role and two exact 32-byte base64 keys', () => {
  const k = () => randomBytes(32).toString('base64');
  const env = { PANDA_AGENT_RESEARCH_ENABLED: 'true', PANDA_RESEARCH_ENDPOINT: 'https://abcde12345.execute-api.ap-south-1.amazonaws.com/research', PANDA_RESEARCH_CALLER_ROLE_ARN: 'arn:aws:iam::123456789012:role/x', PANDA_RESEARCH_DISPATCH_KEY: k(), PANDA_RESEARCH_RESULT_KEY: k() };
  assert.equal(researchWebSearchEnabled(env), true);
  for (const [name, value] of [['PANDA_AGENT_RESEARCH_ENABLED', 'false'], ['PANDA_RESEARCH_ENDPOINT', ''], ['PANDA_RESEARCH_CALLER_ROLE_ARN', undefined], ['PANDA_RESEARCH_DISPATCH_KEY', randomBytes(16).toString('base64')], ['PANDA_RESEARCH_RESULT_KEY', 'not base64!']])
    assert.equal(researchWebSearchEnabled({ ...env, [name]: value }), false, name);
});

test('saved research answers with web or category citations (empty sectionPath) read back; unsafe URLs still fail', async () => {
  const { cleanAnswer } = await import('../src/server/chat-store.ts');
  const cite = (sourceUrl, sectionPath = []) => ({ id: 'S1', title: 'm5-docs', sourceUrl, capturedAt: '2026-11-11T22:44:05.365Z', quote: 'ESP32-S3-PICO-1-N8R8', sectionPath });
  for (const url of ['https://docs.m5stack.com/en/core/AtomS3R', 'https://www.pandabyte.in/category/microcontroller', 'https://www.pandabyte.in/product-page/x'])
    assert.equal(cleanAnswer({ outcome: 'evidence', text: 'An answer.', citations: [cite(url)] }).citations[0].sourceUrl, url);
  for (const url of ['http://docs.m5stack.com/x', 'https://localhost/x', 'https://docs.m5stack.com/x?q=1', 'https://user:pw@docs.m5stack.com/x'])
    assert.throws(() => cleanAnswer({ outcome: 'evidence', text: 'An answer.', citations: [cite(url)] }), String(url));
  assert.throws(() => cleanAnswer({ outcome: 'evidence', text: 'x', citations: [cite('https://docs.m5stack.com/en/core/AtomS3R', ['Some section'])] }), 'a non-web section path is not treated as web');
});
