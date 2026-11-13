import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTokens, turnUsageFor, hostedContextWindows, hostedDirectModelIds } from '../src/hosted-model.ts';

test('formatTokens is short and stable', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(950), '950');
  assert.equal(formatTokens(1000), '1k');
  assert.equal(formatTokens(5200), '5.2k');
  assert.equal(formatTokens(131072), '131k');
  assert.equal(formatTokens(1050000), '1.05M');
  assert.equal(formatTokens(1500000), '1.5M');
  assert.equal(formatTokens(-1), '0');
});

test('every hosted chat model has a context window; unknown models show none', () => {
  for (const id of hostedDirectModelIds) assert.ok(hostedContextWindows[id] > 0, id);
  assert.deepEqual(turnUsageFor('openai/gpt-oss-20b', { inputTokens: 5100, outputTokens: 400 }), { inputTokens: 5100, outputTokens: 400, contextWindow: 131072, model: 'openai/gpt-oss-20b' });
  assert.equal(turnUsageFor('unknown/model', { inputTokens: 1, outputTokens: 1 }).contextWindow, null);
});
