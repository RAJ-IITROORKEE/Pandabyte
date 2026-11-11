import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { admitResearchImage, ResearchImageError } from '../src/server/research-image.ts';

const maxBytes = 49152;
const rejects = (promise, code) => assert.rejects(promise, error => error instanceof ResearchImageError && error.code === code);
const noisePng = (width, height, channels = 3) => sharp(randomBytes(width * height * channels), { raw: { width, height, channels } }).png().toBuffer();
// Smooth gradient with mild noise: PNG-hostile, JPEG-friendly (photo-like).
function photoRaw(width, height, channels = 3) {
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) data[(y * width + x) * channels + c] = (x * 255 / width + y * 127 / height + c * 40 + Math.random() * 12) & 255;
  return data;
}
const photoJpeg = (width, height) => sharp(photoRaw(width, height), { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
const decode = async admitted => sharp(admitted.bytes).raw().toBuffer({ resolveWithObject: true });

test('PNG input that is small stays PNG with a verified hash and data URI', async () => {
  const input = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#336699' } }).png().toBuffer();
  const out = await admitResearchImage(input);
  assert.equal(out.mediaType, 'image/png'); assert.equal(out.name, 'image.png');
  assert.ok(out.bytes.length <= maxBytes); assert.ok(Buffer.isBuffer(out.bytes));
  assert.equal(out.sha256, createHash('sha256').update(out.bytes).digest('hex'));
  assert.equal(out.dataUri, 'data:image/png;base64,' + out.bytes.toString('base64'));
  assert.ok(out.dataUri.length - 'data:image/png;base64,'.length <= 65536);
  assert.equal((await sharp(out.bytes).metadata()).format, 'png');
});
test('declared type is irrelevant: only the magic bytes decide', async () => {
  const out = await admitResearchImage(await photoJpeg(300, 200));
  assert.equal(out.mediaType, 'image/jpeg'); assert.equal(out.name, 'image.jpg');
  assert.equal((await sharp(out.bytes).metadata()).format, 'jpeg');
});
test('unknown, empty, text, GIF and truncated inputs are image_unsupported', async () => {
  const bad = [new Uint8Array(0), Buffer.from('hello world, definitely not an image'), Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), Buffer.from('89504e470d0a1a0a0000', 'hex'), Buffer.from('ffd8ffe000104a46494600', 'hex'), Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'latin1')];
  for (const input of bad) await rejects(admitResearchImage(input), 'image_unsupported');
});
test('input above 8 MiB is image_too_large before any decode', async () => {
  await rejects(admitResearchImage(Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(8 * 1024 * 1024)])), 'image_too_large');
});
test('pixel bombs above 24,000,000 pixels are image_too_large', async () => {
  const bomb = await sharp({ create: { width: 6000, height: 4001, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
  assert.ok(bomb.length < 8 * 1024 * 1024);
  await rejects(admitResearchImage(bomb), 'image_too_large');
});
test('large photo-like JPEG is re-encoded as JPEG within the byte and size clamps', async () => {
  const input = await photoJpeg(3000, 2000);
  assert.ok(input.length > maxBytes);
  const out = await admitResearchImage(input);
  assert.equal(out.mediaType, 'image/jpeg'); assert.ok(out.bytes.length <= maxBytes);
  const { info } = await decode(out);
  assert.ok(Math.max(info.width, info.height) <= 1568); assert.ok(info.width * info.height <= 1_500_000);
  assert.ok(info.width / info.height > 1.4 && info.width / info.height < 1.6);
  assert.equal(out.sha256, createHash('sha256').update(out.bytes).digest('hex'));
});
test('a large PNG photo is clamped to 1568 px and falls to JPEG when PNG cannot fit', async () => {
  const input = await sharp(photoRaw(1800, 1200), { raw: { width: 1800, height: 1200, channels: 3 } }).png().toBuffer();
  const out = await admitResearchImage(input);
  assert.ok(out.bytes.length <= maxBytes); assert.equal(out.mediaType, 'image/jpeg');
  const { info } = await decode(out); assert.ok(Math.max(info.width, info.height) <= 1568);
});
test('transparent PNG that needs JPEG is flattened onto white', async () => {
  const width = 1200, height = 800, data = photoRaw(width, height, 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; if (x < width / 2) { data[o] = 255; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0; } else data[o + 3] = 255; }
  const out = await admitResearchImage(await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer());
  assert.equal(out.mediaType, 'image/jpeg');
  const { data: pixels, info } = await decode(out);
  const at = (x, y) => [...pixels.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  for (const channel of at(10, Math.floor(info.height / 2))) assert.ok(channel >= 245, 'transparent region is white, got ' + at(10, Math.floor(info.height / 2)));
  assert.equal((await sharp(out.bytes).metadata()).hasAlpha, false);
});
test('a small transparent PNG keeps its alpha as PNG', async () => {
  const out = await admitResearchImage(await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer());
  assert.equal(out.mediaType, 'image/png'); assert.equal((await sharp(out.bytes).metadata()).hasAlpha, true);
});
test('WebP input is always re-encoded to PNG (alpha, small) or JPEG', async () => {
  const opaque = await sharp(photoRaw(800, 600), { raw: { width: 800, height: 600, channels: 3 } }).webp({ quality: 80 }).toBuffer();
  const out = await admitResearchImage(opaque);
  assert.equal(out.mediaType, 'image/jpeg'); assert.ok(out.bytes.length <= maxBytes);
  const alpha = await sharp({ create: { width: 80, height: 80, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.4 } } }).webp({ lossless: true }).toBuffer();
  const out2 = await admitResearchImage(alpha);
  assert.equal(out2.mediaType, 'image/png'); assert.equal((await sharp(out2.bytes).metadata()).format, 'png');
});
test('EXIF orientation is applied and metadata is stripped', async () => {
  const input = await sharp(photoRaw(200, 100), { raw: { width: 200, height: 100, channels: 3 } }).jpeg().withExif({ IFD0: { Copyright: 'SECRET-OWNER' } }).withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await sharp(input).metadata()).orientation, 6);
  const out = await admitResearchImage(input), meta = await sharp(out.bytes).metadata();
  assert.equal(meta.width, 100); assert.equal(meta.height, 200);
  assert.equal(meta.orientation, undefined); assert.equal(meta.exif, undefined);
  assert.ok(!out.bytes.includes(Buffer.from('SECRET-OWNER')));
});
test('an image that cannot fit the byte bound at any scale is image_too_large', async () => {
  const input = await noisePng(300, 300);
  await rejects(admitResearchImage(input, { maxOutput: 200 }), 'image_too_large');
  assert.ok((await admitResearchImage(input)).bytes.length <= maxBytes);
  assert.ok((await admitResearchImage(input, { maxOutput: 10_000_000 })).bytes.length <= maxBytes); // the option can only lower the bound
});
test('animated inputs (APNG, animated WebP) and GIF are image_unsupported', async () => {
  const still = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#0f0' } }).png().toBuffer();
  const chunk = (type, body) => { const head = Buffer.alloc(8); head.writeUInt32BE(body.length); head.write(type, 4, 'latin1'); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), body]))); return Buffer.concat([head, body, tail]); };
  const idat = still.indexOf('IDAT') - 4, actl = Buffer.alloc(8); actl.writeUInt32BE(2, 0);
  await rejects(admitResearchImage(Buffer.concat([still.subarray(0, idat), chunk('acTL', actl), still.subarray(idat)])), 'image_unsupported');
  const frames = await Promise.all(['#f00', '#00f'].map(c => sharp({ create: { width: 32, height: 32, channels: 3, background: c } }).png().toBuffer()));
  await rejects(admitResearchImage(await sharp(frames, { join: { animated: true } }).webp({ delay: [100, 100], loop: 0 }).toBuffer()), 'image_unsupported');
});
test('concurrent admission is single-flight: the second call is image_busy and the lock is released afterwards', async () => {
  const input = await photoJpeg(2400, 1600);
  const first = admitResearchImage(input), second = admitResearchImage(input);
  await rejects(second, 'image_busy');
  assert.ok((await first).bytes.length <= maxBytes);
  assert.ok((await admitResearchImage(input)).bytes.length <= maxBytes);
});
test('the lock is released after a failed admission', async () => {
  await rejects(admitResearchImage(await noisePng(300, 300), { maxOutput: 200 }), 'image_too_large');
  const ok = await admitResearchImage(await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).png().toBuffer());
  assert.equal(ok.mediaType, 'image/png');
});
