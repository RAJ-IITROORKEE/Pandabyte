import test from 'node:test';
import assert from 'node:assert/strict';
import { citationImage, citationImages } from '../src/search/citation-image.ts';

const page = 'https://docs.m5stack.com/en/core/AtomS3';
test('same-site https images are kept with a cleaned description', () => {
  assert.deepEqual(citationImage(page, { url: 'https://static-cdn.m5stack.com/resource/docs/atoms3_pinout.webp', description: ' AtomS3\u0000 pin map\n' }),
    { url: 'https://static-cdn.m5stack.com/resource/docs/atoms3_pinout.webp', description: 'AtomS3 pin map' });
  assert.equal(citationImage('https://www.example.co.uk/a', { url: 'https://cdn.example.co.uk/p.png' })?.description, '');
});
test('foreign hosts, svg, non-https, credentials, IPs and junk are dropped', () => {
  for (const url of ['https://evil.example.com/x.png', 'https://static-cdn.m5stack.com/x.svg', 'http://docs.m5stack.com/x.png', 'https://u:p@docs.m5stack.com/x.png',
    'https://docs.m5stack.com:8443/x.png', 'https://192.168.1.4/x.png', 'https://m5stack.com.evil.io/x.png', 'javascript:alert(1)', 'https://docs.m5stack.com/x.png#a'])
    assert.equal(citationImage(page, { url }), null, url);
  for (const v of [null, 'x', [], { url: 5 }, { url: 'https://docs.m5stack.com/a.png', description: 3 }, { url: 'https://docs.m5stack.com/' + 'a'.repeat(500) }]) assert.equal(citationImage(page, v), null);
  assert.equal(citationImage('https://other.co.uk/a', { url: 'https://cdn.example.co.uk/p.png' }), null);
});
test('at most two distinct images per citation', () => {
  const imgs = ['a', 'a', 'b', 'c'].map(n => ({ url: `https://docs.m5stack.com/${n}.png` }));
  assert.deepEqual(citationImages(page, imgs).map(i => i.url), ['https://docs.m5stack.com/a.png', 'https://docs.m5stack.com/b.png']);
  assert.deepEqual(citationImages(page, 'nope'), []);
});
test('saved answers keep images on web citations only', async () => {
  const { cleanAnswer } = await import('../src/server/chat-store.ts');
  const base = { id: 'c1', title: 'AtomS3', capturedAt: '2026-11-13T00:00:00.000Z', quote: 'Pin map.' };
  const images = [{ url: 'https://static-cdn.m5stack.com/p.png', description: 'pins' }, { url: 'https://evil.io/x.png' }];
  const web = cleanAnswer({ outcome: 'evidence', text: 'x', citations: [{ ...base, sourceUrl: page, sectionPath: [], images }] });
  assert.deepEqual(web.citations[0].images, [images[0]]);
  const product = cleanAnswer({ outcome: 'evidence', text: 'x', citations: [{ ...base, sourceUrl: 'https://www.pandabyte.in/product-page/xs3', sectionPath: ['Specs'], images: [{ url: 'https://www.pandabyte.in/p.png' }] }] });
  assert.equal('images' in product.citations[0], false);
});
