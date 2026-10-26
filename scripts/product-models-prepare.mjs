import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { validateProductGlb } from "../lib/editorial/glb-validation.ts";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { cloneDocument, dedup, getBounds, prune, quantize, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import {
  MAX_MODEL_BYTES,
  MAX_POSTER_BYTES,
  PREFERRED_TRIANGLE_LIMIT,
  eligibilityFor,
  inspectGLBBytes,
  loadProductModelSources,
} from "./product-models-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, ".bootstrap", "product-models");
const BOUND_TOLERANCE_METERS = 0.0001;
const SIMPLIFY_ERROR_FRACTIONS = [0.00025, 0.001, 0.005];
const MIN_SIMPLIFY_RATIO = 0.025;
const MAX_TEXTURE_DIMENSION = 2048;
const WEBP_QUALITIES = [95, 90, 85, "lossless"];
const MAX_TEXTURE_MEAN_RGB_ERROR = 3;
const MAX_TEXTURE_P99_RGB_ERROR = 16;
const QUANTIZATION_PROFILES = [
  { name: "16-16-16", position: 16, normal: 16, texcoord: 16, color: 16 },
  { name: "16-8-14", position: 16, normal: 8, texcoord: 14, color: 16 },
  { name: "14-8-12", position: 14, normal: 8, texcoord: 12, color: 16 },
];
const POSTER_QUALITIES = [90, 85, 80, 75];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function relativePath(target) {
  return path.relative(ROOT, target).split(path.sep).join("/");
}

function makeIO() {
  return new NodeIO().registerExtensions([KHRMeshQuantization, EXTTextureWebP]);
}

function stripNonRenderingExtras(document) {
  const graph = document.getGraph();
  const pending = [document.getRoot()];
  const visited = new Set();
  let cleared = 0;
  while (pending.length) {
    const property = pending.pop();
    if (visited.has(property)) continue;
    visited.add(property);
    const extras = property.getExtras?.();
    if (extras && Object.keys(extras).length) {
      property.setExtras({});
      cleared++;
    }
    pending.push(...graph.listChildren(property));
  }
  const root = document.getRoot();
  const asset = root.getAsset();
  if (Object.hasOwn(asset, "extras")) {
    delete asset.extras;
    cleared++;
  }
  return cleared;
}

function stripSerializedExtras(input) {
  const source = Buffer.from(input);
  assert.equal(source.toString("ascii", 0, 4), "glTF", "cached GLB must have a GLB container");
  assert.equal(source.readUInt32LE(4), 2, "cached GLB must be version 2");
  const jsonLength = source.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  assert.ok(jsonEnd + 8 <= source.length && source.readUInt32LE(jsonEnd + 4) === 0x004e4942, "cached GLB binary chunk is missing");
  const binaryLength = source.readUInt32LE(jsonEnd);
  assert.equal(jsonEnd + 8 + binaryLength, source.length, "cached GLB must contain exactly one binary chunk");
  const json = JSON.parse(source.toString("utf8", 20, jsonEnd).replace(/[\u0000 ]+$/u, ""));
  let removed = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "extras")) {
      delete value.extras;
      removed++;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJson);
  const binary = source.subarray(jsonEnd + 8, source.length);
  const totalLength = 12 + 8 + paddedJson.length + 8 + binary.length;
  const output = Buffer.alloc(totalLength);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(output, 20);
  const binaryHeader = 20 + paddedJson.length;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return { bytes: output, removed };
}

function indexCount(primitive) {
  return primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
}

function triangleCount(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = indexCount(primitive);
      switch (primitive.getMode()) {
        case 4: total += Math.floor(count / 3); break;
        case 5:
        case 6: total += Math.max(0, count - 2); break;
      }
    }
  }
  return total;
}

async function decodedPixels(image) {
  const decoded = await sharp(Buffer.from(image), { limitInputPixels: 100_000_000, failOn: "error" })
    .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visiblePixels = Buffer.from(decoded.data);
  for (let index = 0; index < visiblePixels.length; index += 4) {
    if (visiblePixels[index + 3] === 0) {
      visiblePixels[index] = 0;
      visiblePixels[index + 1] = 0;
      visiblePixels[index + 2] = 0;
    }
  }
  return {
    width: decoded.info.width,
    height: decoded.info.height,
    channels: decoded.info.channels,
    bytes: decoded.data,
    sha256: sha256(decoded.data),
    visiblePixelsAndAlphaSha256: sha256(visiblePixels),
  };
}

