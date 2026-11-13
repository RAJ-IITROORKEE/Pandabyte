import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendSerial, agentLogMessage, parseFlashAddress, imageChipId, firmwareProblem, MAX_LOG_LINES } from '../src/ui/agent/device.ts';

test('serial log: lines split on CRLF, LF and CR across chunks; control characters removed; bounded', () => {
  let s = appendSerial([], '', 'boot: ESP-ROM\r\nentry 0x40');
  assert.deepEqual(s, { lines: ['boot: ESP-ROM'], partial: 'entry 0x40' });
  s = appendSerial(s.lines, s.partial, '375\nI2C\x1b[0m ok\r');
  assert.deepEqual(s.lines, ['boot: ESP-ROM', 'entry 0x40375']); assert.equal(s.partial, 'I2C\x1b[0m ok\r', 'a CR at the end of a chunk waits for a possible LF');
  s = appendSerial(s.lines, s.partial, '\nnext');
  assert.deepEqual(s.lines, ['boot: ESP-ROM', 'entry 0x40375', 'I2C[0m ok'], 'CRLF split across chunks ends one line; ESC removed'); assert.equal(s.partial, 'next');
  const many = appendSerial([], '', 'x\n'.repeat(MAX_LOG_LINES + 20));
  assert.equal(many.lines.length, MAX_LOG_LINES);
  assert.equal(appendSerial([], '', 'y'.repeat(400)).lines[0].length, 300, 'output with no newline still shows, in bounded pieces');
});

test('agent message: question, chip and the newest lines that fit in one message', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ` + 'z'.repeat(20));
  const m = agentLogMessage(lines, 'ESP32-S3', 115200, '');
  assert.ok(m.length <= 2000); assert.match(m, /^What does this serial output mean/); assert.match(m, /ESP32-S3 at 115200 baud/);
  assert.match(m, /line 199 z+\n```$/); assert.doesNotMatch(m, /line 0 /);
  assert.doesNotMatch(agentLogMessage(['a ``` b'], null, 9600, 'Why?'), /a ``` b/, 'a fence in the log cannot close the block');
});

test('flash address: hex or decimal, sector aligned, under 16 MB', () => {
  assert.equal(parseFlashAddress('0x10000'), 0x10000); assert.equal(parseFlashAddress(' 0 '), 0); assert.equal(parseFlashAddress('4096'), 4096);
  for (const bad of ['0x10001', '0x1000000', '-4096', '0x', 'abc', '1e4', '']) assert.equal(parseFlashAddress(bad), null, bad);
});

test('firmware checks: image chip id, size and fit; ESP8266 images and raw data pass to confirmation', () => {
  const image = (chipId, pad = 0) => { const d = new Uint8Array(pad + 64).fill(0xff, 0, pad); d[pad] = 0xe9; d[pad + 12] = chipId & 0xff; d[pad + 13] = chipId >> 8; return d; };
  assert.equal(imageChipId(image(9)), 9); assert.equal(imageChipId(image(0, 0x1000)), 0, 'merged ESP32 image padded to 0x1000');
  assert.equal(imageChipId(new Uint8Array(64)), null);
  const s3 = { name: 'ESP32-S3', imageChipId: 9, flashBytes: 8 * 1048576 };
  assert.equal(firmwareProblem(image(9), 0x10000, s3), null);
  assert.match(firmwareProblem(image(5), 0, s3), /another chip/);
  assert.match(firmwareProblem(new Uint8Array(0), 0, s3), /empty/);
  assert.match(firmwareProblem(image(9), 8 * 1048576 - 32, s3), /does not fit/);
  assert.equal(firmwareProblem(image(5), 0, { name: 'ESP8266', imageChipId: null, flashBytes: null }), null);
  assert.equal(firmwareProblem(new Uint8Array(4096).fill(1), 0x290000, s3), null, 'a data image has no header; the user confirms it');
});
