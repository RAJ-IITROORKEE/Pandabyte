import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownUrl } from '../src/ui/markdown-url.ts';

test('model markdown allows only credential-free HTTP links and never loads images', () => {
  assert.equal(markdownUrl('https://example.com/path', 'href'), 'https://example.com/path');
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', '//example.com/x', '/account', 'https://user:pass@example.com/']) assert.equal(markdownUrl(url, 'href'), '');
  assert.equal(markdownUrl('https://example.com/tracker.png', 'src'), '');
});
