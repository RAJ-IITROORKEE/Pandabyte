import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isListingVerified, isPriceQuestion, distinctProductPages } from '../src/ui/answer-provenance.ts';

const p = (slug, host = 'www.pandabyte.in') => ({ title: slug, sourceUrl: `https://${host}/product-page/${slug}` });

test('listing verification needs every citation to be a pandabyte.in product page', () => {
  assert.equal(isListingVerified([p('xc3'), p('xc5', 'pandabyte.in')]), true);
  assert.equal(isListingVerified([p('xc3'), { title: 'w', sourceUrl: 'https://example.com/product-page/x' }]), false);
  assert.equal(isListingVerified([{ title: 'w', sourceUrl: 'https://pandabyte.in.evil.com/product-page/x' }]), false);
  assert.equal(isListingVerified([]), false);
  assert.equal(isListingVerified([{ ...p('xc3'), sectionPath: ['Web search excerpt (Tavily)'] }]), false);
});

test('price and stock questions are detected', () => {
  for (const q of ['what is the price of xC3', 'is it in stock', 'how much does it cost']) assert.equal(isPriceQuestion(q), true, q);
  assert.equal(isPriceQuestion('what is the flash size'), false);
  assert.equal(isPriceQuestion(null), false);
});

test('product pages are de-duplicated', () => {
  assert.equal(distinctProductPages([p('xc3'), p('xc3'), p('xc5')]).length, 2);
});
