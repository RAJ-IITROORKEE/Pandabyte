import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChatScope } from '../src/retrieval/chat-scope.ts';

// Titles and SKUs from the captured product archive.
const catalog = [
  ['MAKERUNO', 'Maker UNO: Simplifying Arduino for Education'],
  ['PBADXL345', 'PandaByte Accelerometer ADXL345 Grove Sensor'],
  ['PBBMP580', 'PandaByte Barometric Pressure BMP580 Grove Sensor'],
  ['MPU6050', 'PandaByte Accelerometer Gyroscope MPU6050 Grove Sensor'],
  ['PB-BMV080', 'PandaByte Bosch BMV080 Air Quality PM1/PM2.5/PM10 Sensor'],
  ['PB-MAX485', 'PandaByte MAX485 TTL To RS485 5V 12V'],
  ['PBDHT11', 'PandaByte Temperature Humidity DHT11 Grove Sensor'],
  ['ESPX8266', 'PandaByte NodeMCU x8266 WiFi Development Board'],
  ['ESPX32', 'PandaByte x32 ESP32 Development Board'],
  ['ESPXS3', 'PandaByte xS3 ESP32-S3 Development Board'],
  ['ESPXC3', 'PandaByte xC3 ESP32-C3 Development Board'],
  ['ESPXC3M', 'PandaByte xC3m ESP32-C3 Development Board'],
  ['ESPXC5', 'PandaByte xC5 ESP32-C5 Development Board'],
  ['ESPXC6', 'PandaByte xC6 ESP32-C6 Development Board'],
  ['XLORA', 'PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar'],
  ['RGB10WS', 'PandaByte RGB LED Strip WS2812B XIAO Footprint with Switch'],
  ['RGBWEMOS', 'RGB LED Circular WS2812B WeMoS D1 Mini'],
  ['RGB4X4', 'PandaByte RGB LED Matrix WS2812B XIAO Footprint'],
  ['X32SHIELD', 'x32 xLoRa Grove Expansion Board Shield HAT'],
  ['XC3MHAT', 'xC3m Grove Expansion Board Shield HAT'],
].map(([sku, title]) => ({ sku, title }));
const ask = (q, previous) => resolveChatScope(q, catalog, previous);
const resolved = sku => ({ kind: 'resolved', productSku: sku });

test('exact SKUs and complete product titles resolve without alias collisions', () => {
  assert.deepEqual(ask('What is ESPXC3M?'), resolved('ESPXC3M'));
  assert.deepEqual(ask('Tell me about xC3m Grove Expansion Board Shield HAT'), resolved('XC3MHAT'));
  assert.deepEqual(ask('PANDABYTE RGB LED MATRIX WS2812B XIAO FOOTPRINT'), resolved('RGB4X4'));
});
test('distinct board aliases normalize punctuation and preserve token boundaries', () => {
  for (const [q, sku] of [['ESP8266', 'ESPX8266'], ['x8266', 'ESPX8266'], ['x32', 'ESPX32'], ['xS3', 'ESPXS3'], ['xC3', 'ESPXC3'], ['xC3m', 'ESPXC3M'], ['xC5', 'ESPXC5'], ['xC6', 'ESPXC6'], ['xLoRa', 'XLORA'], ['ESP32-S3', 'ESPXS3']]) assert.deepEqual(ask(`Tell me about ${q}`), resolved(sku));
  assert.equal(ask('xc3max').kind, 'clarification');
});
test('shared names and multiple products do not guess', () => {
  for (const q of ['WS2812B', 'RGB module', 'Grove', 'ESP32-C3', 'ESP32', 'xC3m Grove shield']) assert.equal(ask(q).kind, 'clarification', q);
  assert.equal(ask('Compare xC3 and xC3m').kind, 'conflict');
  assert.equal(ask('ESPX8266 versus XLORA').kind, 'conflict');
});
test('only explicit short references reuse a still-authorized previous SKU', () => {
  assert.deepEqual(ask('What about its pins?', 'ESPXC3'), resolved('ESPXC3'));
  assert.deepEqual(ask('Does it support Wi-Fi?', 'ESPXC3'), resolved('ESPXC3'));
  for (const q of ['What is the weather?', 'How many pins?', 'What about Grove?', 'What about another board?', 'Tell me about it on Raspberry Pi']) assert.equal(ask(q, 'ESPXC3').kind, 'clarification', q);
  assert.equal(ask('What about its pins?', 'NOT-AUTHORIZED').kind, 'clarification');
  assert.deepEqual(ask('Tell me about xC6', 'ESPXC3'), resolved('ESPXC6'));
});

test('welcome questions and distinctive unique catalog model tokens resolve', () => {
  for (const [q, sku] of [
    ['What is the Cytron Maker UNO?', 'MAKERUNO'],
    ['Tell me about the xC5 board', 'ESPXC5'],
    ['What does the WS2812B ring listing say?', 'RGBWEMOS'],
    ['What is DHT11?', 'PBDHT11'], ['ADXL345', 'PBADXL345'], ['MPU6050', 'MPU6050'],
    ['BMP580', 'PBBMP580'], ['BMV080', 'PB-BMV080'], ['MAX485', 'PB-MAX485'],
  ]) assert.deepEqual(ask(q), resolved(sku), q);
  assert.equal(ask('Compare DHT11 and BMP580').kind, 'conflict');
  assert.equal(ask('WS2812B').kind, 'clarification');
  assert.equal(ask('DHT11 Grove sensor').kind, 'clarification');
  const duplicate = [...catalog, { sku: 'OTHER', title: 'Another DHT11 module' }];
  assert.equal(resolveChatScope('DHT11', duplicate).kind, 'clarification');
});
