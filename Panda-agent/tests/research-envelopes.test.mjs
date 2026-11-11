import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { signDispatch, verifyDispatch, signResult, verifyResult, researchSubjectHash, researchRunId, researchPromptHash } from '../src/server/research-envelopes.ts';

const now = 1794400000, key = randomBytes(32), other = randomBytes(32);
const subjectHash = researchSubjectHash('user_synthetic'), chatId = '11111111-2222-4333-8444-555555555555', requestId = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const dispatch = () => ({ v: 1, action: 'turn', subjectHash, chatId, requestId, profile: 'tavily-hosted-haiku', modelId: 'anthropic/claude-haiku-5.5', promptHash: researchPromptHash('Which interfaces?'), exp: now + 60 });
const result = () => ({ v: 1, subjectHash, chatId, requestId, runId: researchRunId(subjectHash, chatId, requestId), profile: 'tavily-hosted-haiku', modelId: 'anthropic/claude-haiku-5.5',
  promptHash: researchPromptHash('Which interfaces?'), state: 'evidence', answerHash: 'a'.repeat(64), usage: { calls: 3, inputTokens: 9000, outputTokens: 500, costNanoUsd: 2172800 }, exp: now + 120 });

test('dispatch and result envelopes round-trip and reject every field tamper, wrong key and expiry', () => {
  const d = dispatch(), dm = signDispatch(key, d, now);
  assert.equal(verifyDispatch(key, d, dm, now), true);
  assert.equal(verifyDispatch(other, d, dm, now), false);
  for (const [field, value] of Object.entries({ action: 'status', subjectHash: 'b'.repeat(64), chatId: requestId, requestId: chatId, profile: 'tavily-hosted-luna', promptHash: 'c'.repeat(64), exp: now + 59 }))
    assert.equal(verifyDispatch(key, { ...d, [field]: value }, dm, now), false, field);
  assert.equal(verifyDispatch(key, d, dm, now + 61), false, 'expired');
  assert.equal(verifyDispatch(key, { ...d, extra: 1 }, dm, now), false, 'extra key');
  assert.throws(() => signDispatch(key, { ...d, modelId: 'openai/gpt-6-luna' }, now), 'profile/model mismatch is never signed');
  assert.throws(() => signDispatch(key, { ...d, exp: now + 3600 }, now), 'long-lived dispatch is never signed');
  const r = result(), rm = signResult(key, r, now);
  assert.equal(verifyResult(key, r, rm, now), true);
  for (const [field, value] of Object.entries({ chatId: requestId, subjectHash: 'b'.repeat(64), promptHash: 'c'.repeat(64), runId: 'd'.repeat(64), answerHash: 'e'.repeat(64), state: 'insufficient', modelId: 'openai/gpt-6-luna' }))
    assert.equal(verifyResult(key, { ...r, [field]: value }, rm, now), false, field);
  assert.equal(verifyResult(key, { ...r, usage: { ...r.usage, costNanoUsd: 1 } }, rm, now), false, 'usage');
  assert.equal(verifyResult(key, r, rm, now + 121), false, 'expired');
});

test('domain separation: a dispatch MAC never verifies as a result and vice versa', () => {
  const d = dispatch(), dm = signDispatch(key, d, now), r = result(), rm = signResult(key, r, now);
  assert.equal(verifyResult(key, d, dm, now), false);
  assert.equal(verifyDispatch(key, r, rm, now), false);
});

test('result state shapes: answerHash only for answers, reason only for failures, bounded usage', () => {
  const base = result();
  const failed = { ...base, state: 'failed', reason: 'busy', usage: { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 } };delete failed.answerHash;
  assert.ok(verifyResult(key, failed, signResult(key, failed, now), now));
  const unknown = { ...base, state: 'unknown' };delete unknown.answerHash;
  assert.ok(verifyResult(key, unknown, signResult(key, unknown, now), now));
  for (const bad of [{ ...failed, reason: 'other' }, { ...failed, answerHash: 'a'.repeat(64) }, { ...unknown, reason: 'busy' }, { ...base, usage: { ...base.usage, calls: 7 } }, { ...base, answerHash: undefined }])
    assert.throws(() => signResult(key, bad, now));
  assert.throws(() => signResult(Buffer.alloc(16), base, now), 'short key');
  assert.match(researchRunId(subjectHash, chatId, requestId), /^[a-f0-9]{64}$/);
  assert.notEqual(researchRunId(subjectHash, chatId, requestId), researchRunId(subjectHash, requestId, chatId));
});
