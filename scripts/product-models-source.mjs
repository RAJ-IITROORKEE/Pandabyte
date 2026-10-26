import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MAX_MODEL_BYTES = 4 * 1024 * 1024;
export const MAX_POSTER_BYTES = 250 * 1024;
export const PREFERRED_TRIANGLE_LIMIT = 350_000;

export const PRIVATE_MODEL_SOURCE_IDS = new Set([
  "legacy:pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible",
  "legacy:pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible",
  "legacy:pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible",
  "legacy:maker-uno-simplifying-arduino-for-education",
  "legacy:rgb-led-circular-ws2812b-wemos-d1-mini",
  "legacy:pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible",
]);

const PRODUCT_MODELS = [
  ["legacy:pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible", "products/development-boards/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible"],
  ["legacy:pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible", "products/development-boards/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible"],
  ["legacy:pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible", "products/development-boards/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible"],
  ["legacy:maker-uno-simplifying-arduino-for-education", "products/development-boards/maker-uno-simplifying-arduino-for-education"],
  ["legacy:pandabyte-x8266-wifi-development-board", "products/development-boards/pandabyte-x8266-wifi-development-board"],
  ["legacy:rgb-led-circular-ws2812b-wemos-d1-mini", "products/sensors/rgb-led-circular-ws2812b-wemos-d1-mini"],
  ["legacy:neo-6m-gps-grove-compatible", "products/sensors/neo-6m-gps-grove-compatible"],
  ["legacy:pandabyte-rgb-rgb-lcd-backlight-grove-module", "products/sensors/pandabyte-rgb-rgb-lcd-backlight-grove-module"],
  ["legacy:active-buzzer-sensor-module", "products/sensors/active-buzzer-sensor-module"],
  ["legacy:barometric-pressure-sensor-bmp580-grove-compatible", "products/sensors/barometric-pressure-sensor-bmp580-grove-compatible"],
  ["legacy:pandabyte-max485-ttl-to-rs485-5v-12v", "products/sensors/pandabyte-max485-ttl-to-rs485-5v-12v"],
  ["legacy:pandabyte-potentiometerv-10k-ohm", "products/sensors/pandabyte-potentiometerv-10k-ohm"],
  ["legacy:push-button-switch", "products/sensors/push-button-switch"],
  ["legacy:rgb-led-grove-compatible", "products/sensors/rgb-led-grove-compatible"],
  ["legacy:rgb-led-matrix-ws2812b-xiao-footprint", "products/sensors/rgb-led-matrix-ws2812b-xiao-footprint"],
  ["legacy:single-color-led-light-emitting-diode", "products/sensors/single-color-led-light-emitting-diode"],
  ["legacy:temperature-humidity-dht11-sensor", "products/sensors/temperature-humidity-dht11-sensor"],
];

const XLORA_SOURCE_ID = "legacy:pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible";
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function checkedFile(root, base, relativePath, expectedSha256 = null) {
  if (typeof relativePath !== "string" || !relativePath.trim() || relativePath.includes("\0") || relativePath.includes(":")) {
    fail("invalid_source_path");
  }
  const parts = relativePath.replaceAll("\\", "/").split("/");
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || parts.some((part) => !part || part === "." || part === "..")) {
    fail("unsafe_source_path");
  }
  const rootReal = fs.realpathSync(root);
  const basePath = path.resolve(rootReal, base);
  if (!isWithin(rootReal, basePath)) fail("source_base_escapes_root");
  const baseReal = fs.realpathSync(basePath);
  const target = path.resolve(baseReal, ...parts);
  if (!isWithin(rootReal, target) || !isWithin(baseReal, target)) fail("source_path_escapes_root");
  const stats = fs.lstatSync(target);
  if (!stats.isFile() || stats.isSymbolicLink()) fail("source_not_regular_file");
  const canonical = fs.realpathSync(target);
  if (!isWithin(rootReal, canonical) || !isWithin(baseReal, canonical)) fail("source_path_escapes_root");
  const bytes = fs.readFileSync(canonical);
  const digest = sha256(bytes);
  if (expectedSha256 !== null && (!SHA256.test(expectedSha256) || digest !== expectedSha256)) fail("source_hash_mismatch");
  return {
    bytes,
    record: {
      path: path.relative(rootReal, canonical).split(path.sep).join("/"),
      bytes: bytes.length,
      sha256: digest,
    },
  };
}