function nodeNameCounts(root) {
  const counts = new Map();
  for (const node of root.listNodes()) {
    const name = node.getName();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function materialRecord(material) {
  const textureSlots = ["BaseColor", "MetallicRoughness", "Normal", "Occlusion", "Emissive"];
  return {
    name: material.getName(),
    baseColorFactor: material.getBaseColorFactor(),
    metallicFactor: material.getMetallicFactor(),
    roughnessFactor: material.getRoughnessFactor(),
    emissiveFactor: material.getEmissiveFactor(),
    alphaMode: material.getAlphaMode(),
    alphaCutoff: material.getAlphaMode() === "MASK" ? material.getAlphaCutoff() : null,
    doubleSided: material.getDoubleSided(),
    textures: Object.fromEntries(textureSlots.map((slot) => [
      slot,
      material[`get${slot}Texture`]?.()?.getName() ?? null,
    ])),
  };
}

async function snapshot(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0] ?? null;
  const bounds = scene ? getBounds(scene) : null;
  const textureRecords = [];
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    assert.ok(image?.length, "texture image data is missing");
    const pixels = await decodedPixels(image);
    textureRecords.push({
      name: texture.getName(),
      mimeType: texture.getMimeType(),
      encodedBytes: image.length,
      width: pixels.width,
      height: pixels.height,
      decodedPixelSha256: pixels.sha256,
      visiblePixelsAndAlphaSha256: pixels.visiblePixelsAndAlphaSha256,
    });
  }
  const meshRecords = root.listMeshes().map((mesh) => ({
    name: mesh.getName(),
    primitives: mesh.listPrimitives().map((primitive) => ({
      mode: primitive.getMode(),
      material: primitive.getMaterial()?.getName() ?? null,
      semantics: primitive.listSemantics().sort(),
      hasNormals: !!primitive.getAttribute("NORMAL"),
    })),
  }));
  return {
    triangles: triangleCount(document),
    nodes: root.listNodes().length,
    nodeNameCounts: nodeNameCounts(root),
    meshes: meshRecords,
    materials: root.listMaterials().map(materialRecord),
    textures: textureRecords,
    normals: meshRecords.flatMap((mesh) => mesh.primitives.map((primitive) => primitive.hasNormals)),
    bounds: bounds ? { min: Array.from(bounds.min), max: Array.from(bounds.max) } : null,
  };
}

function maxBoundsDelta(before, after) {
  if (!before || !after) return before === after ? 0 : Infinity;
  return Math.max(...before.min.map((value, index) => Math.abs(value - after.min[index])),
    ...before.max.map((value, index) => Math.abs(value - after.max[index])));
}

function namesPreserved(before, after) {
  return Object.entries(before).every(([name, count]) => (after[name] ?? 0) >= count);
}

async function textureQualityComparisons(sourceImages, outputTextures) {
  const comparisons = [];
  for (const [index, texture] of outputTextures.entries()) {
    const sourceImage = sourceImages[index];
    const outputImage = texture.getImage();
    assert.ok(sourceImage?.length && outputImage?.length, "texture image data is missing");
    const output = await decodedPixels(outputImage);
    let source;
    let resizedForComparison = false;
    const originalSource = await decodedPixels(sourceImage);
    if (originalSource.width === output.width && originalSource.height === output.height) {
      source = originalSource;
    } else {
      resizedForComparison = true;
      const resized = await sharp(Buffer.from(sourceImage), { limitInputPixels: 100_000_000, failOn: "error" })
        .resize(output.width, output.height, { fit: "fill", kernel: "lanczos3" })
        .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      source = { width: resized.info.width, height: resized.info.height, bytes: resized.data };
    }
    const bins = new Uint32Array(256);
    let channelSamples = 0;
    let errorSum = 0;
    let channelsOver8 = 0;
    let alphaChangedPixels = 0;
    let alphaErrorSum = 0;
    let alphaMaxError = 0;
    let visiblePixelSamples = 0;
    for (let pixel = 0; pixel < source.bytes.length; pixel += 4) {
      const sourceAlpha = source.bytes[pixel + 3];
      const outputAlpha = output.bytes[pixel + 3];
      const alphaError = Math.abs(sourceAlpha - outputAlpha);
      if (alphaError) alphaChangedPixels++;
      alphaErrorSum += alphaError;
      alphaMaxError = Math.max(alphaMaxError, alphaError);
      if (sourceAlpha >= 16 || outputAlpha >= 16) {
        visiblePixelSamples++;
        for (let channel = 0; channel < 3; channel++) {
          const error = Math.abs(source.bytes[pixel + channel] - output.bytes[pixel + channel]);
          bins[error]++;
          channelSamples++;
          errorSum += error;
          if (error > 8) channelsOver8++;
        }
      }
    }
    const p99Target = Math.ceil(channelSamples * 0.99);
    let cumulative = 0;
    let p99AbsoluteError = 0;
    for (let error = 0; error < bins.length; error++) {
      cumulative += bins[error];
      if (cumulative >= p99Target) {
        p99AbsoluteError = error;
        break;
      }
    }
    const meanAbsoluteError = channelSamples ? errorSum / channelSamples : 0;
    const qualityPassed = alphaChangedPixels === 0
      && meanAbsoluteError <= MAX_TEXTURE_MEAN_RGB_ERROR
      && p99AbsoluteError <= MAX_TEXTURE_P99_RGB_ERROR;
    comparisons.push({
      name: texture.getName(),
      sourceWidth: originalSource.width,
      sourceHeight: originalSource.height,
      outputWidth: output.width,
      outputHeight: output.height,
      resizedForComparison,
      alphaChangedPixels,
      alphaMeanAbsoluteError: Number((alphaErrorSum / Math.max(1, source.width * source.height)).toFixed(5)),
      alphaMaxAbsoluteError: alphaMaxError,
      visiblePixelSamples,
      visibleRGBMeanAbsoluteError: Number(meanAbsoluteError.toFixed(5)),
      visibleRGBP99AbsoluteError: p99AbsoluteError,
      visibleRGBChannelsOver8Percent: Number((channelsOver8 / Math.max(1, channelSamples) * 100).toFixed(4)),
      qualityPassed,
    });
  }
  return comparisons;
}

