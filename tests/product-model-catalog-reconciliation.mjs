import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isReviewOnlyPublicVariant, sourcePricePair } from "../scripts/catalog-price-import.mjs";
import { PRIVATE_MODEL_SOURCE_IDS } from "../scripts/product-models-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK_ROOT = path.join(ROOT, ".bootstrap", "product-models");
const MANIFEST_PATH = path.join(WORK_ROOT, "manifest.json");
const MODEL_LEDGER_PATH = path.join(WORK_ROOT, "integration-ledger.json");
const CATALOG_LEDGER_PATH = path.join(ROOT, ".bootstrap", "catalog-import", "ledger.json");
const PROJECT_ID = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const DEFAULT_ORIGIN = "http://localhost:3000";
const MAX_MODEL_BYTES = 4 * 1024 * 1024;
const MAX_POSTER_BYTES = 250 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function originFromEnvironment() {
  let origin;
  try { origin = new URL(process.env.PRODUCT_MODELS_APP_ORIGIN ?? DEFAULT_ORIGIN); }
  catch { throw new Error("loopback_origin_invalid"); }
  const port = Number(origin.port || 80);
  ensure(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) && port >= 3000 && port <= 3999 &&
    origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password, "loopback_origin_required");
  return origin.origin;
}

async function readJsonFile(filePath) {
  let stat;
  try { stat = await fs.lstat(filePath); }
  catch { throw new Error("reconciliation_input_missing"); }
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= MAX_JSON_BYTES, "reconciliation_input_invalid");
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch { throw new Error("reconciliation_input_invalid"); }
}