function readJSON(root, base, relativePath, expectedSha256 = null) {
  const file = checkedFile(root, base, relativePath, expectedSha256);
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8"));
  } catch {
    fail("invalid_source_json");
  }
  return { ...file, value };
}

function collectRights(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    for (const item of value) collectRights(item, result);
    return result;
  }
  for (const [key, item] of Object.entries(value)) {
    if (/^(rights|rightsStatus|license|licenseStatus|license_status)$/iu.test(key) && typeof item === "string") {
      result.push(item.slice(0, 500));
    } else {
      collectRights(item, result);
    }
  }
  return result;
}

function errorCode(error) {
  return typeof error?.code === "string" && /^[a-z0-9_]+$/u.test(error.code) ? error.code : "source_validation_failed";
}

function baseEntry({ sourceId, productFolder, modelFolder, publicUseAllowed }) {
  return {
    sourceId,
    folder: productFolder,
    modelFolder,
    publicUseAllowed,
    title: null,
    slug: null,
    sourcePaths: [],
    provenance: { paths: [], rightsStatements: [] },
    readiness: {},
    sourceErrors: [],
    sourceGlbPath: null,
    sourcePosterPath: null,
    expectedGlbSha256: null,
    expectedPosterSha256: null,
    expectedGlbBytes: null,
    expectedTriangles: null,
    glbBytes: null,
    posterBytes: null,
  };
}

function addSource(root, entry, role, base, relativePath, expectedSha256 = null, { provenance = false } = {}) {
  const file = checkedFile(root, base, relativePath, expectedSha256);
  entry.sourcePaths.push({ role, ...file.record });
  if (provenance) entry.provenance.paths.push({ role, ...file.record });
  return file;
}

function canonicalEntry(root, verificationPath, verificationSha256, row, sourceId, productFolder) {
  const modelFolder = `${productFolder}/3d`;
  const entry = baseEntry({ sourceId, productFolder, modelFolder, publicUseAllowed: !PRIVATE_MODEL_SOURCE_IDS.has(sourceId) });
  entry.sourcePaths.push({ role: "catalogVerification", path: verificationPath, sha256: verificationSha256 });
  entry.readiness = {
    modelStatus: null,
    rootReview: row?.rootReview?.status ?? "missing",
    deliveryCheck: row?.deliveryCheck?.status ?? "missing",
    ownerReview: "awaiting-owner-review",
    visualReview: "passed",
  };
  try {
    if (!row || row.sourceId !== sourceId || row.folder !== modelFolder) fail("catalog_verification_identity_mismatch");
    if (row.rootReview?.status !== "passed" || row.deliveryCheck?.status !== "passed") fail("catalog_verification_not_passed");
    const productFile = readJSON(root, productFolder, "product.json");
    const product = productFile.value;
    if (product?.sourceId !== sourceId || product?.slug !== sourceId.slice("legacy:".length) || typeof product?.identity?.title !== "string") {
      fail("product_identity_mismatch");
    }
    entry.title = product.identity.title;
    entry.slug = product.slug;
    entry.sourcePaths.push({ role: "productRecord", ...productFile.record });

    const manifestFile = readJSON(root, modelFolder, "model.json");
    const manifest = manifestFile.value;
    if (manifest?.sourceId !== sourceId || manifest.status !== "ready-for-owner-review") fail("model_manifest_identity_or_status_mismatch");
    entry.sourcePaths.push({ role: "modelManifest", ...manifestFile.record });
    entry.readiness.modelStatus = manifest.status;
    entry.readiness.limitations = Array.isArray(manifest.limitations) ? manifest.limitations : [];
    entry.readiness.manufacturingValidated = manifest.manufacturingValidated === true;
    entry.readiness.electricalValidated = manifest.electricalValidated === true;

    const web = manifest.files?.webGLB;
    const front = manifest.files?.frontRender;
    if (!web?.path || !web?.sha256 || !front?.path || !front?.sha256) fail("model_manifest_media_missing");
    const glb = addSource(root, entry, "sourceGLB", modelFolder, web.path, web.sha256, { provenance: true });
    const poster = addSource(root, entry, "sourcePoster", modelFolder, front.path, front.sha256, { provenance: true });
    if (glb.record.bytes !== row.deliveryCheck.webBytes || glb.record.sha256 !== row.rootReview.webSha256 || glb.record.bytes !== row.deliveryCheck.webBytes) {
      fail("delivery_evidence_mismatch");
    }
    entry.sourceGlbPath = glb.record.path;
    entry.sourcePosterPath = poster.record.path;
    entry.expectedGlbSha256 = web.sha256;
    entry.expectedPosterSha256 = front.sha256;
    entry.expectedGlbBytes = row.deliveryCheck.webBytes;
    entry.expectedTriangles = row.deliveryCheck.triangles;
    entry.glbBytes = glb.record.bytes;
    entry.posterBytes = poster.record.bytes;

    for (const [role, ref] of [
      ["sourcePacket", { path: manifest.sourcePacket }],
      ["componentSources", manifest.files?.componentSources],
      ["modelSource", manifest.files?.modelSource],
      ["nativeSTEP", manifest.files?.nativeSTEP],
    ]) {
      if (!ref?.path) continue;
      const file = addSource(root, entry, role, modelFolder, ref.path, ref.sha256 ?? null, { provenance: true });
      if (role === "componentSources" || role === "sourcePacket") {
        const record = JSON.parse(file.bytes.toString("utf8"));
        entry.provenance.rightsStatements.push(...collectRights(record));
      }
    }
    entry.provenance.rightsStatements = [...new Set(entry.provenance.rightsStatements)];
  } catch (error) {
    entry.sourceErrors.push(errorCode(error));
  }
  return entry;
}