function preservationChecks(before, after, textureComparisons) {
  const pixelComparisons = before.textures.map((texture, index) => {
    const output = after.textures[index];
    return {
      name: texture.name,
      exactDecodedRGBA: texture.decodedPixelSha256 === output?.decodedPixelSha256,
      visibleRGBAndAlphaExact: texture.visiblePixelsAndAlphaSha256 === output?.visiblePixelsAndAlphaSha256,
      transparentRGBOnlyChanged: texture.decodedPixelSha256 !== output?.decodedPixelSha256
        && texture.visiblePixelsAndAlphaSha256 === output?.visiblePixelsAndAlphaSha256,
    };
  });
  const maxDelta = maxBoundsDelta(before.bounds, after.bounds);
  return {
    meshPartsAndPrimitiveMaterialsRetained: JSON.stringify(before.meshes) === JSON.stringify(after.meshes),
    sourceNodeNamesRetained: namesPreserved(before.nodeNameCounts, after.nodeNameCounts),
    materialsRetained: JSON.stringify(before.materials) === JSON.stringify(after.materials),
    textureCountRetained: before.textures.length === after.textures.length,
    textureNamesRetained: before.textures.length === after.textures.length
      && before.textures.every((texture, index) => texture.name === after.textures[index]?.name)
      && textureComparisons.every((texture, index) => texture.name === after.textures[index]?.name),
    textureDimensionsAtMost2048: after.textures.every((texture) => texture.width <= MAX_TEXTURE_DIMENSION && texture.height <= MAX_TEXTURE_DIMENSION),
    texturesPerceptuallyNearLossless: textureComparisons.length === after.textures.length
      && textureComparisons.every((texture) => texture.qualityPassed),
    texturePixelComparisons: textureComparisons.map((texture, index) => ({
      ...texture,
      ...pixelComparisons[index],
      exactDecodedRGBA: before.textures[index]?.decodedPixelSha256 === after.textures[index]?.decodedPixelSha256,
      visibleRGBAndAlphaExact: before.textures[index]?.visiblePixelsAndAlphaSha256 === after.textures[index]?.visiblePixelsAndAlphaSha256,
      transparentRGBOnlyChanged: before.textures[index]?.decodedPixelSha256 !== after.textures[index]?.decodedPixelSha256
        && before.textures[index]?.visiblePixelsAndAlphaSha256 === after.textures[index]?.visiblePixelsAndAlphaSha256,
    })),
    normalAttributesRetained: JSON.stringify(before.normals) === JSON.stringify(after.normals),
    boundsWithin0_1mm: maxDelta <= BOUND_TOLERANCE_METERS,
    boundsDeltaMeters: Number.isFinite(maxDelta) ? maxDelta : null,
  };
}

async function makeModelCandidate(baseDocument, io, before, sourceImages, simplifyRatio, errorFraction, textureQuality, quantizationProfile) {
  const document = cloneDocument(baseDocument);
  const transforms = [];
  if (simplifyRatio !== null) {
    await document.transform(simplify({
      simplifier: MeshoptSimplifier,
      ratio: simplifyRatio,
      error: errorFraction,
      lockBorder: true,
    }));
    transforms.push({
      name: "conservative mesh simplification",
      ratioRequested: simplifyRatio,
      errorBoundFractionOfMeshRadius: errorFraction,
      lockBorder: true,
    });
  }
  await document.transform(quantize({
    quantizePosition: quantizationProfile.position,
    quantizeNormal: quantizationProfile.normal,
    quantizeTexcoord: quantizationProfile.texcoord,
    quantizeColor: quantizationProfile.color,
    pattern: /^(POSITION|NORMAL|TEXCOORD_\d+|COLOR_\d+)$/u,
    quantizationVolume: "mesh",
    cleanup: false,
  }));
  transforms.push({ name: "KHR_mesh_quantization", ...quantizationProfile, volume: "mesh" });
  await document.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
    weld(),
    prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.BUFFER], keepAttributes: true, keepIndices: true, keepLeaves: true, keepExtras: true }),
  );
  transforms.push("post-quantization exact accessor dedup/weld and unreferenced accessor/buffer pruning");
  await document.transform(textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    quality: textureQuality === "lossless" ? undefined : textureQuality,
    lossless: textureQuality === "lossless",
    resize: [MAX_TEXTURE_DIMENSION, MAX_TEXTURE_DIMENSION],
    effort: 6,
  }));
  transforms.push({ name: "EXT_texture_webp", quality: textureQuality, resizedToMax: [MAX_TEXTURE_DIMENSION, MAX_TEXTURE_DIMENSION], lossless: textureQuality === "lossless" });

  const extrasRemoved = stripNonRenderingExtras(document);
  transforms.push({ name: "recursive non-rendering extras removal", propertiesCleared: extrasRemoved });
  const bytes = Buffer.from(await io.writeBinary(document));
  const info = inspectGLBBytes(bytes);
  const outputDocument = await io.readBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const after = await snapshot(outputDocument);
  const textureComparisons = await textureQualityComparisons(sourceImages, outputDocument.getRoot().listTextures());
  const checks = preservationChecks(before, after, textureComparisons);
  const failedChecks = Object.entries(checks)
    .filter(([key, value]) => !["boundsDeltaMeters", "texturePixelComparisons"].includes(key) && value !== true)
    .map(([key]) => key);
  return { document: outputDocument, bytes, info, after, checks, failedChecks, transforms, extrasRemoved, routeValidation: null };
}

