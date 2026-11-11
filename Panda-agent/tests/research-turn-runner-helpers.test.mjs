import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { researchBindingHash, decideEpoch, researchQueryInScope, aggregateResearchUsage, mapResearchAnswer, validateResearchAttestation, mcpConnected, parseMemoryProof, prefacedPrompt, researchPromptPreface,
  researchInsufficientText, researchContextResetNote, ResearchRunFailure } from '../src/server/research-turn-runner.ts';

const sha = s => createHash('sha256').update(s).digest('hex');

test('binding hash is deterministic per (subject, chat, epoch) and epoch rules start a fresh session only when needed', () => {
  const a = researchBindingHash('a'.repeat(64), 'chat', 1);
  assert.match(a, /^[a-f0-9]{64}$/); assert.equal(a, researchBindingHash('a'.repeat(64), 'chat', 1));
  assert.notEqual(a, researchBindingHash('a'.repeat(64), 'chat', 2)); assert.notEqual(a, researchBindingHash('b'.repeat(64), 'chat', 1)); assert.notEqual(a, researchBindingHash('a'.repeat(64), 'chat2', 1));
  const meta = { epoch: 1, profileHash: 'p'.repeat(64) }, ok = { create: 'created', activeRun: null };
  assert.deepEqual(decideEpoch({ meta: null, profileHash: meta.profileHash }), { newEpoch: true, first: true });
  assert.deepEqual(decideEpoch({ meta, profileHash: meta.profileHash, createState: 'existing', reconcile: ok }), { newEpoch: false, first: false });
  assert.deepEqual(decideEpoch({ meta, profileHash: meta.profileHash, createState: 'created', reconcile: { create: 'new', activeRun: null } }), { newEpoch: false, first: false }, 'binding made but session never created');
  for (const [name, input] of Object.entries({
    unfinished: { createState: 'existing', reconcile: { create: 'created', activeRun: 'run' } }, crashMidCreate: { createState: 'existing', reconcile: { create: 'claimed', activeRun: null } },
    conflict: { createState: 'conflict', reconcile: null }, modelSwitch: { profileHash: 'q'.repeat(64), createState: 'existing', reconcile: ok }, unreadable: { createState: 'existing', reconcile: null } }))
    assert.deepEqual(decideEpoch({ meta, profileHash: meta.profileHash, ...input }), { newEpoch: true, first: false }, name);
});

test('research query scope: shape plus every word from the prompt or the generic documentation list', () => {
  const prompt = 'Which interfaces does the RP2040 PIO support? Use ESP32-C3 too.';
  for (const q of ['RP2040 PIO official documentation', 'rp2040-pio interfaces', 'ESP32-C3 datasheet', 'PIO']) assert.equal(researchQueryInScope(q, prompt), true, q);
  for (const q of ['rp2040 pio secretproject', 'sk-or-v1-abc123def456', 'rp2040; DROP TABLE', 'rp2040 pio\nofficial', '', ' rp2040', 'rp2040  pio', 'rp2040 pio password', 'a'.repeat(401), 'rp2040 pio ' + 'docs '.repeat(12).trim(), 42, null])
    assert.equal(researchQueryInScope(q, prompt), false, String(q));
  assert.equal(researchQueryInScope('one two three four five six seven eight nine ten eleven twelve', 'one two three four five six seven eight nine ten eleven twelve'), true, '12 words');
  assert.equal(researchQueryInScope('one two three four five six seven eight nine ten eleven twelve thirteen', 'one two three four five six seven eight nine ten eleven twelve thirteen'), false, '13 words');
  assert.equal(researchQueryInScope('my private wifi password', 'What is the RP2040 PIO?'), false, 'private-looking words not in the prompt are refused');
  assert.ok(prefacedPrompt('Q?').startsWith(researchPromptPreface) && prefacedPrompt('Q?').endsWith('Q?'));
});

test('usage sums settled primary attempts and still counts a sent-but-unsettled call', () => {
  const settled = (i, o, c) => ({ state: 'settled', result: { usage: { inputTokens: i, outputTokens: o, costNanoUsd: c } } });
  assert.deepEqual(aggregateResearchUsage([]), { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 });
  assert.deepEqual(aggregateResearchUsage([settled(100, 10, 5), settled(200, 20, 7), { state: 'claimed' }]), { calls: 2, inputTokens: 300, outputTokens: 30, costNanoUsd: 12 });
  assert.deepEqual(aggregateResearchUsage([settled(100, 10, 5), { state: 'sent' }]), { calls: 2, inputTokens: 100, outputTokens: 10, costNanoUsd: 5 });
});

