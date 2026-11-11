import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences } from '../src/ui/agent/preferences.ts';

test('valid preferences are kept', () => {
  assert.deepEqual(parsePreferences(JSON.stringify({ defaultModel: 'anthropic/claude-haiku-5.5', webSearchDefault: true })), { defaultModel: 'anthropic/claude-haiku-5.5', webSearchDefault: true });
  assert.deepEqual(parsePreferences(JSON.stringify({ defaultModel: 'qwen/qwen3.8-27b' })), { defaultModel: 'qwen/qwen3.8-27b' });
});

test('broken, oversized or wrong-typed values are dropped', () => {
  for (const raw of [null, '', 'not json', '[]', '"x"', 'x'.repeat(3000)]) assert.deepEqual(parsePreferences(raw), {});
  assert.deepEqual(parsePreferences(JSON.stringify({ defaultModel: '<script>', webSearchDefault: 'yes' })), {});
  assert.deepEqual(parsePreferences(JSON.stringify({ defaultModel: 'a/'.repeat(80) + 'b' })), {});
});
