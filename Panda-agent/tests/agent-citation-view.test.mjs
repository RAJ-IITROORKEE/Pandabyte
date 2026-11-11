import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortTitle, excerpt, visibleCards } from '../src/ui/agent/citation-view.ts';

test('shortTitle trims and cuts with ellipsis', () => {
  assert.equal(shortTitle('  Hello   world  '), 'Hello world');
  const t = shortTitle('x'.repeat(100));
  assert.equal(t.length, 48);
  assert.ok(t.endsWith('…'));
  assert.equal(shortTitle('abcdef', 4), 'abc…');
});

test('excerpt cuts on a word boundary', () => {
  assert.equal(excerpt('short quote'), 'short quote');
  const e = excerpt('word '.repeat(100), 30);
  assert.ok(e.endsWith('…') && e.length <= 30 && !e.includes('wor…'));
});

test('visibleCards caps at max and counts the rest', () => {
  assert.deepEqual(visibleCards([1, 2]), { shown: [1, 2], more: 0 });
  assert.deepEqual(visibleCards([1, 2, 3, 4, 5]), { shown: [1, 2, 3], more: 2 });
  assert.deepEqual(visibleCards([1, 2, 3], 1), { shown: [1], more: 2 });
});
