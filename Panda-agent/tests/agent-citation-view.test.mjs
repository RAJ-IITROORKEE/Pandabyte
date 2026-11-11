import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortTitle, excerpt, visibleCards, sectionLabel, sharedTitle, sourceLabels } from '../src/ui/agent/citation-view.ts';

const view = (n, title, section, quote = 'A quote about the board.') => ({ id: 'S' + n, n, title, domain: 'example.com', quote, section });

test('sectionLabel uses the last heading, softens all caps, and skips a repeat of the title', () => {
  assert.equal(sectionLabel(['Board X', 'PRODUCT INFO'], 'Board X'), 'Product info');
  assert.equal(sectionLabel(['Board X', 'Pinout and power'], 'Board X'), 'Pinout and power');
  assert.equal(sectionLabel(['Board X'], 'Board X'), undefined);
  assert.equal(sectionLabel([], 'Board X'), undefined);
});

test('repeated titles are told apart by section, then by excerpt number', () => {
  const views = [view(1, 'Board X', 'Product info'), view(2, 'Board X', undefined), view(3, 'Other page', 'Specs')];
  const labels = sourceLabels(views);
  assert.deepEqual(labels.get('S1'), { primary: 'Product info', secondary: 'A quote about the board.' });
  assert.equal(labels.get('S2').primary, 'Excerpt 2');
  assert.deepEqual(labels.get('S3'), { primary: 'Other page', secondary: 'Specs' });
  assert.equal(sharedTitle(views), undefined);
  assert.equal(sharedTitle([view(1, 'Board X'), view(2, 'Board X')]), 'Board X');
  assert.equal(sharedTitle([view(1, 'Board X')]), undefined);
});

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
