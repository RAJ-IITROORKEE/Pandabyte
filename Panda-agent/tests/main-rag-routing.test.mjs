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
