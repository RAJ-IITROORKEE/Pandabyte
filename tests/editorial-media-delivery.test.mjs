import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { MAX_MEDIA_BYTES } from "../lib/editorial/validation.ts";
import { parseEditorialImageSize, prepareEditorialDownload } from "../lib/editorial/media-delivery.ts";

const WIDTH = 48;
const HEIGHT = 32;

test("delivers immutable registered GLB bytes inline without image resizing and rejects tampering", async () => {
  const bytes = Buffer.alloc(28);
  bytes.write("glTF"); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  const media = { mimeType: "model/gltf-binary", byteSize: bytes.length, width: null, height: null,
    modelSha256: createHash("sha256").update(bytes).digest("hex") };
  const delivered = await prepareEditorialDownload(bytes, media);
  assert.ok(delivered);
  assert.equal(delivered.mimeType, "model/gltf-binary");
  assert.deepEqual(delivered.bytes, bytes);
  assert.equal(await prepareEditorialDownload(bytes, media, 960), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...media, modelSha256: null }), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...media, width: 1 }), null);
  const modified = Buffer.from(bytes); modified[24] = 1;
  assert.equal(await prepareEditorialDownload(modified, media), null);
  const wrongVersion = Buffer.from(bytes); wrongVersion.writeUInt32LE(1, 4);
  assert.equal(await prepareEditorialDownload(wrongVersion, { ...media,
    modelSha256: createHash("sha256").update(wrongVersion).digest("hex") }), null);
});

function pixels(channels = 3, offset = 0, width = WIDTH, height = HEIGHT) {
  const data = Buffer.alloc(width * height * channels);
  for (let index = 0; index < data.length; index += channels) {
    data[index] = (index * 13 + offset) % 256;
    data[index + 1] = (index * 7 + offset) % 256;
    data[index + 2] = (index * 3 + offset) % 256;
    if (channels === 4) data[index + 3] = (index * 11 + offset) % 256;
  }
  return data;
}

async function webp({ alpha = false, lossless = false, metadata = false, width = WIDTH, height = HEIGHT } = {}) {
  const channels = alpha ? 4 : 3;
  let image = sharp(pixels(channels, 0, width, height), { raw: { width, height, channels } });
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

test("accepts only one allowlisted image size and leaves a missing size unset", () => {
  assert.equal(parseEditorialImageSize(new URLSearchParams()), undefined);
  assert.equal(parseEditorialImageSize(new URLSearchParams("w=96")), 96);
  assert.equal(parseEditorialImageSize(new URLSearchParams("w=960")), 960);
  for (const value of ["", "95", "97", "961", "1200", "96.0"]) {
    assert.equal(parseEditorialImageSize(new URLSearchParams(`w=${value}`)), null);
  }
  assert.equal(parseEditorialImageSize(new URLSearchParams("w=96&w=960")), null);
});

test("returns bounded clean WebP derivatives, preserving alpha and never enlarging", async () => {
  const large = await webp({ alpha: true, width: 1200, height: 900 });
  const largeMetadata = await record(large);
  for (const [size, width, height] of [[96, 96, 72], [960, 960, 720]]) {
    const prepared = await prepareEditorialDownload(large, largeMetadata, size);
    assert.ok(prepared);
    assert.equal(prepared.mimeType, "image/webp");
    assert.equal(prepared.extension, "webp");
    assert.equal(prepared.width, width);
    assert.equal(prepared.height, height);
    const metadata = await sharp(prepared.bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.hasAlpha, true);
    for (const field of ["exif", "icc", "iptc", "xmp", "tifftagPhotoshop", "comments"]) {
      assert.equal(metadata[field], undefined, `derived WebP contains ${field}`);
    }
  }

  const small = await webp({ alpha: true });
  const smallMetadata = await record(small);
  for (const size of [96, 960]) {
    const prepared = await prepareEditorialDownload(small, smallMetadata, size);
    assert.ok(prepared);
    assert.equal(prepared.width, WIDTH);
    assert.equal(prepared.height, HEIGHT);
    assert.deepEqual(prepared.bytes, small);
  }
});

test("rejects unsupported runtime sizes and derivative requests for PDFs", async () => {
  const image = await webp();
  const imageMetadata = await record(image);
  for (const size of [0, 97, 961, NaN, "96", null]) {
    assert.equal(await prepareEditorialDownload(image, imageMetadata, size), null);
  }

  const pdf = Buffer.from("%PDF-1.7\nsynthetic local test fixture\n");
  assert.equal(await prepareEditorialDownload(pdf, {
    mimeType: "application/pdf", byteSize: pdf.byteLength, width: null, height: null,
  }, 96), null);
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
