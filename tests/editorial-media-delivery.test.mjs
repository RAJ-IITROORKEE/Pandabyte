import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MAX_MEDIA_BYTES } from "../lib/editorial/validation.ts";
import { prepareEditorialDownload } from "../lib/editorial/media-delivery.ts";

const WIDTH = 48;
const HEIGHT = 32;

function pixels(channels = 3, offset = 0) {
  const data = Buffer.alloc(WIDTH * HEIGHT * channels);
  for (let index = 0; index < data.length; index += channels) {
    data[index] = (index * 13 + offset) % 256;
    data[index + 1] = (index * 7 + offset) % 256;
    data[index + 2] = (index * 3 + offset) % 256;
    if (channels === 4) data[index + 3] = (index * 11 + offset) % 256;
  }
  return data;
}

async function webp({ alpha = false, lossless = false, metadata = false } = {}) {
  const channels = alpha ? 4 : 3;
  let image = sharp(pixels(channels), { raw: { width: WIDTH, height: HEIGHT, channels } });
  if (metadata) image = image.withExif({ IFD0: { Artist: "synthetic test metadata" } });
  return image.webp({ quality: 90, lossless }).toBuffer();
}

async function record(bytes, overrides = {}) {
  const metadata = await sharp(bytes).metadata();
  return {
    mimeType: "image/webp",
    byteSize: bytes.byteLength,
    width: metadata.width,
    height: metadata.height,
    ...overrides,
  };
}

async function assertDeliveredUnchanged(bytes) {
  const prepared = await prepareEditorialDownload(bytes, await record(bytes));
  assert.ok(prepared);
  assert.equal(prepared.mimeType, "image/webp");
  assert.equal(prepared.extension, "webp");
  assert.equal(prepared.width, WIDTH);
  assert.equal(prepared.height, HEIGHT);
  assert.deepEqual(prepared.bytes, bytes);
  assert.deepEqual(Object.keys(prepared).sort(), ["bytes", "extension", "height", "mimeType", "width"].sort());

  const deliveredMetadata = await sharp(prepared.bytes).metadata();
  for (const field of ["exif", "icc", "iptc", "xmp", "tifftagPhotoshop", "comments"]) {
    assert.equal(deliveredMetadata[field], undefined, `delivered WebP contains ${field}`);
  }
}

test("returns normalized lossy, alpha and lossless WebP bytes unchanged without metadata", async () => {
  await assertDeliveredUnchanged(await webp());
  await assertDeliveredUnchanged(await webp({ alpha: true }));
  await assertDeliveredUnchanged(await webp({ lossless: true }));
});

test("rejects malformed, mismatched, oversized, polyglot and truncated WebP inputs", async () => {
  const bytes = await webp();
  const valid = await record(bytes);
  const malformed = Buffer.from("not an image");
  assert.equal(await prepareEditorialDownload(malformed, { ...valid, byteSize: malformed.byteLength }), null);
  const png = await sharp(pixels(), { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();
  assert.equal(await prepareEditorialDownload(png, { ...valid, byteSize: png.byteLength }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, mimeType: "application/pdf" }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, byteSize: valid.byteSize - 1 }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, width: valid.width + 1 }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, height: valid.height - 1 }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, width: null }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, width: 8193 }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...valid, width: 5000, height: 5000 }), null);

  const polyglot = Buffer.concat([bytes, Buffer.from("<script>synthetic fixture</script>")]);
  assert.equal(await prepareEditorialDownload(polyglot, { ...valid, byteSize: polyglot.byteLength }), null);

  const duplicateChunks = Buffer.concat([bytes, bytes.subarray(12)]);
  duplicateChunks.writeUInt32LE(duplicateChunks.length - 8, 4);
  assert.equal(await prepareEditorialDownload(duplicateChunks, { ...valid, byteSize: duplicateChunks.byteLength }), null);

  const truncated = Buffer.from(bytes.subarray(0, bytes.length - 16));
  truncated.writeUInt32LE(truncated.length - 8, 4);
  assert.equal(await prepareEditorialDownload(truncated, { ...valid, byteSize: truncated.byteLength }), null);

  let lastChunkOffset = 12;
  for (let offset = 12; offset < bytes.length;) {
    lastChunkOffset = offset;
    const length = bytes.readUInt32LE(offset + 4);
    offset += 8 + length + (length % 2);
  }
  const lastChunkLength = bytes.readUInt32LE(lastChunkOffset + 4);
  assert.ok(lastChunkLength > 16);
  const truncatedPixels = Buffer.from(bytes.subarray(0, bytes.length - 16));
  truncatedPixels.writeUInt32LE(truncatedPixels.length - 8, 4);
  truncatedPixels.writeUInt32LE(lastChunkLength - 16, lastChunkOffset + 4);
  const readableHeader = await sharp(truncatedPixels, { failOn: "error" }).metadata();
  assert.equal(readableHeader.format, "webp");
  assert.equal(readableHeader.width, valid.width);
  assert.equal(await prepareEditorialDownload(truncatedPixels, { ...valid, byteSize: truncatedPixels.byteLength }), null);

  const highBitChunk = Buffer.from(bytes);
  assert.equal(highBitChunk.toString("latin1", 12, 13), "V");
  highBitChunk[12] |= 0x80;
  assert.equal(await prepareEditorialDownload(highBitChunk, { ...valid }), null);

  assert.equal(await prepareEditorialDownload(Buffer.alloc(MAX_MEDIA_BYTES + 1), {
    mimeType: "image/webp", byteSize: MAX_MEDIA_BYTES + 1, width: WIDTH, height: HEIGHT,
  }), null);
});

test("rejects actual animated WebP and metadata-bearing WebP", async () => {
  const animated = await sharp(Buffer.concat([pixels(), pixels(3, 80)]), {
    raw: { width: WIDTH, height: HEIGHT * 2, channels: 3, pageHeight: HEIGHT },
  }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  assert.equal(await prepareEditorialDownload(animated, await record(animated)), null);

  const withMetadata = await webp({ metadata: true });
  assert.ok((await sharp(withMetadata).metadata()).exif);
  assert.equal(await prepareEditorialDownload(withMetadata, await record(withMetadata)), null);
});

test("returns a bounded PDF unchanged only with exact size and no image dimensions", async () => {
  const pdf = Buffer.from("%PDF-1.7\nsynthetic local test fixture\n");
  const metadata = { mimeType: "application/pdf", byteSize: pdf.byteLength, width: null, height: null };
  const prepared = await prepareEditorialDownload(pdf, metadata);
  assert.ok(prepared);
  assert.equal(prepared.mimeType, "application/pdf");
  assert.equal(prepared.extension, "pdf");
  assert.equal(prepared.width, null);
  assert.equal(prepared.height, null);
  assert.deepEqual(prepared.bytes, pdf);
  assert.equal(await prepareEditorialDownload(pdf, { ...metadata, byteSize: pdf.byteLength + 1 }), null);
  assert.equal(await prepareEditorialDownload(pdf, { ...metadata, width: 1 }), null);
  assert.equal(await prepareEditorialDownload(Buffer.from("not a PDF"), metadata), null);
  const oversizedPdf = Buffer.alloc(2 * 1024 * 1024 + 1);
  Buffer.from("%PDF-").copy(oversizedPdf);
  assert.equal(await prepareEditorialDownload(oversizedPdf, {
    ...metadata, byteSize: oversizedPdf.byteLength,
  }), null);
});
