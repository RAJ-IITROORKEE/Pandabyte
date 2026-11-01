import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocalFiles, linkCitationMarkers } from '../src/ui/composer-helpers.ts';

test('local attachments enforce file type, count and size boundaries', () => {
  const image = { type: 'image/png', size: 5 * 1024 * 1024 };
  assert.equal(validateLocalFiles(2, [image]), true);
  assert.equal(validateLocalFiles(3, [image]), false);
  assert.equal(validateLocalFiles(0, [{ ...image, size: image.size + 1 }]), false);
  assert.equal(validateLocalFiles(0, [{ type: 'text/html', size: 10 }]), false);
  assert.equal(validateLocalFiles(0, [{ type: 'text/plain', size: 10 }]), true);
});

test('only known citation markers in prose become source links', () => {
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [
    { type: 'text', value: 'See [S1] and [S2].' },
    { type: 'inlineCode', value: '[S1]' },
    { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: '[S1]' }] },
  ] }] };
  linkCitationMarkers(tree, new Map([['S1', '#source-m-S1']]));
  const parts = tree.children[0].children;
  assert.equal(parts[1].url, '#source-m-S1');
  assert.equal(parts[2].value, ' and ');
  assert.equal(parts[3].value, '[S2]');
  assert.equal(parts[5].type, 'inlineCode');
  assert.equal(parts[6].children[0].type, 'text');
});
