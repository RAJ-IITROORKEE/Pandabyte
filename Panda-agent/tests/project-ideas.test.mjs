import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectIdeasIntent, projectClarificationText, parseClarificationOptions } from '../src/retrieval/catalog-listing.ts';
import { resolveMultiProductIdentity } from '../src/retrieval/multi-product-identity.ts';
import { catalogListingAnswer } from '../src/server/main-rag-chat.ts';

const rows = JSON.parse(readFileSync(new URL('./fixtures/catalog-42.json', import.meta.url), 'utf8'));

test('project-idea questions about PandaByte devices ask which board', () => {
  for (const q of ['suggest me some projects to build i can using the pandabyte devices>?', 'What projects can I build with PandaByte boards?', 'Give me some project ideas using your boards'])
    assert.equal(projectIdeasIntent(q, false), true, q);
  for (const q of ['Suggest projects for the PandaByte xC3 board', 'Explain I2C', 'Suggest 3 beginner IoT projects for a student'])
    assert.equal(projectIdeasIntent(q, /xC3/.test(q)), false, q);
});

test('the clarification parses and every option names exactly one catalog product', () => {
  const answer = catalogListingAnswer('suggest me some projects to build i can using the pandabyte devices>?', rows);
  assert.equal(answer.outcome, 'clarification');
  const parsed = parseClarificationOptions(answer.text);
  assert.ok(parsed && parsed.options.length >= 2, answer.text);
  assert.equal(parsed.question, 'Which PandaByte board should the project use?');
  assert.equal(parsed.options.filter(o => o.recommended).length, 1);
  for (const option of parsed.options.filter(o => o.question.startsWith('Suggest projects'))) {
    const identity = resolveMultiProductIdentity(rows, option.question);
    assert.equal(identity.kind, 'planned', option.question);
    assert.equal(identity.products.length, 1, option.question);
  }
  assert.equal(projectClarificationText(rows), answer.text);
});

test('a named product is not a project-ideas clarification', () => {
  assert.equal(catalogListingAnswer('Suggest projects I can build with the PandaByte xC3 ESP32-C3 Development Board', rows), null);
});

test('an unmatched PandaByte question offers the closest products, and every catalog product is reachable from its option', async () => {
  const { matchingProducts } = await import('../src/retrieval/multi-product-identity.ts');
  const { productChoiceAnswer } = await import('../src/server/main-rag-chat.ts');
  const lora = matchingProducts(rows, 'Does PandaByte have a LoRa board?');
  assert.ok(lora.length >= 1 && lora.length <= 5 && lora.every(r => /lora/i.test(r.title)), JSON.stringify(lora.map(r => r.title)));
  assert.equal(lora[0].sku, 'XLORA');
  assert.deepEqual(matchingProducts(rows, 'Does PandaByte sell a quantum flux capacitor?'), []);
  for (const q of ['Does PandaByte sell a quantum flux capacitor?', 'What is the difference between ESP32 and ESP32-C3 for a PandaByte project?', 'PandaByte how do I write a Python script for LoRa gateway',
    'PandaByte what does GPS NMEA mean', 'Is PandaByte a good place to learn Arduino programming?', 'How do I build a LoRa weather station with PandaByte parts?']) assert.equal(productChoiceAnswer(q, rows), null, q);
  for (const q of ['Does PandaByte sell a GPS sensor?', 'what is the price of your esp32 c3 board', 'specs of the pandabyte esp32 c3 board']) assert.ok(productChoiceAnswer(q, rows), q);
  const picked = parseClarificationOptions(productChoiceAnswer('Does PandaByte have a LoRa board?', rows).text).options;
  assert.equal(picked.length, lora.length + 1);
  assert.deepEqual([picked[0].label, picked[0].question], ['Tell me about PandaByte xLoRa ESP32 LoRaWAN Development Board', 'Tell me about PandaByte xLoRa ESP32 LoRaWAN Development Board. Does PandaByte have a LoRa board']);
  for (const q of ['Which PandaByte ESP32 board has the most flash?', "Doesn't PandaByte have a GPS sensor?", 'Does PandaByte have a GPS sensor under <5V?'])
    for (const o of parseClarificationOptions(productChoiceAnswer(q, rows).text).options) assert.equal(o.label, o.question, o.question);
  // Every offered question resolves to one product and is not itself a catalog or choice question, for a spread of real questions.
  for (const q of ['Does PandaByte have a LoRa board?', 'Does PandaByte sell a GPS sensor?', 'what is the price of your esp32 c3 board', 'Which PandaByte ESP32 board or shield has the most pins?', 'Does PandaByte have a WS2812B LED strip with a switch?', 'x'.repeat(10) + ' which esp32 ' + 'word '.repeat(40)])
    for (const o of parseClarificationOptions(productChoiceAnswer(q, rows).text).options.slice(0, -1)) {
      const plan = resolveMultiProductIdentity(rows, o.question);
      assert.ok(plan.kind === 'planned' && plan.products.length === 1, o.question);
      assert.equal(catalogListingAnswer(o.question, rows), null, o.question);
    }
  for (const row of rows) {
    // The full title as the question makes this row the only top match.
    const parsed = parseClarificationOptions(productChoiceAnswer('Which is ' + row.title, rows).text);
    assert.ok(parsed && parsed.options.length === 2, row.title);
    const identity = resolveMultiProductIdentity(rows, parsed.options[0].question);
    assert.equal(identity.kind, 'planned', parsed.options[0].question);
    assert.deepEqual(identity.products.map(p => p.sku), [row.sku], parsed.options[0].question);
    assert.equal(catalogListingAnswer(parsed.options[0].question, rows), null, parsed.options[0].question);
    if (row.sku === 'X32SHIELD') assert.deepEqual([parsed.options[0].label, parsed.options[0].question], ['Tell me about x32 xLoRa Grove Expansion Board Shield HAT', 'Tell me about X32SHIELD']);
  }
});
