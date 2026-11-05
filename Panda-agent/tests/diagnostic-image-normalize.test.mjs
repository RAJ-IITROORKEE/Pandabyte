import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeDiagnosticImage } from '../src/diagnostics/image-normalize.ts';

test('normalizes actual image bytes to metadata-free PNG with bounded dimensions', async () => {
  const source = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#ffffff' } }).jpeg().withMetadata().toBuffer();
  const result = await normalizeDiagnosticImage(source, 'image/jpeg');
  assert.equal(result.mediaType, 'image/png'); assert.equal(result.width, 8); assert.equal(result.height, 6);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  await assert.rejects(normalizeDiagnosticImage(source, 'image/png'));
  await assert.rejects(normalizeDiagnosticImage(Buffer.concat([source, Buffer.from('trailing payload')]), 'image/jpeg'));
  await assert.rejects(normalizeDiagnosticImage(Buffer.concat([source, Buffer.from('trailing payload'), Buffer.from([0xff, 0xd9])]), 'image/jpeg'));
  await assert.rejects(normalizeDiagnosticImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png'));
  const large = await sharp({ create: { width: 2049, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(normalizeDiagnosticImage(large, 'image/png'));
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(normalizeDiagnosticImage(Buffer.concat([png, Buffer.from('trailing payload')]), 'image/png'));
});

test('normalization configures the native processing deadline', async () => {
  const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  const prototype = Object.getPrototypeOf(sharp(source));
  const original = prototype.timeout;
  const seen = [];
  prototype.timeout = function (options) { seen.push(options); return original.call(this, options); };
  try {
    await normalizeDiagnosticImage(source, 'image/png');
    assert.deepEqual(seen, [{ seconds: 5 }]);
  } finally { prototype.timeout = original; }
});