function xloraEntry(root) {
  const sourceId = XLORA_SOURCE_ID;
  const productFolder = "products/development-boards/pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible";
  const experimentFolder = "experiments/xlora-visual-prototype/v3-hardware-corrections";
  const entry = baseEntry({ sourceId, productFolder, modelFolder: experimentFolder, publicUseAllowed: false });
  entry.readiness = {
    modelStatus: "isolated-v3-prototype",
    rootReview: "awaiting-owner-review",
    deliveryCheck: "passed",
    ownerReview: "awaiting-owner-review",
    visualReview: "saved-renders-inspected",
    manualControlsPassed: false,
    limitation: "Final interactive browser controls and screenshot were inconclusive.",
  };
  try {
    const productFile = readJSON(root, productFolder, "product.json");
    const product = productFile.value;
    if (product?.sourceId !== sourceId || product?.slug !== sourceId.slice("legacy:".length)) fail("xlora_product_identity_mismatch");
    entry.title = product.identity?.title ?? null;
    entry.slug = product.slug;
    entry.sourcePaths.push({ role: "productRecord", ...productFile.record });

    const verificationFile = readJSON(root, experimentFolder, "verification.json");
    const verification = verificationFile.value;
    entry.sourcePaths.push({ role: "experimentVerification", ...verificationFile.record });
    if (verification.checksPassed !== true || verification.webGLB?.path !== "web/xlora-corrected-v3.glb") fail("xlora_verification_not_passed");
    entry.readiness.manualControlsPassed = verification.interactiveBrowser?.manualControlsPassed === true;
    entry.readiness.visualReview = verification.renderedReviewVisuallyInspected ? "saved-renders-inspected" : "not-verified";

    const validation = readJSON(root, experimentFolder, "web/validation.json");
    entry.sourcePaths.push({ role: "webValidation", ...validation.record });
    if (validation.value?.sha256 !== verification.webGLB.sha256 || validation.value?.triangles !== verification.webGLB.triangles) fail("xlora_web_validation_mismatch");
    const glb = addSource(root, entry, "sourceGLB", experimentFolder, verification.webGLB.path, verification.webGLB.sha256, { provenance: true });
    const poster = addSource(root, entry, "sourcePoster", experimentFolder, "web/review/front.png", null, { provenance: true });
    entry.sourceGlbPath = glb.record.path;
    entry.sourcePosterPath = poster.record.path;
    entry.expectedGlbSha256 = verification.webGLB.sha256;
    entry.expectedTriangles = verification.webGLB.triangles;
    entry.expectedGlbBytes = verification.webGLB.bytes;
    entry.glbBytes = glb.record.bytes;
    entry.posterBytes = poster.record.bytes;

    for (const [role, filePath, expectedHash] of [
      ["nativeSTEP", "cad/STEP/xlora_corrected_v3.step", verification.nativeSTEPsha256],
      ["manufacturerSources", "cad/manufacturer-sources.json", null],
      ["artworkProvenance", "artwork-report.json", null],
      ["experimentReadme", "README.md", null],
    ]) {
      const file = addSource(root, entry, role, experimentFolder, filePath, expectedHash, { provenance: true });
      if (role === "manufacturerSources") entry.provenance.rightsStatements.push(...collectRights(JSON.parse(file.bytes.toString("utf8"))));
    }
    entry.provenance.rightsStatements = [...new Set(entry.provenance.rightsStatements)];
  } catch (error) {
    entry.sourceErrors.push(errorCode(error));
  }
  return entry;
}

