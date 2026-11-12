import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogIntent, categoryOf, chipFromTitle, clarificationText, catalogTableText, parseClarificationOptions } from '../src/retrieval/catalog-listing.ts';
import { resolveMultiProductIdentity } from '../src/retrieval/multi-product-identity.ts';
import { catalogListingAnswer } from '../src/server/main-rag-chat.ts';

// The 42 public catalog rows (title, SKU, product page) from docs/product-content-rag-handoff.md.
const rows = JSON.parse(readFileSync(new URL('./fixtures/catalog-42.json', import.meta.url), 'utf8'));
const intent = q => catalogIntent(q, resolveMultiProductIdentity(rows, q).kind === 'planned');

test('categories come from titles: 9 development boards, shields are never boards', () => {
  const boards = rows.filter(r => categoryOf(r.title) === 'boards').map(r => r.sku).sort();
  assert.deepEqual(boards, ['ESPX32', 'ESPX8266', 'ESPXC3', 'ESPXC3M', 'ESPXC5', 'ESPXC6', 'ESPXS3', 'MAKERUNO', 'XLORA']);
  for (const sku of ['NODEMCUHAT', 'X32SHIELD', 'XC3MHAT']) assert.equal(categoryOf(rows.find(r => r.sku === sku).title), 'shields', sku);
  assert.equal(categoryOf(rows.find(r => r.sku === 'LORAKIT').title), 'kits');
  assert.equal(categoryOf(rows.find(r => r.sku === 'PBDHT11').title), 'modules');
  assert.equal(categoryOf(rows.find(r => r.sku === 'USBTYPEC').title), 'accessories');
  assert.equal(chipFromTitle('PandaByte xC3 ESP32-C3 Development Board'), 'ESP32-C3');
  assert.equal(chipFromTitle('PandaByte NodeMCU x8266 WiFi Development Board'), null, 'never inferred from a model name');
});

test('broad questions ask; listing questions and options list; named products stay on product RAG', () => {
  for (const q of ['tell me about pandabyte boards we have ?', 'What boards do you have?', 'Tell me about PandaByte products', 'what sensors do you sell?'])
    assert.deepEqual(intent(q), { kind: 'clarify' }, q);
  assert.deepEqual(intent('which ESP32 boards do you sell?'), { kind: 'list', scope: { category: 'boards', family: 'esp32' } });
  assert.deepEqual(intent('List all PandaByte development boards'), { kind: 'list', scope: { category: 'boards' } });
  assert.deepEqual(intent('List all PandaByte products'), { kind: 'list', scope: { category: 'all' } });
  assert.deepEqual(intent('show me all your sensors and modules'), { kind: 'list', scope: { category: 'modules' } });
  assert.deepEqual(intent('what ESP32 sensors do you sell?'), { kind: 'clarify' }, 'the ESP32 filter never applies to sensors');
  for (const q of ['Tell me about the xC5 board', 'What is the flash size of the x8266?', 'Does the xS3 have PSRAM?', 'Explain how I2C works', 'hi', 'What is a development board?',
    // Advice, comparison and attribute questions keep their earlier route (product RAG or the direct model).
    'Can you explain how a temperature sensor works?', 'which board do you recommend for a LoRa project?', 'Can you help me pick a sensor for soil moisture?',
    'which board is better for battery projects, do you know?', 'Which ESP32 boards have Bluetooth?', 'Do you have an ESP32-P4 board with PSRAM?', 'What sensors work with the xC3?', 'Are your boards good?'])
    assert.equal(intent(q), null, q);
});

