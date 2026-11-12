import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMainProductQuestion } from '../src/server/main-rag-chat.ts';

const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog-42.json', import.meta.url), 'utf8'));

test('plain chip names in general questions go to the chat model, not product lookup', () => {
  for (const q of ['Draw a flowchart of how an ESP32 connects to Wi-Fi and publishes over MQTT.', 'Show a wiring diagram to connect a DHT22 to an ESP32.',
    'Explain how WS2812B LEDs are driven.', 'How do I reduce ESP32 deep sleep current?', 'Compare ESP32-S3 and ESP32-C3 for a battery sensor.', 'Tell me about the Panda world'])
    assert.equal(isMainProductQuestion(q, catalog), false, q);
});

test('PandaByte codes, titles and listing questions still go to product lookup', () => {
  for (const q of ['Tell me about the PandaByte x8266 board.', 'Which MCU does the x8266 use?', 'What is the pinout of the xC3?',
    'Tell me about the Cytron Maker UNO.', 'What does the WS2812B ring listing say?', 'What is the price of the ESP32 board?'])
    assert.equal(isMainProductQuestion(q, catalog), true, q);
});

test("a bare it is a product follow-up only for hardware attributes", async () => {
  const { isImplicitProductFollowup } = await import("../src/server/main-rag-chat.ts");
  for (const q of ["What USB connector does it have?", "How much flash does it have?", "What is the price of this board?"]) assert.equal(isImplicitProductFollowup(q, catalog), true, q);
  for (const q of ["What is the latest stable ESP-IDF release and when was it published?", "How does it work, in simple words?"]) assert.equal(isImplicitProductFollowup(q, catalog), false, q);
});

test("chip names with generic engineering words stay general; product nouns still ask for a board", () => {
  for (const q of ["I want to read a 3.3V sensor with an ESP32 ADC through a voltage divider from a 5V sensor. Give me the formula, a table, a parts checklist and Arduino code.",
    "Explain how an ESP32 reads a 5V sensor through a voltage divider.", "What voltage do ESP32 GPIO pins tolerate?", "How much flash and memory does an ESP32 usually have?"])
    assert.equal(isMainProductQuestion(q, catalog), false, q);
  for (const q of ["ESP32 board voltage?", "What memory does the ESP32 board have?", "What can you tell me about an ESP32 board?"])
    assert.equal(isMainProductQuestion(q, catalog), true, q);
});

test('general how-to questions about the user\'s own hardware stay on the direct model', async () => {
  const { readFileSync } = await import('node:fs');
  const { isMainProductQuestion } = await import('../src/server/main-rag-chat.ts');
  const rows = JSON.parse(readFileSync(new URL('./fixtures/catalog-42.json', import.meta.url), 'utf8'));
  for (const q of ['How do I connect a 5V ultrasonic sensor to my board?', 'How do I read a DHT22 with my ESP32 board?', 'It is an ESP32 dev kit. Give me the sketch.', 'I am using an ESP32 board, how do I blink an LED?', 'How do I use an OLED display with Arduino?'])
    assert.equal(isMainProductQuestion(q, rows), false, q);
  for (const q of ['What are the specs of an ESP32 board?', 'Tell me about the PandaByte MAX485 TTL To RS485 5V 12V', 'What is the flash size of the xC3?'])
    assert.equal(isMainProductQuestion(q, rows), true, q);
});

test('an unresolved product question falls back to the direct model instead of the exact-product notice', () => {
  const source = readFileSync(new URL('../src/server/main-rag-chat.ts', import.meta.url), 'utf8');
  assert.match(source, /if\(!scope\)return 'direct';/);
  assert.match(source, /preparedSnapshot\.kind==='clarification'\)\{\s*preparedSnapshot=undefined;\s*presetAnswer=productChoiceAnswer\(question,catalog\);\s*return presetAnswer\?'rag':'direct';/);
});

test('a model code shared with an accessory resolves to the board unless a shield or kit is asked for', async () => {
  const { resolveMultiProductIdentity } = await import('../src/retrieval/multi-product-identity.ts');
  const one = q => { const r = resolveMultiProductIdentity(catalog, q); return r.kind === 'planned' && r.products.length === 1 ? r.products[0].sku : r.kind; };
  assert.equal(one('Give me the complete specifications of the PandaByte xC3M board as a table.'), 'ESPXC3M');
  assert.equal(one('What is the flash size of the xC3M?'), 'ESPXC3M');
  assert.equal(one('What does the xC3M shield add?'), 'XC3MHAT');
  assert.equal(one('pinout of the xLoRa'), 'XLORA');
  assert.equal(one('Which ESP32 has more flash?'), 'clarification');
  assert.equal(one('How do I wire a WS2812B?'), 'clarification');
});
