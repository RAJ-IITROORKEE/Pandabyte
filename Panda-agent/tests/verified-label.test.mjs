import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isListingVerified, isPriceQuestion, distinctProductPages } from '../src/ui/answer-provenance.ts';

const p = (slug, host = 'www.pandabyte.in') => ({ title: slug, sourceUrl: `https://${host}/product-page/${slug}` });

test('listing verification needs every citation to be a pandabyte.in product page', () => {
  assert.equal(isListingVerified([p('xc3'), p('xc5', 'pandabyte.in')]), true);
  assert.equal(isListingVerified([p('xc3'), { title: 'w', sourceUrl: 'https://example.com/product-page/x' }]), false);
  assert.equal(isListingVerified([{ title: 'w', sourceUrl: 'https://pandabyte.in.evil.com/product-page/x' }]), false);
  assert.equal(isListingVerified([]), false);
  assert.equal(isPriceQuestion('How much flash does the PandaByte xS3 board have?'), false);
  assert.equal(isPriceQuestion('How much is the xC3 board?'), true);
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

test('a datasheet excerpt under the product page is not labelled as PandaByte listing text', async () => {
  const { isListingVerified, citesManufacturerDatasheet } = await import('../src/ui/answer-provenance.ts');
  const listing = { title: 'xC3', sourceUrl: 'https://www.pandabyte.in/product-page/xc3', sectionPath: ['PandaByte xC3 ESP32-C3 Development Board', 'Specification claims'] };
  const datasheet = { ...listing, sectionPath: ['PandaByte xC3 ESP32-C3 Development Board', 'Espressif ESP32-C3-WROOM-02 datasheet', 'Pin definitions'] };
  assert.equal(isListingVerified([listing]), true);
  assert.equal(isListingVerified([listing, datasheet]), false);
  assert.equal(citesManufacturerDatasheet([listing, datasheet]), true);
  assert.equal(citesManufacturerDatasheet([listing]), false);
  assert.equal(citesManufacturerDatasheet([{ ...datasheet, sourceUrl: 'https://example.com/x' }]), false);
});

test('a vague nudge after a paused web-search reply re-asks the paused question', async () => {
  const { retryAfterPause, researchPausedText } = await import('../src/ui/answer-provenance.ts');
  const history = [{ role: 'user', text: 'hi tell me about pandabyte xc3 board' }, { role: 'assistant', text: researchPausedText }];
  for (const nudge of ['now tell me', 'Now tell me.', 'try again', 'ok, answer it', 'answer it please', 'go ahead']) assert.equal(retryAfterPause(nudge, history), 'hi tell me about pandabyte xc3 board', nudge);
  for (const other of ['tell me about the xS3', 'what is its flash?', 'now tell me a joke']) assert.equal(retryAfterPause(other, history), other, other);
  assert.equal(retryAfterPause('now tell me', [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'An answer.' }]), 'now tell me');
});