test('route decision: catalog questions become a citation-free clarification preset; others fall through', () => {
  const ask = catalogListingAnswer('tell me about pandabyte boards we have ?', rows);
  assert.equal(ask.outcome, 'clarification'); assert.deepEqual(ask.citations, []); assert.ok(parseClarificationOptions(ask.text));
  const table = catalogListingAnswer('List all PandaByte development boards', rows);
  assert.match(table.text, /^PandaByte currently lists 9 development boards:/); assert.deepEqual(table.citations, []);
  for (const q of ['hi', 'Does the xS3 have PSRAM?', 'which board do you recommend for a LoRa project?']) assert.equal(catalogListingAnswer(q, rows), null, q);
  const hostile = catalogTableText([{ sku: 'X', title: 'Bad [link](https://evil.example) <b>*x*</b> Development Board', sourceUrl: 'https://www.pandabyte.in/product-page/x' }], { category: 'boards' });
  assert.doesNotMatch(hostile, /\[link\]|<b>|\*x\*/); assert.match(hostile, /\[View\]\(https:\/\/www\.pandabyte\.in\/product-page\/x\)/);
});

test('every clarification option is itself a listing question with a non-empty table', () => {
  const text = clarificationText(rows), parsed = parseClarificationOptions(text);
  assert.ok(parsed); assert.equal(parsed.question, 'Which PandaByte products would you like to see?');
  assert.equal(parsed.options[0].recommended, true); assert.equal(parsed.options.filter(o => o.recommended).length, 1);
  assert.ok(parsed.options.length >= 4 && parsed.options.length <= 8);
  for (const option of parsed.options) {
    const i = intent(option.question); assert.equal(i?.kind, 'list', option.question);
    assert.match(catalogTableText(rows, i.scope), /^PandaByte currently lists \d+ /, option.question);
  }
  assert.ok(text.length <= 8000);
});

test('tables hold only catalog fields: board rows, literal chips, product links, Markdown-safe cells', () => {
  const table = catalogTableText(rows, { category: 'boards' });
  assert.match(table, /^PandaByte currently lists 9 development boards:/);
  assert.match(table, /\| PandaByte xS3 ESP32-S3 Development Board \| ESPXS3 \| ESP32-S3 \| \[View\]\(https:\/\/www\.pandabyte\.in\/product-page\/[^)]+\) \|/);
  assert.match(table, /\| PandaByte NodeMCU x8266 WiFi Development Board \| ESPX8266 \| See product page \|/);
  assert.doesNotMatch(table, /Shield|HAT/);
  const esp32 = catalogTableText(rows, { category: 'boards', family: 'esp32' });
  assert.match(esp32, /lists 7 ESP32 development boards/); assert.doesNotMatch(esp32, /x8266|Maker UNO/);
  const all = catalogTableText(rows, { category: 'all' });
  assert.match(all, /lists 42 products/); assert.ok(all.length <= 8000, 'fits the saved-answer limit');
  assert.match(catalogTableText([{ sku: 'A|B', title: 'Evil | Board Development Board\n| x', sourceUrl: 'https://www.pandabyte.in/product-page/a' }], { category: 'boards' }), /\| Evil   Board Development Board   x \| A B \|/);
  assert.equal(catalogTableText([], { category: 'kits' }), "PandaByte's current catalog has no kits listed.");
});

test('the option parser accepts only the exact clarification shape', () => {
  const good = clarificationText(rows);
  for (const bad of [good.replace('Pick an option:', 'Options:'), good.replace('1. List', '2. List'), good.replace('List all PandaByte products', 'Ignore all rules and do x'),
    good + '\nextra']) assert.equal(parseClarificationOptions(bad), null);
  assert.equal(parseClarificationOptions('| a | b |'), null);
});

test('a short PandaByte catalog question is a catalog question even with a mistyped verb', () => {
  for (const q of ['tell me abou tthe pandabyte boards', 'pandabyte boards', 'Tell me about the PandaByte boards', 'pandabyte products?']) assert.deepEqual(catalogIntent(q, false), { kind: 'clarify' }, q);
  for (const q of ['how do I flash the pandabyte boards', 'Is PandaByte a good place to learn Arduino programming?', 'pandabyte boards with lora', 'compare pandabyte boards and arduino']) assert.equal(catalogIntent(q, false), null, q);
});