test('verified answers map to ChatAnswer shape with S1/S2 citations; insufficient uses the fixed host text', () => {
  const c = (n) => ({ handle: 'h' + n, url: 'https://example.com/' + n, title: 'T' + n, quote: 'Q' + n, capturedAt: '2026-11-11T00:00:00.000Z' });
  assert.deepEqual(mapResearchAnswer({ state: 'evidence', answer: 'A', citations: [c(1), c(2)] }), { outcome: 'evidence', text: 'A', citations: [
    { id: 'S1', title: 'T1', sourceUrl: 'https://example.com/1', capturedAt: '2026-11-11T00:00:00.000Z', quote: 'Q1', sectionPath: [] },
    { id: 'S2', title: 'T2', sourceUrl: 'https://example.com/2', capturedAt: '2026-11-11T00:00:00.000Z', quote: 'Q2', sectionPath: [] }] });
  assert.deepEqual(mapResearchAnswer({ state: 'insufficient' }), { outcome: 'insufficient', text: researchInsufficientText, citations: [] });
  assert.equal(mapResearchAnswer({ state: 'evidence', answer: 'A', citations: [c(1)] }, true).text, 'A' + researchContextResetNote);
});

test('attestation validation: shape, privacy profile, key hash, 24 h window and currency', () => {
  const key = 'sk-or-v1-' + 'a'.repeat(64), now = Date.parse('2026-11-11T12:00:00Z');
  const att = (over = {}) => ({ version: 1, reviewedAt: '2026-11-11T10:00:00Z', expiresAt: '2026-11-12T09:00:00Z', keySha256: sha(key), workspaceSha256: 'b'.repeat(64),
    privacy: { paidTraining: false, publicPrompts: false, dataDiscount: false, logging: false, traces: 'langsmith_metadata_only' }, ...over });
  assert.equal(validateResearchAttestation(att(), sha(key), now).version, 1);
  const reason = fn => { try { fn(); } catch (e) { assert.ok(e instanceof ResearchRunFailure); return e.reason; } assert.fail('expected failure'); };
  assert.equal(reason(() => validateResearchAttestation(att({ expiresAt: '2026-11-11T11:59:59Z' }), sha(key), now)), 'attestation_expired');
  assert.equal(reason(() => validateResearchAttestation(null, sha(key), now)), 'attestation_expired', 'none installed');
  assert.equal(reason(() => validateResearchAttestation(undefined, sha(key), now)), 'invalid');
  assert.equal(reason(() => validateResearchAttestation(att({ expiresAt: '2026-11-12T10:00:01Z' }), sha(key), now)), 'invalid', 'more than 24 h');
  assert.equal(validateResearchAttestation(att({ expiresAt: '2026-11-12T10:00:00Z' }), sha(key), now).version, 1, 'exactly 24 h');
  assert.equal(reason(() => validateResearchAttestation(att(), sha(key + 'x'), now)), 'invalid', 'key hash mismatch');
  assert.equal(reason(() => validateResearchAttestation(att({ reviewedAt: '2026-11-11T13:00:00Z', expiresAt: '2026-11-11T14:00:00Z' }), sha(key), now)), 'invalid', 'reviewed in the future');
  assert.equal(reason(() => validateResearchAttestation(att({ privacy: { paidTraining: true, publicPrompts: false, dataDiscount: false, logging: false, traces: 'langsmith_metadata_only' } }), sha(key), now)), 'invalid');
  assert.equal(reason(() => validateResearchAttestation({ ...att(), extra: 1 }, sha(key), now)), 'invalid');
  assert.equal(reason(() => validateResearchAttestation(att({ workspaceSha256: 'nope' }), sha(key), now)), 'invalid');
});

test('MCP readiness requires panda_research connected; memory proof parser fails closed', () => {
  assert.equal(mcpConnected({ data: [] }), false); assert.equal(mcpConnected([]), false); assert.equal(mcpConnected(null), false);
  assert.equal(mcpConnected({ data: [{ name: 'panda_research', status: { status: 'connecting' } }] }), false);
  assert.equal(mcpConnected({ data: [{ name: 'other', status: { status: 'connected' } }] }), false);
  assert.equal(mcpConnected({ data: [{ name: 'panda_research', status: { status: 'connected' } }] }), true);
  const id = 'a'.repeat(64), group = `0::/system.slice/docker-${id}.scope\n`;
  assert.deepEqual(parseMemoryProof(id, group, '123\n', 'oom 0\noom_kill 0\n'), { peakBytes: 123, oomKill: 0 });
  assert.equal(parseMemoryProof(id, group, '123', 'oom_kill 2').oomKill, 2);
  for (const [g, p, e] of [[group.replace(id, 'b'.repeat(64)), '123', 'oom_kill 0'], [group, 'max', 'oom_kill 0'], [group, '123', 'oom 0'], [group, '123', 'oom_kill 0\noom_kill 1']])
    assert.throws(() => parseMemoryProof(id, g, p, e));
});