async function posterCandidate(sourceBytes) {
  const source = await decodedPixels(sourceBytes);
  let candidate = null;
  for (const quality of POSTER_QUALITIES) {
    const bytes = await sharp(sourceBytes, { limitInputPixels: 20_000_000, failOn: "error" })
      .webp({ quality, effort: 6 }).toBuffer();
    if (bytes.length <= MAX_POSTER_BYTES) {
      candidate = { bytes, quality };
      break;
    }
  }
  if (!candidate) return { source, candidate: null };
  const output = await decodedPixels(candidate.bytes);
  if (source.width !== output.width || source.height !== output.height) return { source, candidate: null };
  let error = 0;
  for (let index = 0; index < source.bytes.length; index++) {
    error += Math.abs(source.bytes[index] - output.bytes[index]);
  }
  return {
    source,
    candidate: {
      ...candidate,
      outputPixelSha256: output.sha256,
      meanAbsoluteChannelError: error / source.bytes.length,
      maxAbsoluteChannelError: maxChannelError(source.bytes, output.bytes),
    },
  };
}

function maxChannelError(before, after) {
  let max = 0;
  for (let index = 0; index < before.length; index++) max = Math.max(max, Math.abs(before[index] - after[index]));
  return max;
}

async function writeGenerated(target, bytes) {
  const realRoot = await fs.realpath(ROOT);
  const outputRoot = await fs.realpath(OUTPUT);
  const relative = path.relative(outputRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !target.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error("generated_path_outside_bootstrap");
  }
  if (!target.startsWith(`${realRoot}${path.sep}.bootstrap${path.sep}product-models${path.sep}`)) {
    throw new Error("generated_path_outside_bootstrap");
  }
  let current = outputRoot;
  const parentParts = path.relative(outputRoot, path.dirname(target)).split(path.sep).filter(Boolean);
  for (const part of parentParts) {
    current = path.join(current, part);
    try {
      const stats = await fs.lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("generated_parent_not_regular_directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(current);
    }
    const realCurrent = await fs.realpath(current);
    if (!realCurrent.startsWith(`${outputRoot}${path.sep}`)) throw new Error("generated_path_outside_bootstrap");
  }
  try {
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("generated_target_not_regular_file");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, bytes, { flag: "wx" });
  await fs.rename(temporary, target);
}

async function removeGenerated(target) {
  const outputRoot = await fs.realpath(OUTPUT);
  const relative = path.relative(outputRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !target.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error("generated_path_outside_bootstrap");
  }
  try {
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("generated_target_not_regular_file");
    await fs.unlink(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readOwnedOutput(relative) {
  assert.equal(typeof relative, "string", "cached output path must be relative text");
  const target = path.resolve(ROOT, relative);
  const outputRoot = await fs.realpath(OUTPUT);
  const resolvedRelative = path.relative(outputRoot, target);
  assert.ok(resolvedRelative && resolvedRelative !== ".." && !resolvedRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(resolvedRelative),
    "cached output must remain in .bootstrap/product-models");
  const stats = await fs.lstat(target);
  assert.ok(stats.isFile() && !stats.isSymbolicLink(), "cached output must be a regular file");
  const canonical = await fs.realpath(target);
  assert.ok(canonical.startsWith(`${outputRoot}${path.sep}`), "cached output must not escape its output directory");
  return { target: canonical, bytes: await fs.readFile(canonical) };
}

async function reusePreviousEntry(entry, result, previous) {
  const previousModelPath = previous?.outputPaths?.glb ?? previous?.candidate?.glb?.reviewPath;
  const previousModelHash = previous?.outputPaths?.glb ? previous?.outputHashes?.glb : previous?.candidate?.glb?.sha256;
  if (!previous || previous.sourceId !== entry.sourceId || previous.publicUseAllowed !== entry.publicUseAllowed ||
    previous.source?.glb?.sha256 !== entry.expectedGlbSha256 || previous.source?.poster?.sha256 !== entry.expectedPosterSha256 ||
    !previousModelPath || !previousModelHash || !previous.outputPaths?.poster || !previous.outputHashes?.poster ||
    !previous.candidate?.glb || !previous.candidate?.poster || previous.candidate.glb.bytes > MAX_MODEL_BYTES) return null;

  try {
    const priorChecks = previous.qualityChecks ?? {};
    const requiredChecks = [
      "meshPartsAndPrimitiveMaterialsRetained",
      "sourceNodeNamesRetained",
      "normalAttributesRetained",
      "boundsWithin0_1mm",
      "textureCountRetained",
      "textureNamesRetained",
      "textureDimensionsAtMost2048",
    ];
    if (requiredChecks.some((key) => priorChecks[key] !== true)) return null;
    const materialsBefore = previous.source?.metrics?.materials;
    const materialsAfter = previous.candidate?.glb?.metrics?.materials;
    const normalizeMaterials = (materials) => materials.map((material) => ({
      ...material,
      alphaCutoff: material.alphaMode === "MASK" ? material.alphaCutoff : null,
    }));
    if (!Array.isArray(materialsBefore) || !Array.isArray(materialsAfter) ||
      JSON.stringify(normalizeMaterials(materialsBefore)) !== JSON.stringify(normalizeMaterials(materialsAfter))) return null;
    const priorTextureComparisons = priorChecks.texturePixelComparisons;
    if (!Array.isArray(priorTextureComparisons) || priorTextureComparisons.some((texture) =>
      texture.alphaChangedPixels !== 0 || texture.visibleRGBMeanAbsoluteError > MAX_TEXTURE_MEAN_RGB_ERROR ||
      texture.visibleRGBP99AbsoluteError > MAX_TEXTURE_P99_RGB_ERROR)) return null;

    const oldModel = await readOwnedOutput(previousModelPath);
    if (sha256(oldModel.bytes) !== previousModelHash || oldModel.bytes.length > MAX_MODEL_BYTES) return null;
    const stripped = stripSerializedExtras(oldModel.bytes);
    const validation = await validateProductGlb(stripped.bytes);
    if (!validation || validation.triangles !== previous.candidate.glb.triangles || stripped.bytes.length > MAX_MODEL_BYTES) return null;
    const poster = await readOwnedOutput(previous.outputPaths.poster);
    if (poster.bytes.length > MAX_POSTER_BYTES || sha256(poster.bytes) !== previous.outputHashes.poster) return null;

    const modelPath = path.join(OUTPUT, "models", `${entry.slug}.glb`);
    const posterPath = path.join(OUTPUT, "posters", `${entry.slug}.webp`);
    await writeGenerated(modelPath, stripped.bytes);
    await writeGenerated(posterPath, poster.bytes);
    const candidatePath = path.join(OUTPUT, "candidates", `${entry.slug}.glb`);
    await writeGenerated(candidatePath, stripped.bytes);
    const written = await fs.readFile(modelPath);
    const writtenValidation = await validateProductGlb(written);
    if (!writtenValidation || writtenValidation.sha256 !== validation.sha256 || writtenValidation.triangles !== validation.triangles) {
      await removeGenerated(modelPath);
      return null;
    }

    result.source.glb.gltfVersion = previous.source.glb.gltfVersion;
    result.source.glb.selfContained = previous.source.glb.selfContained;
    result.source.metrics = previous.source.metrics;
    result.outputPaths = { glb: relativePath(modelPath), poster: relativePath(posterPath) };
    result.outputHashes = { glb: writtenValidation.sha256, poster: previous.outputHashes.poster };
    result.candidate = structuredClone(previous.candidate);
    result.candidate.glb.reviewPath = relativePath(candidatePath);
    result.candidate.glb.bytes = written.length;
    result.candidate.glb.sha256 = writtenValidation.sha256;
    result.candidate.glb.triangles = writtenValidation.triangles;
    result.candidate.glb.routeValidation = { triangles: writtenValidation.triangles, sha256: writtenValidation.sha256 };
    result.candidate.glb.extrasRemoved = stripped.removed;
    result.candidate.glb.reduction.bytes = entry.glbBytes - written.length;
    result.candidate.glb.reduction.bytePercent = Number(((entry.glbBytes - written.length) / entry.glbBytes * 100).toFixed(2));
    result.transforms = [
      ...previous.transforms,
      { name: "verified prior derivative reused after recursive extras removal", propertiesCleared: stripped.removed },
    ];
    result.qualityChecks = {
      ...previous.qualityChecks,
      materialsRetained: true,
      texturesPerceptuallyNearLossless: true,
      productRouteValidatorPassed: true,
    };
    result.qualityWarnings = [...previous.qualityWarnings];
    result.heldErrors = [];
    result.eligibility = eligibilityFor({
      publicUseAllowed: entry.publicUseAllowed,
      modelBytes: written.length,
      posterBytes: poster.bytes.length,
    });
    return result;
  } catch {
    return null;
  }
}

async function prepareEntry(entry, previous = null) {
  const result = {
    sourceId: entry.sourceId,
    title: entry.title,
    slug: entry.slug,
    folder: entry.folder,
    modelFolder: entry.modelFolder,
    publicUseAllowed: entry.publicUseAllowed,
    readiness: entry.readiness,
    sourcePaths: entry.sourcePaths,
    provenance: entry.provenance,
    source: {
      glb: { path: entry.sourceGlbPath, sha256: entry.expectedGlbSha256, bytes: entry.glbBytes, triangles: entry.expectedTriangles },
      poster: { path: entry.sourcePosterPath, sha256: entry.expectedPosterSha256, bytes: entry.posterBytes },
    },
    outputPaths: { glb: null, poster: null },
    outputHashes: { glb: null, poster: null },
    candidate: { glb: null, poster: null },
    transforms: [],
    qualityChecks: null,
    qualityWarnings: [],
    heldErrors: [...entry.sourceErrors],
    eligibility: "held-source-validation",
  };
  if (entry.sourceErrors.length) return result;
  const reused = await reusePreviousEntry(entry, result, previous);
  if (reused) return reused;

  try {
    const sourceBytes = await fs.readFile(path.join(ROOT, entry.sourceGlbPath));
    const sourceInfo = inspectGLBBytes(sourceBytes);
    const io = makeIO();
    const document = await io.readBinary(new Uint8Array(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength));
    const before = await snapshot(document);
    if (entry.expectedTriangles !== null && before.triangles !== entry.expectedTriangles) throw new Error("source_triangle_count_mismatch");
    result.source.glb.gltfVersion = sourceInfo.version;
    result.source.glb.selfContained = sourceInfo.selfContained;
    result.source.metrics = before;

    const transforms = [
      dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
      weld(),
      prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.BUFFER], keepAttributes: true, keepIndices: true, keepLeaves: true, keepExtras: true }),
    ];
    result.transforms.push("bitwise accessor deduplication", "bitwise identical vertex weld", "unused accessor/buffer pruning only");
    await document.transform(...transforms);

    const preSimplifyTriangles = triangleCount(document);
    const baseRatio = preSimplifyTriangles > PREFERRED_TRIANGLE_LIMIT
      ? Math.min(1, PREFERRED_TRIANGLE_LIMIT / preSimplifyTriangles)
      : null;
    const sourceImages = document.getRoot().listTextures().map((texture) => Buffer.from(texture.getImage()));
    const ratios = baseRatio === null ? [null] : [baseRatio];
    while (baseRatio !== null && ratios.at(-1) > MIN_SIMPLIFY_RATIO) {
      ratios.push(Math.max(MIN_SIMPLIFY_RATIO, ratios.at(-1) / 2));
    }
    const fallbackRatio = baseRatio === null ? null : Math.max(MIN_SIMPLIFY_RATIO, Math.min(0.05, baseRatio));
    const searchGroups = baseRatio === null
      ? QUANTIZATION_PROFILES.map((profile) => ({ errorFraction: null, profile, ratios: [null] }))
      : [
        { errorFraction: SIMPLIFY_ERROR_FRACTIONS[0], profile: QUANTIZATION_PROFILES[0], ratios },
        { errorFraction: SIMPLIFY_ERROR_FRACTIONS[1], profile: QUANTIZATION_PROFILES[1], ratios: [fallbackRatio] },
        { errorFraction: SIMPLIFY_ERROR_FRACTIONS[2] * 0.6, profile: QUANTIZATION_PROFILES[2], ratios: [fallbackRatio] },
        { errorFraction: SIMPLIFY_ERROR_FRACTIONS[2], profile: QUANTIZATION_PROFILES[2], ratios: [MIN_SIMPLIFY_RATIO] },
      ];
    const attempts = [];
    let candidate = null;
    let selected = false;
    for (const group of searchGroups) {
      let textureQualityFailureSeen = false;
      for (const textureQuality of WEBP_QUALITIES) {
        if (textureQuality === "lossless" && !textureQualityFailureSeen) continue;
        const attemptRatios = textureQuality === 90 && group.ratios.length > 1 ? [group.ratios.at(-1)] : group.ratios;
        for (const ratio of attemptRatios) {
          const quantizationProfile = group.profile;
          const errorFraction = group.errorFraction;
            candidate = await makeModelCandidate(document, io, before, sourceImages, ratio, errorFraction, textureQuality, quantizationProfile);
            if (candidate.bytes.length <= MAX_MODEL_BYTES && candidate.failedChecks.length === 0) {
              candidate.routeValidationAttempted = true;
              candidate.routeValidation = await validateProductGlb(candidate.bytes);
              candidate.checks.productRouteValidatorPassed = candidate.routeValidation !== null
                && candidate.routeValidation.triangles === candidate.after.triangles
                && candidate.routeValidation.sha256 === sha256(candidate.bytes);
              if (!candidate.checks.productRouteValidatorPassed) candidate.failedChecks.push("product_route_validation_failed");
            }
            attempts.push({
              ratioRequested: ratio,
              errorBoundFractionOfMeshRadius: errorFraction,
              textureQuality,
              quantization: quantizationProfile,
              bytes: candidate.bytes.length,
              sha256: sha256(candidate.bytes),
              triangles: candidate.after.triangles,
              boundsDeltaMeters: candidate.checks.boundsDeltaMeters,
              qualityPassed: candidate.failedChecks.length === 0,
              qualityErrors: candidate.failedChecks,
              routeValidator: candidate.routeValidationAttempted ? (candidate.routeValidation ? "passed" : "failed") : "not-run",
            });
            if (candidate.failedChecks.length) {
              const nonTextureFailures = candidate.failedChecks.filter((error) => error !== "texturesPerceptuallyNearLossless");
              if (!nonTextureFailures.length) textureQualityFailureSeen = true;
              if (nonTextureFailures.length || textureQuality === "lossless") selected = true;
              break;
            }
            if (candidate.bytes.length <= MAX_MODEL_BYTES) {
              selected = true;
              break;
            }
        }
        if (selected) break;
      }
      if (selected) break;
    }
    if (baseRatio === null && candidate && candidate.bytes.length > MAX_MODEL_BYTES && candidate.failedChecks.length === 0) {
      // Some models below the triangle preference still miss the byte cap by a small margin.
      // Try one tightly bounded, lock-border-preserving geometry reduction before holding them.
      for (const ratio of [0.99, 0.98]) {
        const microCandidate = await makeModelCandidate(
          document,
          io,
          before,
          sourceImages,
          ratio,
          SIMPLIFY_ERROR_FRACTIONS[0],
          90,
          QUANTIZATION_PROFILES[2],
        );
        if (microCandidate.bytes.length <= MAX_MODEL_BYTES && microCandidate.failedChecks.length === 0) {
          microCandidate.routeValidationAttempted = true;
          microCandidate.routeValidation = await validateProductGlb(microCandidate.bytes);
          microCandidate.checks.productRouteValidatorPassed = microCandidate.routeValidation !== null
            && microCandidate.routeValidation.triangles === microCandidate.after.triangles
            && microCandidate.routeValidation.sha256 === sha256(microCandidate.bytes);
          if (!microCandidate.checks.productRouteValidatorPassed) microCandidate.failedChecks.push("product_route_validation_failed");
        }
        attempts.push({
          ratioRequested: ratio,
          errorBoundFractionOfMeshRadius: SIMPLIFY_ERROR_FRACTIONS[0],
          textureQuality: 90,
          quantization: QUANTIZATION_PROFILES[2],
          bytes: microCandidate.bytes.length,
          sha256: sha256(microCandidate.bytes),
          triangles: microCandidate.after.triangles,
          boundsDeltaMeters: microCandidate.checks.boundsDeltaMeters,
          qualityPassed: microCandidate.failedChecks.length === 0,
          qualityErrors: microCandidate.failedChecks,
          routeValidator: microCandidate.routeValidationAttempted ? (microCandidate.routeValidation ? "passed" : "failed") : "not-run",
          fallback: "below-preferred-triangle-limit-byte-cap-recovery",
        });
        candidate = microCandidate;
        if (candidate.bytes.length <= MAX_MODEL_BYTES || candidate.failedChecks.length) break;
      }
    }
    result.transforms.push({
      name: "bounded geometry/texture quality search",
      attempts: attempts.map(({ ratioRequested, errorBoundFractionOfMeshRadius, textureQuality, quantization, triangles, bytes, qualityPassed }) => ({
        ratioRequested,
        errorBoundFractionOfMeshRadius,
        textureQuality,
        quantization,
        triangles,
        bytes,
        qualityPassed,
      })),
      lockBorder: true,
      minimumRequestedRatio: MIN_SIMPLIFY_RATIO,
      textureMaxDimension: MAX_TEXTURE_DIMENSION,
      quantizationProfiles: QUANTIZATION_PROFILES,
      perceptualErrorThresholds: { meanRGB: MAX_TEXTURE_MEAN_RGB_ERROR, p99RGB: MAX_TEXTURE_P99_RGB_ERROR, alphaChangedPixels: 0 },
    });
    result.transforms.push(...candidate.transforms.filter((transform) => transform.name !== "conservative mesh simplification"));

    const { bytes: candidateBytes, info: candidateInfo, after, checks } = candidate;
    result.qualityChecks = {
      ...checks,
      outputGLBv2: candidateInfo.version === 2,
      outputSelfContained: candidateInfo.selfContained,
      allRequiredExtensionsSupported: true,
      visualReviewRequired: true,
    };
    result.candidate.glb = {
      bytes: candidateBytes.length,
      sha256: sha256(candidateBytes),
      triangles: after.triangles,
      metrics: after,
      attempts,
      reduction: {
        triangles: before.triangles - after.triangles,
        trianglePercent: before.triangles ? Number(((before.triangles - after.triangles) / before.triangles * 100).toFixed(2)) : 0,
        bytes: sourceBytes.length - candidateBytes.length,
        bytePercent: Number(((sourceBytes.length - candidateBytes.length) / sourceBytes.length * 100).toFixed(2)),
      },
    };

    const failedChecks = candidate.failedChecks;
    const reviewCandidatePath = path.join(OUTPUT, "candidates", `${entry.slug}.glb`);
    await writeGenerated(reviewCandidatePath, candidateBytes);
    result.candidate.glb.reviewPath = relativePath(reviewCandidatePath);
    if (candidateBytes.length > MAX_MODEL_BYTES) result.heldErrors.push("model_over_4MiB");
    if (failedChecks.length) result.heldErrors.push(...failedChecks.map((key) => `quality_check_failed:${key}`));
    if (after.triangles > PREFERRED_TRIANGLE_LIMIT) result.qualityWarnings.push("triangle_count_above_preferred_350k_target");

    const posterBytes = await fs.readFile(path.join(ROOT, entry.sourcePosterPath));
    const poster = await posterCandidate(posterBytes);
    result.candidate.poster = poster.candidate ? {
      bytes: poster.candidate.bytes.length,
      sha256: sha256(poster.candidate.bytes),
      quality: poster.candidate.quality,
      lossless: false,
      width: poster.source.width,
      height: poster.source.height,
      sourceDecodedPixelSha256: poster.source.sha256,
      outputDecodedPixelSha256: poster.candidate.outputPixelSha256,
      meanAbsoluteChannelError: Number(poster.candidate.meanAbsoluteChannelError.toFixed(4)),
      maxAbsoluteChannelError: poster.candidate.maxAbsoluteChannelError,
    } : { held: "poster_over_250KiB_at_quality_75" };
    if (!poster.candidate) result.heldErrors.push("poster_over_250KiB");

    result.eligibility = eligibilityFor({
      publicUseAllowed: entry.publicUseAllowed,
      sourceErrors: [],
      qualityErrors: failedChecks.map((key) => `quality_check_failed:${key}`),
      modelBytes: candidateBytes.length,
      posterBytes: poster.candidate?.bytes.length ?? null,
    });

    if (candidateBytes.length <= MAX_MODEL_BYTES && failedChecks.length === 0) {
      const glbPath = path.join(OUTPUT, "models", `${entry.slug}.glb`);
      await writeGenerated(glbPath, candidateBytes);
      const writtenBytes = await fs.readFile(glbPath);
      const routeValidation = await validateProductGlb(writtenBytes);
      if (!routeValidation || routeValidation.triangles !== after.triangles || routeValidation.sha256 !== sha256(writtenBytes)) {
        await removeGenerated(glbPath);
        throw new Error("final_route_glb_validation_failed");
      }
      result.outputPaths.glb = relativePath(glbPath);
      result.outputHashes.glb = routeValidation.sha256;
    } else {
      await removeGenerated(path.join(OUTPUT, "models", `${entry.slug}.glb`));
    }
    if (poster.candidate) {
      const posterPath = path.join(OUTPUT, "posters", `${entry.slug}.webp`);
      await writeGenerated(posterPath, poster.candidate.bytes);
      result.outputPaths.poster = relativePath(posterPath);
      result.outputHashes.poster = result.candidate.poster.sha256;
    } else {
      await removeGenerated(path.join(OUTPUT, "posters", `${entry.slug}.webp`));
    }
  } catch (error) {
    result.heldErrors.push(typeof error?.message === "string" ? error.message.replace(/[^a-zA-Z0-9:_-]/gu, "_").slice(0, 160) : "model_preparation_failed");
    result.eligibility = "held-processing-error";
  }
  return result;
}

async function main() {
  const onlyArgument = process.argv.slice(2);
  assert.ok(onlyArgument.length <= 1, "Only one targeted source may be prepared at a time");
  const selectedSourceId = onlyArgument.length ? onlyArgument[0].startsWith("--only=") ? onlyArgument[0].slice("--only=".length) : "" : null;
  if (selectedSourceId !== null) assert.ok(selectedSourceId.length > 0 && !selectedSourceId.includes("\0"), "--only requires an exact sourceId");
  const bootstrap = path.join(ROOT, ".bootstrap");
  try {
    const bootstrapStats = await fs.lstat(bootstrap);
    assert.ok(bootstrapStats.isDirectory() && !bootstrapStats.isSymbolicLink(), "bootstrap output parent must be a real directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(bootstrap);
  }
  try {
    const outputStats = await fs.lstat(OUTPUT);
    assert.ok(outputStats.isDirectory() && !outputStats.isSymbolicLink(), "product model output must be a real directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(OUTPUT);
  }
  const realRoot = await fs.realpath(ROOT);
  const realOutput = await fs.realpath(OUTPUT);
  assert.equal(realOutput, path.join(realRoot, ".bootstrap", "product-models"), "output must remain under ignored .bootstrap/product-models");

  const sources = loadProductModelSources(ROOT);
  const previousById = new Map();
  try {
    const previous = JSON.parse(await fs.readFile(path.join(OUTPUT, "manifest.json"), "utf8"));
    if (previous.schemaVersion === 1 && Array.isArray(previous.assets)) {
      for (const asset of previous.assets) if (typeof asset?.sourceId === "string") previousById.set(asset.sourceId, asset);
    }
  } catch {
    // A missing or invalid prior report simply disables safe derivative reuse.
  }
  if (selectedSourceId !== null) {
    assert.ok(sources.some((source) => source.sourceId === selectedSourceId), "--only sourceId is not in the verified inventory");
    assert.equal(previousById.size, sources.length, "targeted preparation requires a complete prior 18-entry manifest");
    for (const source of sources) {
      const previous = previousById.get(source.sourceId);
      assert.ok(previous, `targeted preparation is missing prior manifest row ${source.sourceId}`);
      assert.equal(JSON.stringify(previous.sourcePaths), JSON.stringify(source.sourcePaths), `targeted preparation refuses changed source provenance for ${source.sourceId}`);
    }
  }
  const results = [];
  for (const source of sources) {
    if (selectedSourceId !== null && source.sourceId !== selectedSourceId) {
      results.push(previousById.get(source.sourceId));
    } else {
      results.push(await prepareEntry(source, previousById.get(source.sourceId)));
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    outputRoot: ".bootstrap/product-models",
    limits: { modelBytes: MAX_MODEL_BYTES, posterBytes: MAX_POSTER_BYTES, preferredTriangles: PREFERRED_TRIANGLE_LIMIT },
    transforms: "Bitwise accessor dedup/weld and unused accessor pruning before and after quantization; bounded Meshopt simplification for high-count models, plus byte-cap recovery ratios 0.99/0.98 below the preferred triangle limit; standard KHR mesh quantization profiles 16-16-16, 16-8-14 and 14-8-12 (position-normal-texcoord bits); WebP q95/q90/q85 or lossless fallback, capped at 2048 pixels per side; recursive non-rendering extras removal. Per-texture visible RGB/alpha errors and resize dimensions are recorded. Overall GLB is not lossless because geometry is quantized and may be simplified; q95/q90/q85 textures are lossy.",
    publicUsePolicy: "Six owner-designated vendor-derived models are private; all other candidates are development-only pending root review.",
    counts: {
      assets: results.length,
      sourceErrors: results.filter((result) => result.eligibility === "held-source-validation").length,
      processingErrors: results.filter((result) => result.eligibility === "held-processing-error").length,
      modelOutputs: results.filter((result) => result.outputPaths.glb).length,
      posterOutputs: results.filter((result) => result.outputPaths.poster).length,
      held: results.filter((result) => result.eligibility.startsWith("held-")).length,
      private: results.filter((result) => result.publicUseAllowed === false).length,
    },
    assets: results,
  };
  const manifestPath = path.join(OUTPUT, "manifest.json");
  await writeGenerated(manifestPath, Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
  process.stdout.write(`${JSON.stringify(report.counts)}\n`);
  if (report.counts.held) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`product_model_preparation_stopped:${error?.code ?? "unexpected_error"}`);
    process.exitCode = 1;
  });
}

export { main, preservationChecks, stripSerializedExtras, triangleCount };
