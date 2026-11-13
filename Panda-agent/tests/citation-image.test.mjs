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

test('product citations keep only PandaByte\'s own /api/media images; the picker prefers pinout drawings and skips duplicates', async () => {
  const { cleanAnswer } = await import('../src/server/chat-store.ts');
  const { ownMediaImages, pickPinoutImages } = await import('../src/search/citation-image.ts');
  const own = '/api/media/32cd920e-1111-4222-8333-444455556666';
  const product = cleanAnswer({ outcome: 'evidence', text: 'x', citations: [{ id: 'c1', title: 'xS3', capturedAt: '2026-11-13T00:00:00.000Z', quote: 'Pins.', sourceUrl: 'https://www.pandabyte.in/product-page/xs3', sectionPath: ['Pins'],
    images: [{ url: own, description: 'pinout' }, { url: 'https://evil.io/x.png', description: 'x' }, { url: '/api/media/../secret', description: 'x' }] }] });
  assert.deepEqual(product.citations[0].images, [{ url: own, description: 'pinout' }]);
  assert.deepEqual(ownMediaImages([{ url: own }, { url: own }, { url: 'http://x/api/media/' + own.slice(11) }]), [{ url: own, description: '' }]);
  const items = [
    { id: 'a1111111-1111-4111-8111-111111111111', alt: 'Standalone front view of the board with USB connector.' },
    { id: 'b2222222-2222-4222-8222-222222222222', alt: 'Standalone rear photograph of green xS3 with logo and physical pin labels.' },
    { id: 'c3333333-3333-4333-8333-333333333333', alt: 'Standalone rear photograph of green xS3 with logo and physical pin labels.' },
    { id: 'd4444444-4444-4444-8444-444444444444', alt: 'Color-coded xS3 pinout rendering with GPIO labels; preserve-original.' }];
  assert.deepEqual(pickPinoutImages(items), [
    { url: '/api/media/d4444444-4444-4444-8444-444444444444', description: 'Color-coded xS3 pinout rendering with GPIO labels' },
    { url: '/api/media/b2222222-2222-4222-8222-222222222222', description: 'Standalone rear photograph of green xS3 with logo and physical pin labels.' }]);
  assert.deepEqual(pickPinoutImages([items[0]]), [], 'no pin image, nothing shown');
});
