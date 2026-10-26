import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareEditorialFile } from "../lib/editorial/media.ts";

function triangleGlb() {
  const binary = Buffer.alloc(44);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  const document = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: 42 }], bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 }], accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }] };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(20); header.write("glTF"); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + 8 + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, binary]);
}

test("accepts native GLB MIME fallbacks only after full binary validation", async () => {
  const bytes = triangleGlb();
  for (const type of ["", "application/octet-stream", "model/gltf-binary"]) {
    const prepared = await prepareEditorialFile(new File([bytes], "sensor.glb", { type }));
    assert.ok(prepared);
    assert.equal(prepared.mimeType, "model/gltf-binary");
    assert.equal(prepared.model.triangles, 1);
    assert.deepEqual(prepared.bytes, bytes);
    assert.equal(await prepareEditorialFile(new File(["not a model"], "sensor.glb", { type })), null);
  }
  assert.equal(await prepareEditorialFile(new File([bytes], "sensor.glb", { type: "text/plain" })), null);
  assert.equal(await prepareEditorialFile(new File([bytes], "sensor.txt", { type: "model/gltf-binary" })), null);
});

test("SVG and PNG uploads become safe transparent WebP images", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#ff0000"/></svg>';
  const image = await prepareEditorialFile(new File([svg], "category.svg", { type: "image/svg+xml" }));
  assert.equal(image?.mimeType, "image/webp");
  assert.equal((await sharp(image.bytes).metadata()).hasAlpha, true);
  const png = await sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0 } } }).png().toBuffer();
  const preparedPng = await prepareEditorialFile(new File([png], "category.png", { type: "image/png" }));
  assert.equal(preparedPng?.mimeType, "image/webp");
  assert.equal((await sharp(preparedPng.bytes).metadata()).hasAlpha, true);
  assert.equal(await prepareEditorialFile(new File([svg], "category.png", { type: "image/svg+xml" })), null);
  assert.equal(await prepareEditorialFile(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><script/></svg>'], "bad.svg", { type: "image/svg+xml" })), null);
});