export function loadProductModelSources(root) {
  const rootReal = fs.realpathSync(root);
  const verificationPath = "docs/verification/product-cad-17.json";
  const verificationFile = readJSON(rootReal, ".", verificationPath);
  const verification = verificationFile.value;
  if (!Array.isArray(verification.products) || verification.products.length !== PRODUCT_MODELS.length) fail("canonical_model_count_mismatch");
  const rowsById = new Map(verification.products.map((row) => [row.sourceId, row]));
  if (rowsById.size !== PRODUCT_MODELS.length || PRODUCT_MODELS.some(([id]) => !rowsById.has(id))) fail("canonical_model_identity_mismatch");

  const entries = PRODUCT_MODELS.map(([sourceId, productFolder]) => canonicalEntry(
    rootReal,
    verificationPath,
    verificationFile.record.sha256,
    rowsById.get(sourceId),
    sourceId,
    productFolder,
  ));
  entries.push(xloraEntry(rootReal));
  if (entries.length !== 18 || new Set(entries.map((entry) => entry.sourceId)).size !== 18) fail("product_model_inventory_invalid");
  return entries;
}

export function inspectGLBBytes(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 20 || bytes.length > 64 * 1024 * 1024) fail("glb_size_out_of_bounds");
  if (bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail("invalid_glb_v2_header");
  let offset = 12;
  let json = null;
  let binBytes = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail("truncated_glb_chunk_header");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (!length || end > bytes.length) fail("truncated_glb_chunk");
    if (type === 0x4e4f534a) {
      if (json !== null || offset !== 12 || length > 2 * 1024 * 1024) fail("invalid_glb_json_chunk");
      try {
        json = JSON.parse(bytes.toString("utf8", start, end).replace(/[\u0000 ]+$/u, ""));
      } catch {
        fail("invalid_glb_json");
      }
    } else if (type === 0x004e4942) {
      if (binBytes !== null) fail("duplicate_glb_binary_chunk");
      binBytes = length;
    } else {
      fail("unsupported_glb_chunk");
    }
    offset = end;
  }
  if (offset !== bytes.length || !json || json.asset?.version !== "2.0") fail("invalid_glb_document");
  const buffers = json.buffers ?? [];
  if (buffers.length !== 1 || buffers[0].uri || !Number.isSafeInteger(buffers[0].byteLength) || binBytes === null || buffers[0].byteLength > binBytes || binBytes - buffers[0].byteLength > 3) {
    fail("glb_buffer_not_self_contained");
  }
  for (const image of json.images ?? []) {
    if (image.uri || !Number.isSafeInteger(image.bufferView) || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)) {
      fail("glb_image_not_self_contained_or_unsupported");
    }
  }
  const supportedRequiredExtensions = new Set(["KHR_mesh_quantization", "EXT_texture_webp"]);
  if ((json.extensionsRequired ?? []).some((name) => !supportedRequiredExtensions.has(name))) fail("unsupported_required_glb_extension");
  return { json, byteLength: bytes.length, version: 2, selfContained: true, binBytes };
}

export function eligibilityFor({ publicUseAllowed, sourceErrors = [], qualityErrors = [], modelBytes = null, posterBytes = null }) {
  if (sourceErrors.length) return "held-source-validation";
  if (qualityErrors.length) return "held-quality-validation";
  if (!Number.isSafeInteger(modelBytes) || modelBytes > MAX_MODEL_BYTES) return "held-model-over-4MiB";
  if (!Number.isSafeInteger(posterBytes) || posterBytes > MAX_POSTER_BYTES) return "held-poster-over-250KiB";
  if (!publicUseAllowed) return "private-staff-preview-only";
  return "development-integration-candidate";
}
