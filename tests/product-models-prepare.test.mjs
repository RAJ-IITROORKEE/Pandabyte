import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stripSerializedExtras } from "../scripts/product-models-prepare.mjs";
import {
  MAX_MODEL_BYTES,
  MAX_POSTER_BYTES,
  PRIVATE_MODEL_SOURCE_IDS,
  eligibilityFor,
  inspectGLBBytes,
  loadProductModelSources,
} from "../scripts/product-models-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeGlb(json, binaryBytes = 4) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJsonBytes = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJsonBytes);
  const total = 12 + 8 + paddedJsonBytes.length + 8 + binaryBytes;
  const bytes = Buffer.alloc(total);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(total, 8);
  bytes.writeUInt32LE(paddedJsonBytes.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  paddedJsonBytes.copy(bytes, 20);
  const binaryHeader = 20 + paddedJsonBytes.length;
  bytes.writeUInt32LE(binaryBytes, binaryHeader);
  bytes.writeUInt32LE(0x004e4942, binaryHeader + 4);
  return bytes;
}

function minimalGLB(overrides = {}) {
  return makeGlb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 4 }],
    ...overrides,
  });
}

test("inventory contains the 17 verified product GLBs and separate xLoRa V3 candidate", { skip: existsSync(path.join(root, "products/catalog.json")) ? false : "Owner-only source archive is not included in the public repository" }, () => {
  const sources = loadProductModelSources(root);
  assert.equal(sources.length, 18);
  assert.equal(sources.filter((source) => source.modelFolder.endsWith("/3d")).length, 17);
  assert.equal(sources.filter((source) => !source.publicUseAllowed).length, 6);
  assert.equal(PRIVATE_MODEL_SOURCE_IDS.size, 6);
  assert.equal(sources.find((source) => source.sourceId === "legacy:pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible").modelFolder,
    "experiments/xlora-visual-prototype/v3-hardware-corrections");
  assert.ok(sources.every((source) => source.sourcePaths.some(({ role }) => role === "sourceGLB")));
  assert.ok(sources.every((source) => source.sourcePaths.some(({ role }) => role === "modelManifest" || role === "experimentVerification")));
  assert.ok(sources.every((source) => source.sourceErrors.length === 0));
});

test("GLB inspection accepts embedded v2 resources and rejects external URIs", () => {
  const valid = minimalGLB({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 4 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
    images: [{ bufferView: 0, mimeType: "image/webp" }],
  });
  assert.deepEqual(inspectGLBBytes(valid), {
    json: {
      asset: { version: "2.0" },
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      images: [{ bufferView: 0, mimeType: "image/webp" }],
    },
    byteLength: valid.length,
    version: 2,
    selfContained: true,
    binBytes: 4,
  });

  assert.throws(() => inspectGLBBytes(minimalGLB({ asset: { version: "2.0" }, buffers: [{ uri: "external.bin", byteLength: 4 }] })), /glb_buffer_not_self_contained/);
  assert.throws(() => inspectGLBBytes(minimalGLB({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], images: [{ uri: "texture.png" }] })), /glb_image_not_self_contained_or_unsupported/);
  const badVersion = Buffer.from(valid);
  badVersion.writeUInt32LE(1, 4);
  assert.throws(() => inspectGLBBytes(badVersion), /invalid_glb_v2_header/);
});

test("serialized review candidates have non-rendering extras removed recursively", () => {
  const source = minimalGLB({
    asset: { version: "2.0", extras: { source: true } },
    buffers: [{ byteLength: 4 }],
    extras: { root: true },
    nodes: [{ name: "board", extras: { units: "meters" }, mesh: 0 }],
    meshes: [{ name: "pcb", extras: { from_gltf_primitive: false }, primitives: [] }],
    materials: [{ name: "solder-mask", extras: { label: "source" } }],
  });
  const stripped = stripSerializedExtras(source);
  assert.equal(stripped.removed, 5);
  const parsed = inspectGLBBytes(stripped.bytes).json;
  assert.equal(Object.hasOwn(parsed, "extras"), false);
  assert.equal(Object.hasOwn(parsed.asset, "extras"), false);
  assert.equal(Object.hasOwn(parsed.nodes[0], "extras"), false);
  assert.equal(Object.hasOwn(parsed.meshes[0], "extras"), false);
  assert.equal(Object.hasOwn(parsed.materials[0], "extras"), false);
  assert.equal(stripped.bytes.subarray(stripped.bytes.length - 4).toString("hex"), source.subarray(source.length - 4).toString("hex"));
});

test("eligibility enforces byte caps and the six owner-private source IDs", () => {
  assert.equal(eligibilityFor({ publicUseAllowed: true, modelBytes: MAX_MODEL_BYTES, posterBytes: MAX_POSTER_BYTES }), "development-integration-candidate");
  assert.equal(eligibilityFor({ publicUseAllowed: true, modelBytes: MAX_MODEL_BYTES + 1, posterBytes: 1 }), "held-model-over-4MiB");
  assert.equal(eligibilityFor({ publicUseAllowed: true, modelBytes: 1, posterBytes: MAX_POSTER_BYTES + 1 }), "held-poster-over-250KiB");
  assert.equal(eligibilityFor({ publicUseAllowed: false, modelBytes: 1, posterBytes: 1 }), "private-staff-preview-only");
  assert.equal(eligibilityFor({ publicUseAllowed: true, sourceErrors: ["source_hash_mismatch"], modelBytes: 1, posterBytes: 1 }), "held-source-validation");
  assert.equal(eligibilityFor({ publicUseAllowed: true, qualityErrors: ["bounds"], modelBytes: 1, posterBytes: 1 }), "held-quality-validation");
});
