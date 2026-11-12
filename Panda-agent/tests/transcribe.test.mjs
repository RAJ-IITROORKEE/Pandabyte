import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFormat, validateAudio, throttle, transcribe } from '../src/server/transcribe.ts';

const bytes = new Uint8Array([1, 2, 3]).buffer;
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

test('maps types and validates uploads', () => {
  assert.equal(audioFormat('audio/webm;codecs=opus'), 'webm');
  assert.equal(audioFormat('audio/mp4'), 'm4a');
  assert.deepEqual(validateAudio({ size: 10, type: 'audio/webm;codecs=opus' }), { format: 'webm' });
  assert.deepEqual(validateAudio({ size: 1_500_001, type: 'audio/webm' }), { status: 413 });
  assert.deepEqual(validateAudio({ size: 10, type: 'video/mp4' }), { status: 415 });
  assert.deepEqual(validateAudio(null), { status: 400 });
});

test('transcribes, trims and sends zero-retention provider settings', async () => {
  let sent;
  const result = await transcribe(bytes, 'webm', 'k', async (_url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ text: '  hello  ' })); });
  assert.deepEqual(result, { text: 'hello' });
  assert.equal(sent.input_audio.format, 'webm');
  assert.equal(sent.provider.zdr, true);
});

test('provider failure, bad shape and empty text', async () => {
  assert.equal(await transcribe(bytes, 'webm', 'k', reply(500, { error: 'x' })), null);
  assert.equal(await transcribe(bytes, 'webm', 'k', reply(200, {})), null);
  assert.deepEqual(await transcribe(bytes, 'webm', 'k', reply(200, { text: '' })), { text: '' });
});

test('throttles after 20 requests per window', () => {
  for (let i = 0; i < 20; i++) assert.equal(throttle('u', 1000 + i), true);
  assert.equal(throttle('u', 2000), false);
  assert.equal(throttle('u', 1000 + 600_001), true);
});
