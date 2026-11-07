import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeIdentity } from '../src/retrieval/insforge-adapters.ts';
const rows = [
  ['PBDHT11','PandaByte Temperature Humidity DHT11 Grove Sensor'],
  ['PBADXL345','PandaByte Accelerometer ADXL345 Grove Sensor'],
  ['PBBMP580','PandaByte Barometric Pressure BMP580 Grove Sensor'],
  ['MPU6050','PandaByte Accelerometer Gyroscope MPU6050 Grove Sensor'],
  ['PB-MAX485','PandaByte MAX485 TTL To RS485 Module'],
  ['SCALEHX711','Mini Scale HX711'],
  ['ESPXC3','PandaByte xC3 ESP32-C3 Development Board'],
  ['ESPXC3M','PandaByte xC3m ESP32-C3 Development Board'],
  ['ESPX32','PandaByte x32 ESP32 Development Board'],
  ['XLORA','PandaByte xLoRa ESP32 Development Board'],
  ['RING','RGB WS2812B Ring'],['STRIP','RGB WS2812B Strip'],
].map(([sku,title])=>({id:sku,sku,title}));
const ask = (question, productSku) => resolveRuntimeIdentity(rows, { question, ...(productSku ? {productSku} : {}) });
for (const [term,sku] of [['DHT11','PBDHT11'],['ADXL345','PBADXL345'],['BMP580','PBBMP580'],['MPU6050','MPU6050'],['MAX485','PB-MAX485'],['HX711','SCALEHX711'],['xC3','ESPXC3'],['xC3m','ESPXC3M']]) {
 test(`unique ${term} resolves to its own product`,()=>assert.deepEqual(ask(`What is ${term}?`),{kind:'resolved',product:{id:sku,sku}}));
}
test('shared names, token substrings, and unknown products do not guess',()=>{
 for (const text of ['ESP32','ESP32-C3','WS2812B','DHT112','prefixDHT11','DHT11-other']) assert.equal(ask(text).kind,'clarification',text);
});
test('different named products and explicit SKU conflicts stop',()=>{
 assert.equal(ask('Compare xC3 and xC3m').kind,'conflict');
 assert.equal(ask('What does DHT11 say?', 'PBBMP580').kind,'conflict');
 assert.equal(ask('DHT11','NOT_FOUND').kind,'clarification');
});
test('a duplicate technical model token no longer resolves as unique',()=>{
 const duplicate=[...rows,{id:'other',sku:'OTHER',title:'Another DHT11 Sensor'}];
 assert.equal(resolveRuntimeIdentity(duplicate,{question:'DHT11'}).kind,'clarification');
});
