import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewCache } from "../lib/editorial/preview-cache.ts";

const media = { objectKey: "assets/a.webp", mimeType: "image/webp", byteSize: 100, width: 200, height: 200 };
const preview = bytes => ({ bytes: Buffer.alloc(bytes), mimeType: "image/webp", extension: "webp", width: 96, height: 96 });

test("cache only holds public resized previews with matching identity and metadata", () => {
  const cache = createPreviewCache();
  cache.set(true, media, 96, preview(5));
  assert.equal(cache.get(true, media, 96).bytes.length, 5);
  assert.equal(cache.get(false, media, 96), undefined);
  assert.equal(cache.get(true, media, undefined), undefined);
  assert.equal(cache.get(true, { ...media, byteSize: 101 }, 96), undefined);
  cache.set(false, { ...media, objectKey: "private" }, 96, preview(5));
  assert.equal(cache.get(true, { ...media, objectKey: "private" }, 96), undefined);
  cache.set(true, media, 960, preview(5));
  assert.equal(cache.get(true, media, 960), undefined);
});

test("eviction respects entry and byte limits and refreshes hits", () => {
  const cache = createPreviewCache(2, 10);
  const b = { ...media, objectKey: "b" }, c = { ...media, objectKey: "c" };
  cache.set(true, media, 96, preview(4));
  cache.set(true, b, 96, preview(4));
  cache.get(true, media, 96);
  cache.set(true, c, 96, preview(4));
  assert.equal(cache.get(true, b, 96), undefined);
  assert.ok(cache.get(true, media, 96));
  cache.set(true, b, 96, preview(11));
  assert.equal(cache.get(true, b, 96), undefined);
});

test("byte pressure and replacement accounting evict the oldest entries", () => {
  const cache = createPreviewCache(10, 10);
  const b = { ...media, objectKey: "b" }, c = { ...media, objectKey: "c" };
  cache.set(true, media, 96, preview(4));
  cache.set(true, b, 96, preview(4));
  cache.set(true, media, 96, preview(6));
  assert.ok(cache.get(true, b, 96));
  assert.equal(cache.get(true, media, 96).bytes.length, 6);
  cache.set(true, c, 96, preview(5));
  assert.equal(cache.get(true, b, 96), undefined);
  assert.equal(cache.get(true, media, 96), undefined);
  assert.equal(cache.get(true, c, 96).bytes.length, 5);
});