async function readBounded(response, limit) {
  ensure(response.body, "response_body_missing");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("response_body_too_large");
      }
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function request(origin, pathname, { expectedStatus = 200, maxBytes = MAX_JSON_BYTES, binary = false } = {}) {
  let response;
  try {
    response = await fetch(new URL(pathname, origin), {
      method: "GET",
      headers: { accept: binary ? "*/*" : "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("loopback_request_failed");
  }
  ensure(response.status === expectedStatus, `unexpected_http_${expectedStatus === 404 ? "private_media_visibility" : expectedStatus === 400 ? "model_resize_rejection" : "public_response"}`);
  if (expectedStatus === 404 || expectedStatus === 400) return { response, value: null };
  const bytes = await readBounded(response, maxBytes);
  if (binary) return { response, value: bytes };
  try { return { response, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }; }
  catch { throw new Error("public_json_invalid"); }
}

function checkNoStoreAndSniff(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  ensure(/(?:^|,)\s*private\b/iu.test(cacheControl) && /(?:^|,)\s*no-store\b/iu.test(cacheControl), "media_cache_policy_invalid");
  ensure((response.headers.get("x-content-type-options") ?? "").toLowerCase() === "nosniff", "media_nosniff_missing");
}

function exactKeys(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    stable(Object.keys(value).sort()) === stable([...keys].sort());
}

function expectedSourceObservation(tracked) {
  const source = tracked?.provenance?.source;
  const price = tracked?.provenance?.priceObservations?.prices?.find((item) => item?.field === "formattedPrice");
  ensure(source && typeof source.sourceId === "string" && typeof source.sourceSku === "string" &&
    typeof source.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/iu.test(source.slug) &&
    typeof source.title === "string" && typeof source.sourceUrl === "string" &&
    price && typeof price.text === "string" && typeof price.capturedAt === "string", "catalog_observation_source_invalid");
  const observation = { priceText: price.text, capturedAt: price.capturedAt, sourceUrl: source.sourceUrl };
  ensure(exactKeys(observation, ["priceText", "capturedAt", "sourceUrl"]) && observation.priceText.trim().length > 0 &&
    Number.isFinite(Date.parse(observation.capturedAt)) && /(?:Z|[+-]\d{2}:\d{2})$/u.test(observation.capturedAt), "catalog_observation_expected_invalid");
  let url;
  try { url = new URL(observation.sourceUrl); }
  catch { throw new Error("catalog_observation_expected_invalid"); }
  ensure(url.protocol === "https:" && !url.username && !url.password, "catalog_observation_expected_invalid");
  return { source, observation, pair: sourcePricePair({ commercialObservations: tracked.provenance.priceObservations }) };
}

function assertObservation(actual, expected) {
  ensure(exactKeys(actual, ["priceText", "capturedAt", "sourceUrl"]) && stable(actual) === stable(expected), "source_observation_mismatch");
}

function assertNonPurchasableVariants(record, expected) {
  ensure(Array.isArray(record?.variants) && record.variants.length === 1, "source_variant_count_invalid");
  ensure(isReviewOnlyPublicVariant(record.variants[0], expected.source.sourceSku, expected.pair), "source_variant_review_contract_invalid");
}

function validateInputs(manifest, modelLedger, catalogLedger) {
  ensure(manifest?.schemaVersion === 1 && manifest.outputRoot === ".bootstrap/product-models" && Array.isArray(manifest.assets) &&
    manifest.assets.length === 18 && new Set(manifest.assets.map((asset) => asset?.sourceId)).size === 18, "model_manifest_invalid");
  ensure(manifest.counts?.assets === 18 && manifest.counts?.modelOutputs === 18 && manifest.counts?.posterOutputs === 18 && manifest.counts?.held === 0,
    "model_manifest_not_ready");
  ensure(modelLedger?.schemaVersion === 1 && modelLedger.projectId === PROJECT_ID && modelLedger.assets && modelLedger.products &&
    modelLedger.pending && Object.keys(modelLedger.assets).length === 18 && Object.keys(modelLedger.products).length === 18 &&
    Object.keys(modelLedger.pending).length === 0, "model_integration_ledger_incomplete");
  ensure(catalogLedger?.schemaVersion === 1 && catalogLedger.projectId === PROJECT_ID && catalogLedger.products &&
    Object.keys(catalogLedger.products).length === 42, "catalog_import_ledger_incomplete");

  const privateSources = manifest.assets.filter((asset) => asset.publicUseAllowed === false).map((asset) => asset.sourceId);
  ensure(manifest.assets.every((asset) => typeof asset.publicUseAllowed === "boolean") && privateSources.length === 6 &&
    privateSources.every((sourceId) => PRIVATE_MODEL_SOURCE_IDS.has(sourceId)) && [...PRIVATE_MODEL_SOURCE_IDS].every((sourceId) => privateSources.includes(sourceId)),
  "model_rights_policy_changed");
  const publicAssets = manifest.assets.filter((asset) => asset.publicUseAllowed && asset.readiness?.rootReview === "passed");
  ensure(publicAssets.length === 12 && manifest.assets.filter((asset) => !asset.publicUseAllowed).length === 6 &&
    manifest.assets.filter((asset) => asset.publicUseAllowed && asset.readiness?.rootReview !== "passed").length === 0,
  "model_publication_eligibility_changed");

  const assets = new Map();
  const allMediaIds = new Set();
  for (const asset of manifest.assets) {
    ensure(typeof asset.sourceId === "string" && typeof asset.slug === "string" && typeof asset.title === "string" &&
      asset.outputPaths?.glb && asset.outputPaths?.poster && SHA256.test(asset.outputHashes?.glb ?? "") && SHA256.test(asset.outputHashes?.poster ?? "") &&
      asset.candidate?.glb?.sha256 === asset.outputHashes.glb && asset.candidate.glb.bytes <= MAX_MODEL_BYTES &&
      asset.candidate?.poster?.sha256 === asset.outputHashes.poster && asset.candidate.poster.bytes <= MAX_POSTER_BYTES &&
      Array.isArray(asset.heldErrors) && asset.heldErrors.length === 0, "model_asset_manifest_incomplete");
    const imported = catalogLedger.products[asset.sourceId];
    const catalogExpected = expectedSourceObservation(imported);
    ensure(catalogExpected.source.slug === asset.slug && catalogExpected.source.title === asset.title, "model_source_product_mismatch");
    const media = modelLedger.assets[asset.sourceId];
    const product = modelLedger.products[asset.sourceId];
    ensure(media?.model && media.poster && product && UUID.test(media.model.id) && UUID.test(media.poster.id) &&
      UUID.test(product.id) && product.id === imported.id && product.mediaId === media.model.id && product.posterId === media.poster.id,
    "model_integration_mapping_incomplete");
    ensure(!allMediaIds.has(media.model.id) && !allMediaIds.has(media.poster.id) && media.model.id !== media.poster.id, "model_media_id_collision");
    allMediaIds.add(media.model.id);
    allMediaIds.add(media.poster.id);
    ensure(media.model.mimeType === "model/gltf-binary" && media.model.publicUseAllowed === asset.publicUseAllowed &&
      media.model.published === asset.publicUseAllowed && Number.isSafeInteger(media.model.version) && media.model.version >= 1 &&
      Number.isSafeInteger(media.model.byteSize) && media.model.byteSize === asset.candidate.glb.bytes && media.model.byteSize > 0 && media.model.byteSize <= MAX_MODEL_BYTES &&
      media.model.deliverySha256 === asset.outputHashes.glb && media.model.triangles === asset.candidate?.glb?.triangles &&
      SHA256.test(media.model.deliverySha256 ?? ""), "model_media_ledger_state_invalid");
    ensure(media.poster.mimeType === "image/webp" && media.poster.publicUseAllowed === null && media.poster.published === asset.publicUseAllowed &&
      Number.isSafeInteger(media.poster.version) && media.poster.version >= 1 && media.poster.altText === media.model.altText &&
      Number.isSafeInteger(media.poster.byteSize) && media.poster.byteSize > 0 && media.poster.byteSize <= MAX_POSTER_BYTES &&
      SHA256.test(media.poster.deliverySha256 ?? ""), "poster_media_ledger_state_invalid");
    ensure(product.state === (asset.publicUseAllowed ? "published" : "draft"), "product_model_publication_state_invalid");
    assets.set(asset.slug, { asset, media, product, expected: catalogExpected });
  }
  ensure(assets.size === 18, "model_source_mapping_ambiguous");

  const sourcesBySlug = new Map();
  const sourceIds = new Set();
  const sourceSkus = new Set();
  for (const [sourceId, tracked] of Object.entries(catalogLedger.products)) {
    const expected = expectedSourceObservation(tracked);
    ensure(expected.source.sourceId === sourceId && UUID.test(tracked.id) && !sourcesBySlug.has(expected.source.slug) &&
      !sourceIds.has(tracked.id) && !sourceSkus.has(expected.source.sourceSku), "catalog_source_mapping_ambiguous");
    sourcesBySlug.set(expected.source.slug, { id: tracked.id, expected });
    sourceIds.add(tracked.id);
    sourceSkus.add(expected.source.sourceSku);
  }
  return { assets, sourcesBySlug };
}

function assertPublicRecord(record, listItem, source) {
  ensure(record?.id === source.id && record.kind === "product" && record.title === source.expected.source.title &&
    record.slug === source.expected.source.slug && record.revisionId === listItem.revisionId &&
    !("sourceReview" in record) && !("sourceReview" in listItem) && record.document && listItem.document &&
    !("sourceReview" in record.document) && !("sourceReview" in listItem.document), "published_product_identity_or_privacy_invalid");
  assertObservation(record.document.sourceObservation, source.expected.observation);
  assertObservation(listItem.document?.sourceObservation, source.expected.observation);
  assertNonPurchasableVariants(record, source.expected);
  assertNonPurchasableVariants(listItem, source.expected);
}

function assertModelReference(record, mapping) {
  const { asset, media } = mapping;
  if (!asset.publicUseAllowed) {
    ensure(!("model3d" in record.document), "private_model_reference_is_public");
    return;
  }
  const model = record.document.model3d;
  ensure(model && exactKeys(model, ["mediaId", "posterId", "alt"]) && model.mediaId === media.model.id &&
    model.posterId === media.poster.id && model.alt === media.model.altText, "public_model_reference_mismatch");
  ensure(!record.document.mediaIds?.includes(model.mediaId) && !record.document.mediaIds?.includes(model.posterId), "model_poster_duplicated_in_photo_gallery");
}

function assertMediaHeaders(response, id, extension, mimeType) {
  checkNoStoreAndSniff(response);
  ensure((response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() === mimeType, "media_mime_invalid");
  const disposition = response.headers.get("content-disposition") ?? "";
  ensure(disposition.toLowerCase().startsWith("inline;") && disposition === `inline; filename="${id}.${extension}"`, "media_download_disposition_invalid");
}

async function verifyPublicMedia(origin, media, { extension, mimeType, cap }) {
  const { response, value: bytes } = await request(origin, `/api/media/${media.id}`, { maxBytes: cap, binary: true });
  assertMediaHeaders(response, media.id, extension, mimeType);
  ensure(bytes.length === media.byteSize && bytes.length <= cap && sha256(bytes) === media.deliverySha256, "public_media_integrity_invalid");
  if (mimeType === "model/gltf-binary") {
    ensure(bytes.toString("ascii", 0, 4) === "glTF" && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length,
      "public_glb_container_invalid");
  } else {
    ensure(bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP", "public_poster_container_invalid");
  }
  return bytes.length;
}

async function run() {
  const origin = originFromEnvironment();
  const [manifest, modelLedger, catalogLedger] = await Promise.all([
    readJsonFile(MANIFEST_PATH), readJsonFile(MODEL_LEDGER_PATH), readJsonFile(CATALOG_LEDGER_PATH),
  ]);
  const { assets, sourcesBySlug } = validateInputs(manifest, modelLedger, catalogLedger);
  const catalogResponse = await request(origin, "/api/catalog?limit=48");
  const catalog = catalogResponse.value;
  ensure(Array.isArray(catalog?.items) && catalog.items.length === 42 && catalog.total === 42 && catalog.limit === 48,
    "catalog_source_product_count_invalid");
  ensure(new Set(catalog.items.map((item) => item?.slug)).size === 42 && new Set(catalog.items.map((item) => item?.id)).size === 42,
    "catalog_source_products_ambiguous");

  const listBySlug = new Map(catalog.items.map((item) => [item.slug, item]));
  const verifiedProducts = new Set();
  for (const [slug, source] of sourcesBySlug) {
    const listItem = listBySlug.get(slug);
    ensure(listItem && listItem.id === source.id, "catalog_source_product_missing");
    const { value: detailBody } = await request(origin, `/api/published/products/${encodeURIComponent(slug)}`, { maxBytes: 1024 * 1024 });
    const detail = detailBody?.record;
    assertPublicRecord(detail, listItem, source);
    ensure(!verifiedProducts.has(detail.id), "catalog_source_product_duplicate");
    verifiedProducts.add(detail.id);
    const model = assets.get(slug);
    if (model) {
      ensure(model.product.id === detail.id, "model_product_record_mismatch");
      assertModelReference(detail, model);
      assertModelReference(listItem, model);
    } else {
      ensure(!("model3d" in detail.document) && !("model3d" in listItem.document), "unexpected_public_model_reference");
    }
  }
  ensure(verifiedProducts.size === 42, "catalog_source_product_verification_incomplete");

  let publicModels = 0;
  let publicPosters = 0;
  let privateMediaNotFound = 0;
  for (const { asset, media } of assets.values()) {
    if (asset.publicUseAllowed) {
      await verifyPublicMedia(origin, media.model, { extension: "glb", mimeType: "model/gltf-binary", cap: MAX_MODEL_BYTES });
      const resize = await request(origin, `/api/media/${media.model.id}?w=960`, { expectedStatus: 400, maxBytes: 1024 });
      ensure(resize.response.status === 400, "model_resize_rejection_invalid");
      await verifyPublicMedia(origin, media.poster, { extension: "webp", mimeType: "image/webp", cap: MAX_POSTER_BYTES });
      publicModels++;
      publicPosters++;
    } else {
      for (const item of [media.model, media.poster]) {
        const hidden = await request(origin, `/api/media/${item.id}`, { expectedStatus: 404, maxBytes: 1024 });
        ensure(hidden.response.status === 404, "private_media_visible_to_anonymous_request");
        privateMediaNotFound++;
      }
    }
  }
  ensure(publicModels === 12 && publicPosters === 12 && privateMediaNotFound === 12, "model_media_reconciliation_incomplete");
  process.stdout.write(`${JSON.stringify({ catalogProducts: verifiedProducts.size, exactSourceObservations: verifiedProducts.size,
    nonPurchasableProducts: verifiedProducts.size, publicModels, publicPosters, privateMedia404: privateMediaNotFound })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    const code = error instanceof Error && /^[a-z0-9_]+$/u.test(error.message) ? error.message : "product_model_catalog_reconciliation_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
