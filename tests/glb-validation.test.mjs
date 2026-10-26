import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  MAX_PRODUCT_GLB_BYTES,
  MAX_PRODUCT_GLB_TRIANGLES,
  validateProductGlb,
} from "../lib/editorial/glb-validation.ts";

function makeGlb({ document = {}, binary = Buffer.alloc(44), declaredBufferBytes = 42 } = {}) {
  const gltf = {
    asset: { version: "2.0", generator: "synthetic test fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: declaredBufferBytes }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    ...document,
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = (4 - json.length % 4) % 4;
  const paddedJson = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const paddedBinary = Buffer.from(binary);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + paddedBinary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBinary]);
}

function triangleBinary() {
  const binary = Buffer.alloc(44);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  binary.writeUInt16LE(0, 36);
  binary.writeUInt16LE(1, 38);
  binary.writeUInt16LE(2, 40);
  return binary;
}

function documentFrom(glb) {
  const length = glb.readUInt32LE(12);
  return JSON.parse(glb.toString("utf8", 20, 20 + length));
}

function withDocument(glb, mutate) {
  const document = documentFrom(glb);
  mutate(document);
  return makeGlb({ document, binary: triangleBinary() });
}

test("accepts a bounded self-contained GLB 2 triangle and returns its original-byte hash", async () => {
  const glb = makeGlb({ binary: triangleBinary() });
  assert.deepEqual(await validateProductGlb(glb), {
    triangles: 1,
    sha256: createHash("sha256").update(glb).digest("hex"),
  });
  assert.equal(MAX_PRODUCT_GLB_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_PRODUCT_GLB_TRIANGLES, 2_000_000);
});

test("rejects raw, truncated, JSON, non-GLB, and declared-length mismatches", async () => {
  const valid = makeGlb({ binary: triangleBinary() });
  assert.equal(await validateProductGlb(Buffer.from("<html>not a model</html>")), null);
  assert.equal(await validateProductGlb(Buffer.from(JSON.stringify({ asset: { version: "2.0" } }))), null);
  assert.equal(await validateProductGlb(valid.subarray(0, 23)), null);
  const badMagic = Buffer.from(valid);
  badMagic.write("JSON", 0, "latin1");
  assert.equal(await validateProductGlb(badMagic), null);
  const wrongLength = Buffer.from(valid);
  wrongLength.writeUInt32LE(valid.length + 4, 8);
  assert.equal(await validateProductGlb(wrongLength), null);
  const malformedJson = Buffer.from(valid);
  malformedJson[20] = 0;
  assert.equal(await validateProductGlb(malformedJson), null);
  assert.equal(await validateProductGlb(Buffer.alloc(MAX_PRODUCT_GLB_BYTES + 1)), null);
});

test("rejects extra chunks and trailing payloads", async () => {
  const valid = makeGlb({ binary: triangleBinary() });
  const trailing = Buffer.concat([valid, Buffer.from([0, 0, 0, 0])]);
  trailing.writeUInt32LE(trailing.length, 8);
  assert.equal(await validateProductGlb(trailing), null);

  const secondBin = Buffer.concat([valid, valid.subarray(valid.length - 8)]);
  secondBin.writeUInt32LE(secondBin.length, 8);
  assert.equal(await validateProductGlb(secondBin), null);
});

test("rejects external URIs and unknown extensions", async () => {
  const valid = makeGlb({ binary: triangleBinary() });
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.buffers[0].uri = "https://example.invalid/model.bin"; })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => {
    doc.extensionsUsed = ["KHR_draco_mesh_compression"];
  })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => {
    doc.images = [{ uri: "data:image/png;base64,AAAA" }];
  })), null);
  const quantizedExtension = withDocument(valid, (doc) => { doc.extensionsUsed = ["KHR_mesh_quantization"]; });
  assert.deepEqual(await validateProductGlb(quantizedExtension), {
    triangles: 1,
    sha256: createHash("sha256").update(quantizedExtension).digest("hex"),
  });
});

test("rejects cyclic or over-deep node graphs and unsupported animated or compressed content", async () => {
  const valid = makeGlb({ binary: triangleBinary() });
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => {
    doc.nodes = [{ children: [1] }, { children: [0], mesh: 0 }];
    doc.scenes = [{ nodes: [0] }];
  })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.animations = []; })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => {
    doc.meshes[0].primitives[0].targets = [{}];
  })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => {
    doc.nodes = Array.from({ length: 66 }, (_, index) => index < 65 ? { children: [index + 1] } : { mesh: 0 });
    doc.scenes = [{ nodes: [0] }];
  })), null);
});

test("rejects accessor and bufferView ranges outside the embedded BIN", async () => {
  const valid = makeGlb({ binary: triangleBinary() });
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.accessors[0].count = 4; })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.bufferViews[0].byteLength = 500; })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.accessors[1].componentType = 5126; })), null);
});

test("rejects non-finite vertex data and indices outside POSITION bounds", async () => {
  const nan = triangleBinary();
  nan.writeFloatLE(Number.NaN, 0);
  assert.equal(await validateProductGlb(makeGlb({ binary: nan })), null);
  const outOfRange = triangleBinary();
  outOfRange.writeUInt16LE(3, 40);
  assert.equal(await validateProductGlb(makeGlb({ binary: outOfRange })), null);
  const valid = makeGlb({ binary: triangleBinary() });
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.accessors[0].max = [100, 1, 0]; })), null);
  assert.equal(await validateProductGlb(withDocument(valid, (doc) => { doc.nodes[0].scale = [1e300, 1, 1]; })), null);
});

test("requires embedded images to decode and match their declared MIME type", async () => {
  const binary = triangleBinary();
  const invalidImage = withDocument(makeGlb({ binary }), (doc) => {
    delete doc.bufferViews[0].target;
    doc.images = [{ bufferView: 0, mimeType: "image/png" }];
  });
  assert.equal(await validateProductGlb(invalidImage), null);
});

test("accepts embedded WebP with declared texture extension and quantized geometry", async () => {
  const image = await sharp({ create: { width: 2, height: 2, channels: 4,
    background: { r: 30, g: 130, b: 80, alpha: 1 } } }).webp().toBuffer();
  const vertex = Buffer.alloc(20);
  [0, 0, 0, 32767, 0, 0, 0, 32767, 0].forEach((value, index) => vertex.writeInt16LE(value, index * 2));
  const index = Buffer.from([0, 0, 1, 0, 2, 0, 0, 0]);
  const payload = Buffer.concat([vertex, index, image]);
  const binary = Buffer.concat([payload, Buffer.alloc((4 - payload.length % 4) % 4)]);
  const document = {
    extensionsUsed: ["KHR_mesh_quantization", "EXT_texture_webp"],
    extensionsRequired: ["KHR_mesh_quantization", "EXT_texture_webp"],
    accessors: [{ bufferView: 0, componentType: 5122, count: 3, type: "VEC3", min: [0, 0, 0], max: [32767, 32767, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 18, target: 34962 },
      { buffer: 0, byteOffset: 20, byteLength: 6, target: 34963 },
      { buffer: 0, byteOffset: 28, byteLength: image.length }],
    images: [{ bufferView: 2, mimeType: "image/webp" }],
    textures: [{ extensions: { EXT_texture_webp: { source: 0 } } }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  };
  const glb = makeGlb({ document, binary, declaredBufferBytes: payload.length });
  assert.ok(await validateProductGlb(glb));
  document.extensionsUsed = ["KHR_mesh_quantization"];
  assert.equal(await validateProductGlb(makeGlb({ document, binary, declaredBufferBytes: payload.length })), null);
});
