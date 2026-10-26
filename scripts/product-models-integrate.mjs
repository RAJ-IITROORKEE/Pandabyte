import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClerkClient } from "@clerk/backend";
import { validateProductGlb, MAX_PRODUCT_GLB_BYTES } from "../lib/editorial/glb-validation.ts";
import { buildCatalogSourcePlan } from "./catalog-source-map.mjs";
import { PRIVATE_MODEL_SOURCE_IDS } from "./product-models-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_ROOT = path.join(ROOT, ".bootstrap", "product-models");
const MANIFEST_PATH = path.join(MODEL_ROOT, "manifest.json");
const IMPORT_LEDGER_PATH = path.join(ROOT, ".bootstrap", "catalog-import", "ledger.json");
const MODEL_LEDGER_PATH = path.join(MODEL_ROOT, "integration-ledger.json");
const APPLY_LOCK_PATH = path.join(MODEL_ROOT, "integration.lock");
const PROJECT_ID = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const PROJECT_HOST = "https://r2g8wzib.us-east.insforge.app";
const DEFAULT_ORIGIN = "http://localhost:3000";
const MAX_MODEL_BYTES = 4 * 1024 * 1024;
const MAX_POSTER_BYTES = 250 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function comparisonDocument(value) {
  ensure(value && typeof value === "object" && !Array.isArray(value), "product_document_invalid");
  const document = structuredClone(value);
  delete document.model3d;
  delete document.sourceReview;
  if (Array.isArray(document.variants)) {
    document.variants = document.variants.map((variant) => {
      const copy = { ...variant };
      delete copy.id;
      return copy;
    });
  }
  return document;
}

export function documentsMatchExceptModel3dAndStaffReview(draft, published) {
  return stable(comparisonDocument(draft)) === stable(comparisonDocument(published));
}

export function modelAltText(title) {
  return title.includes("NEO-6M")
    ? `${title} visual model of the photographed NEO-M8M assembly`
    : `${title} visual 3D model`;
}

function sameModelReference(value, expected) {
  return value && value.mediaId === expected.mediaId && value.posterId === expected.posterId && value.alt === expected.alt &&
    Object.keys(value).length === 3;
}

export function buildModelIntegrationPlan({ manifest, sourcePlan, importLedger }) {
  ensure(manifest?.schemaVersion === 1 && Array.isArray(manifest.assets), "model_manifest_invalid");
  ensure(sourcePlan?.sourceProductCount === 44 && sourcePlan.summary?.eligiblePotential === 42 &&
    sourcePlan.summary?.heldMissingSourceSku === 2 && sourcePlan.summary?.otherHeld === 0 && Array.isArray(sourcePlan.entries), "catalog_source_accounting_changed");
  ensure(importLedger?.schemaVersion === 1 && importLedger.projectId === PROJECT_ID && importLedger.products && typeof importLedger.products === "object", "catalog_ledger_target_mismatch");

  const candidates = sourcePlan.entries.filter((entry) => entry.disposition?.localCmsCandidate === true);
  ensure(candidates.length === 42 && new Set(candidates.map((entry) => entry.sourceIdentity?.sourceId)).size === 42, "catalog_candidate_mapping_invalid");
  const candidateBySource = new Map(candidates.map((entry) => [entry.sourceIdentity.sourceId, entry]));
  const ledgerKeys = Object.keys(importLedger.products);
  ensure(ledgerKeys.length === 42 && ledgerKeys.every((sourceId) => candidateBySource.has(sourceId)), "catalog_ledger_source_mapping_changed");
  const recordIds = new Set();
  for (const sourceId of candidateBySource.keys()) {
    const tracked = importLedger.products[sourceId];
    const source = candidateBySource.get(sourceId).sourceIdentity;
    ensure(tracked && UUID.test(tracked.id) && Number.isSafeInteger(tracked.version) && tracked.version >= 1 &&
      (tracked.publishedRevisionId === null || UUID.test(tracked.publishedRevisionId)), "catalog_ledger_record_invalid");
    ensure(!recordIds.has(tracked.id), "catalog_ledger_record_id_collision");
    recordIds.add(tracked.id);
    const provenance = tracked.provenance?.source;
    ensure(provenance?.sourceId === sourceId && provenance.title === source.title && provenance.slug === source.slug &&
      provenance.sourceSku === source.sourceSku, "catalog_ledger_provenance_conflict");
  }

  ensure(manifest.assets.length === 18 && new Set(manifest.assets.map((asset) => asset?.sourceId)).size === 18, "model_source_identity_ambiguous");
  const privateIds = manifest.assets.filter((asset) => asset?.publicUseAllowed === false).map((asset) => asset.sourceId);
  ensure(privateIds.length === 6 && privateIds.every((sourceId) => PRIVATE_MODEL_SOURCE_IDS.has(sourceId)) &&
    [...PRIVATE_MODEL_SOURCE_IDS].every((sourceId) => privateIds.includes(sourceId)), "model_redistribution_policy_changed");

  const rows = manifest.assets.map((asset) => {
    ensure(asset && typeof asset.sourceId === "string" && typeof asset.slug === "string" && typeof asset.title === "string" &&
      typeof asset.publicUseAllowed === "boolean" && asset.readiness && typeof asset.readiness === "object", "model_asset_invalid");
    const source = candidateBySource.get(asset.sourceId);
    const tracked = importLedger.products[asset.sourceId];
    ensure(source && tracked, "model_source_not_in_imported_catalog");
    ensure(source.sourceIdentity.slug === asset.slug && source.sourceIdentity.title === asset.title, "model_catalog_identity_conflict");
    ensure(asset.publicUseAllowed === !PRIVATE_MODEL_SOURCE_IDS.has(asset.sourceId), "model_redistribution_policy_changed");
    ensure(["passed", "awaiting-owner-review"].includes(asset.readiness.rootReview) && asset.readiness.deliveryCheck === "passed", "model_review_state_invalid");
    const publicEligible = asset.publicUseAllowed && asset.readiness.rootReview === "passed";
    return {
      sourceId: asset.sourceId,
      title: asset.title,
      slug: asset.slug,
      productId: tracked.id,
      sourceSku: source.sourceIdentity.sourceSku,
      publicEligible,
      publicUseAllowed: asset.publicUseAllowed,
      asset,
    };
  });
  ensure(new Set(rows.map((row) => row.productId)).size === 18, "model_product_mapping_ambiguous");
  ensure(rows.filter((row) => row.publicEligible).length === 12 && rows.filter((row) => !row.publicEligible).length === 6, "model_public_eligibility_changed");
  return rows;
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readModelFile(relativePath, maxBytes) {
  ensure(typeof relativePath === "string" && relativePath.length > 0 && !relativePath.includes("\0") && !relativePath.includes(":"), "model_asset_path_invalid");
  const parts = relativePath.replaceAll("\\", "/").split("/");
  ensure(!path.isAbsolute(relativePath) && !path.win32.isAbsolute(relativePath) && parts.every((part) => part && part !== "." && part !== ".."), "model_asset_path_unsafe");
  const target = path.resolve(ROOT, ...parts);
  ensure(within(MODEL_ROOT, target) && target !== MODEL_ROOT, "model_asset_path_outside_work_area");
  let cursor = ROOT;
  for (const part of path.relative(ROOT, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor);
    ensure(!stat.isSymbolicLink(), "model_asset_symlink_not_allowed");
  }
  const stat = await fs.stat(target);
  ensure(stat.isFile() && stat.size > 0 && stat.size <= maxBytes, "model_asset_size_invalid");
  const realTarget = await fs.realpath(target);
  ensure(within(MODEL_ROOT, realTarget), "model_asset_path_outside_work_area");
  return fs.readFile(realTarget);
}

async function prepareAssets(rows, manifest) {
  ensure(MAX_PRODUCT_GLB_BYTES === MAX_MODEL_BYTES, "model_glb_cap_changed");
  ensure(manifest.outputRoot === ".bootstrap/product-models", "model_output_root_changed");
  const prepared = new Map();
  for (const row of rows) {
    const asset = row.asset;
    ensure(asset.heldErrors?.length === 0 && asset.outputPaths?.glb && asset.outputPaths?.poster &&
      asset.outputHashes?.glb && asset.outputHashes?.poster, "model_asset_held_or_missing_output");
    const glb = await readModelFile(asset.outputPaths.glb, MAX_MODEL_BYTES);
    const poster = await readModelFile(asset.outputPaths.poster, MAX_POSTER_BYTES);
    ensure(sha256(glb) === asset.outputHashes.glb && sha256(poster) === asset.outputHashes.poster, "model_asset_hash_mismatch");
    const validated = await validateProductGlb(glb);
    ensure(validated && validated.sha256 === asset.outputHashes.glb && validated.triangles === asset.candidate?.glb?.triangles &&
      glb.length === asset.candidate?.glb?.bytes, "model_glb_validation_failed");

    const image = sharp(poster, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    ensure(metadata.format === "webp" && metadata.width && metadata.height && metadata.width <= 4096 && metadata.height <= 4096 &&
      metadata.width * metadata.height <= MAX_IMAGE_PIXELS && (metadata.pages ?? 1) === 1, "model_poster_invalid");
    const normalized = await image.rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    ensure(normalized.data.byteLength > 0 && normalized.data.byteLength <= MAX_POSTER_BYTES && normalized.info.width <= 4096 &&
      normalized.info.height <= 4096 && normalized.info.width * normalized.info.height <= MAX_IMAGE_PIXELS, "model_poster_normalization_invalid");
    ensure(poster.length === asset.candidate?.poster?.bytes, "model_poster_manifest_size_mismatch");
    prepared.set(row.sourceId, {
      model: { bytes: glb, sha256: validated.sha256, triangles: validated.triangles, deliverySha256: validated.sha256 },
      poster: { bytes: poster, sha256: sha256(poster), deliveryBytes: normalized.data, deliverySha256: sha256(normalized.data), width: normalized.info.width, height: normalized.info.height },
      alt: modelAltText(row.title),
    });
  }
  return prepared;
}

function parseMode(args) {
  if (args.length === 0) return "inspect";
  ensure(args.length === 1 && ["--inspect", "--plan", "--apply"].includes(args[0]), "use_inspect_plan_or_apply");
  return args[0].slice(2);
}

function resolveOrigin() {
  const origin = new URL(process.env.PRODUCT_MODELS_APP_ORIGIN ?? DEFAULT_ORIGIN);
  const port = Number(origin.port || 80);
  ensure(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) &&
    port >= 3000 && port <= 3999 && origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password,
  "development_origin_mismatch");
  return origin.origin;
}

async function createDevelopmentApi() {
  const config = JSON.parse(await fs.readFile(path.join(ROOT, ".insforge", "project.json"), "utf8"));
  ensure(config.project_id === PROJECT_ID && config.oss_host === PROJECT_HOST &&
    process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === config.oss_host && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "development_target_mismatch");
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  ensure((await clerk.instance.get()).id === "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI", "development_identity_mismatch");
  const owner = JSON.parse(await fs.readFile(path.join(ROOT, ".bootstrap", "owner-admin-subject.json"), "utf8"));
  ensure(typeof owner.userId === "string" && owner.userId.trim().length > 0 && owner.userId.length <= 128, "owner_identity_invalid");
  const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
  ensure(sessions.data.length > 0, "owner_active_session_required");
  const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
  const origin = resolveOrigin();
  let cachedToken;
  let mintedAt = 0;
  const api = async (url, { method = "GET", json, form, binary = false } = {}) => {
    if (!cachedToken || Date.now() - mintedAt > 25_000) {
      cachedToken = (await clerk.sessions.getToken(session.id)).jwt;
      mintedAt = Date.now();
    }
    const headers = { authorization: `Bearer ${cachedToken}`, origin };
    if (json !== undefined) headers["content-type"] = "application/json";
    let response;
    try {
      response = await fetch(new URL(url, origin), {
        method,
        headers,
        body: json === undefined ? form : JSON.stringify(json),
        redirect: "manual",
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new Error("admin_request_outcome_unknown");
    }
    ensure(response.ok, `admin_request_${response.status}`);
    if (binary) return Buffer.from(await response.arrayBuffer());
    try { return await response.json(); } catch { throw new Error("admin_response_invalid"); }
  };

  const access = await api("/api/admin/access");
  ensure(Array.isArray(access.capabilities) && ["catalog.edit", "media.manage", "content.publish", "staff.manage"].every((capability) => access.capabilities.includes(capability)), "owner_capability_required");
  const roles = await api("/api/admin/roles?limit=50&offset=0");
  ensure(roles.items?.some((role) => role.userId === owner.userId && role.role === "ADMIN" && role.protected), "protected_owner_required");
  return { api, owner, origin };
}

async function readJson(filePath, missingValue) {
  try {
    const stat = await fs.lstat(filePath);
    ensure(stat.isFile() && !stat.isSymbolicLink(), "local_input_file_invalid");
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  }
  catch (error) {
    if (error.code === "ENOENT" && missingValue !== undefined) return structuredClone(missingValue);
    throw error;
  }
}

async function verifyWorkDirectory() {
  for (const directory of [path.join(ROOT, ".bootstrap"), MODEL_ROOT]) {
    const stat = await fs.lstat(directory);
    ensure(stat.isDirectory() && !stat.isSymbolicLink(), "model_work_directory_invalid");
    ensure(within(ROOT, await fs.realpath(directory)), "model_work_directory_outside_repo");
  }
}

async function loadInputs() {
  const manifest = await readJson(MANIFEST_PATH);
  const importLedger = await readJson(IMPORT_LEDGER_PATH);
  const sourcePlan = buildCatalogSourcePlan();
  const rows = buildModelIntegrationPlan({ manifest, sourcePlan, importLedger });
  return { manifest, importLedger, rows, sourcePlan };
}

function summarize({ manifest, rows }) {
  return {
    scope: "local-development-only",
    sourceProducts: 44,
    importedProducts: 42,
    modelAssets: rows.length,
    publicCandidates: rows.filter((row) => row.publicEligible).length,
    privateDraftCandidates: rows.filter((row) => !row.publicEligible).length,
    glbOutputs: manifest.assets.filter((asset) => typeof asset.outputPaths?.glb === "string").length,
    posterOutputs: manifest.assets.filter((asset) => typeof asset.outputPaths?.poster === "string").length,
    heldModels: manifest.assets.filter((asset) => Array.isArray(asset.heldErrors) && asset.heldErrors.length > 0).length,
  };
}

async function loadIntegrationLedger() {
  const value = await readJson(MODEL_LEDGER_PATH, { schemaVersion: 1, projectId: PROJECT_ID, assets: {}, products: {}, pending: {} });
  ensure(value.schemaVersion === 1 && value.projectId === PROJECT_ID && value.assets && value.products && value.pending, "model_ledger_target_mismatch");
  return value;
}

async function saveLedger(ledger) {
  const tempPath = `${MODEL_LEDGER_PATH}.tmp`;
  let handle;
  try {
    try {
      const current = await fs.lstat(MODEL_LEDGER_PATH);
      ensure(current.isFile() && !current.isSymbolicLink(), "model_ledger_path_invalid");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(JSON.stringify(ledger, null, 2));
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, MODEL_LEDGER_PATH);
  } catch {
    if (handle) await handle.close().catch(() => {});
    throw new Error("model_ledger_write_failed");
  }
}

async function acquireLock() {
  try {
    const handle = await fs.open(APPLY_LOCK_PATH, "wx", 0o600);
    await handle.writeFile(new Date().toISOString());
    return handle;
  } catch {
    throw new Error("model_apply_lock_exists_or_unavailable");
  }
}

async function listMediaByFilename(api, filename) {
  const result = await api(`/api/admin/media?q=${encodeURIComponent(filename)}&limit=50&offset=0`);
  ensure(Array.isArray(result.items) && Number.isSafeInteger(result.total) && result.total >= 0 && result.total <= 50, "media_search_unbounded");
  return result.items.filter((item) => item.filename === filename);
}

function mediaExpectations(row, prepared, kind) {
  const source = "Authorized product-model gallery derivative";
  const value = prepared[kind];
  return {
    filename: `${kind === "model" ? "model" : "poster"}-${sha256(Buffer.from(row.sourceId)).slice(0, 20)}.${kind === "model" ? "glb" : "webp"}`,
    mimeType: kind === "model" ? "model/gltf-binary" : "image/webp",
    byteSize: kind === "model" ? value.bytes.length : value.deliveryBytes.length,
    altText: prepared.alt,
    source,
    publicUseAllowed: kind === "model" ? row.publicUseAllowed : null,
    triangles: kind === "model" ? value.triangles : null,
    deliverySha256: value.deliverySha256,
  };
}

function mediaMatches(media, expected, id) {
  return media && UUID.test(media.id) && (!id || media.id === id) && Number.isSafeInteger(media.version) && media.version >= 1 &&
    typeof media.published === "boolean" && media.filename === expected.filename && media.mimeType === expected.mimeType &&
    media.byteSize === expected.byteSize && media.altText === expected.altText && media.source === expected.source &&
    media.archived === false && (expected.mimeType === "model/gltf-binary"
      ? media.publicUseAllowed === expected.publicUseAllowed && media.triangles === expected.triangles
      : media.publicUseAllowed === null && media.width > 0 && media.height > 0);
}

function storedMedia(media, expected) {
  return {
    id: media.id,
    filename: expected.filename,
    mimeType: expected.mimeType,
    byteSize: expected.byteSize,
    altText: expected.altText,
    source: expected.source,
    version: media.version,
    published: media.published,
    publicUseAllowed: expected.publicUseAllowed,
    triangles: expected.triangles,
    deliverySha256: expected.deliverySha256,
  };
}

async function verifyMediaDelivery(api, media, expected) {
  ensure(mediaMatches(media, expected), "media_metadata_changed_requires_review");
  const delivered = await api(`/api/media/${media.id}`, { binary: true });
  ensure(delivered.length === expected.byteSize && sha256(delivered) === expected.deliverySha256, "media_delivery_hash_mismatch");
}

async function uploadForm(api, row, prepared, kind, expected) {
  const asset = prepared[kind];
  const sourceBytes = kind === "model" ? asset.bytes : asset.bytes;
  const form = new FormData();
  form.set("file", new File([sourceBytes], expected.filename, { type: expected.mimeType }));
  form.set("altText", expected.altText);
  form.set("source", expected.source);
  if (kind === "model") form.set("publicUseAllowed", String(row.publicUseAllowed));
  const response = await api("/api/admin/media", { method: "POST", form });
  ensure(response.media?.id && UUID.test(response.media.id), "media_upload_response_invalid");
  return response.media;
}

async function ensureMedia(api, row, prepared, kind, ledger, apply) {
  const expected = mediaExpectations(row, prepared, kind);
  const key = `${row.sourceId}:${kind}`;
  const tracked = ledger.assets[row.sourceId]?.[kind];
  const pending = ledger.pending[key];
  const matches = await listMediaByFilename(api, expected.filename);
  ensure(matches.length <= 1, "media_filename_ambiguous");
  let media = matches[0] ?? null;

  if (tracked) {
    ensure(tracked.filename === expected.filename && mediaMatches(media, expected, tracked.id), "tracked_media_changed_requires_review");
    const expectedNextVersion = tracked.version + (row.publicEligible && !tracked.published && media.published ? 1 : 0);
    ensure(media.version === expectedNextVersion, "tracked_media_version_conflict");
  } else if (pending) {
    ensure(pending.filename === expected.filename && pending.deliverySha256 === expected.deliverySha256, "pending_media_identity_conflict");
    ensure(media, "pending_upload_requires_manual_reconciliation");
  } else if (media) {
    ensure(mediaMatches(media, expected), "media_filename_collision");
  } else if (!apply) {
    return null;
  } else {
    ledger.pending[key] = { filename: expected.filename, deliverySha256: expected.deliverySha256, startedAt: new Date().toISOString() };
    await saveLedger(ledger);
    try {
      media = await uploadForm(api, row, prepared, kind, expected);
    } catch {
      throw new Error("media_upload_outcome_requires_reconciliation");
    }
    const afterUpload = await listMediaByFilename(api, expected.filename);
    ensure(afterUpload.length === 1 && afterUpload[0].id === media.id && mediaMatches(afterUpload[0], expected, media.id), "media_upload_registration_unverified");
    media = afterUpload[0];
    await verifyMediaDelivery(api, media, expected);
    ledger.assets[row.sourceId] ??= {};
    ledger.assets[row.sourceId][kind] = storedMedia(media, expected);
    delete ledger.pending[key];
    await saveLedger(ledger);
  }

  if (!media) return null;
  await verifyMediaDelivery(api, media, expected);
  ledger.assets[row.sourceId] ??= {};
  if (!tracked && apply) {
    ledger.assets[row.sourceId][kind] = storedMedia(media, expected);
    delete ledger.pending[key];
    await saveLedger(ledger);
  }

  const shouldPublish = row.publicEligible;
  if (kind === "model" && media.published && !row.publicUseAllowed) throw new Error("private_model_media_is_published");
  if (kind === "poster" && media.published && !shouldPublish) throw new Error("private_poster_media_is_published");
  if (shouldPublish && !media.published && apply) {
    const currentVersion = ledger.assets[row.sourceId][kind].version;
    ensure(media.version === currentVersion, "media_version_conflict");
    const body = { expectedVersion: media.version, altText: expected.altText, source: expected.source, published: true };
    if (kind === "model") body.publicUseAllowed = true;
    let response;
    try { response = await api(`/api/admin/media/${media.id}`, { method: "PATCH", json: body }); }
    catch { throw new Error("media_publish_outcome_requires_reconciliation"); }
    media = response.media;
    ensure(mediaMatches(media, expected, ledger.assets[row.sourceId][kind].id) && media.published === true, "media_publish_response_invalid");
    await verifyMediaDelivery(api, media, expected);
    ledger.assets[row.sourceId][kind] = storedMedia(media, expected);
    await saveLedger(ledger);
  } else if (shouldPublish && media.published) {
    ledger.assets[row.sourceId][kind] = storedMedia(media, expected);
    delete ledger.pending[key];
    if (apply) await saveLedger(ledger);
  }
  const current = ledger.assets[row.sourceId]?.[kind];
  return current ?? storedMedia(media, expected);
}

async function getAdminProduct(api, row) {
  const { record } = await api(`/api/admin/products/${row.productId}`);
  ensure(record?.id === row.productId && record.kind === "product" && record.title === row.title && record.slug === row.slug &&
    record.document && Array.isArray(record.document.variants) && record.document.variants.some((variant) => variant.sku === row.sourceSku) &&
    record.archived === false, "product_mapping_changed_requires_review");
  return record;
}

async function getPublishedProduct(api, row, expectedRevisionId) {
  const { record } = await api(`/api/published/products/${encodeURIComponent(row.slug)}`);
  ensure(record?.id === row.productId && record.slug === row.slug && record.title === row.title &&
    (!expectedRevisionId || record.revisionId === expectedRevisionId), "published_product_mapping_changed");
  return record;
}

async function verifyAllSourceObservations(api, sourcePlan, importLedger) {
  const candidates = sourcePlan.entries.filter((entry) => entry.disposition?.localCmsCandidate === true);
  ensure(candidates.length === 42, "catalog_source_accounting_changed");
  for (const source of candidates) {
    const sourceId = source.sourceIdentity.sourceId;
    const tracked = importLedger.products[sourceId];
    ensure(tracked?.id, "catalog_ledger_record_missing");
    const row = { sourceId, productId: tracked.id, title: source.sourceIdentity.title, slug: source.sourceIdentity.slug,
      sourceSku: source.sourceIdentity.sourceSku };
    ensure(source.publicSourceObservation && typeof source.publicSourceObservation.priceText === "string", "catalog_source_observation_missing");
    const current = await getAdminProduct(api, row);
    ensure(current.document.variants.length === 1 && current.document.variants[0].sku === row.sourceSku &&
      stable(current.document.sourceObservation) === stable(source.publicSourceObservation), "catalog_source_observation_changed");
    if (current.publishedRevisionId) {
      const published = await getPublishedProduct(api, row, current.publishedRevisionId);
      ensure(published.document.variants.length === 1 && published.document.variants[0].sku === row.sourceSku &&
        stable(published.document.sourceObservation) === stable(source.publicSourceObservation), "published_source_observation_changed");
    }
  }
  return candidates.length;
}

async function validateProductState(api, row, media, expected, baseline) {
  const current = await getAdminProduct(api, row);
  const existingLedger = baseline.products[row.sourceId];
  const modelReference = { mediaId: media.model.id, posterId: media.poster.id, alt: expected.alt };
  ensure(!current.document.model3d || sameModelReference(current.document.model3d, modelReference), "existing_model_reference_conflict");
  if (existingLedger) {
    ensure(existingLedger.id === row.productId && existingLedger.mediaId === media.model.id && existingLedger.posterId === media.poster.id, "product_ledger_reference_conflict");
  }
  if (current.publishedRevisionId) {
    const published = await getPublishedProduct(api, row, current.publishedRevisionId);
    ensure(documentsMatchExceptModel3dAndStaffReview(current.document, published.document), "unrelated_product_draft_changes");
    ensure(!published.document.model3d || (sameModelReference(published.document.model3d, modelReference) &&
      sameModelReference(current.document.model3d, modelReference)), "published_model_reference_conflict");
    if (!row.publicEligible) {
      ensure(existingLedger?.initialPublishedRevisionId === undefined || existingLedger.initialPublishedRevisionId === current.publishedRevisionId,
        "private_product_publication_changed");
    }
    return { current, published, modelReference };
  }
  ensure(!row.publicEligible, "public_model_product_not_published");
  ensure(!current.document.model3d || sameModelReference(current.document.model3d, modelReference), "unpublished_product_model_reference_conflict");
  return { current, published: null, modelReference };
}

async function inspectProductState(api, row, ledger) {
  const current = await getAdminProduct(api, row);
  const modelMedia = ledger.assets[row.sourceId]?.model;
  const posterMedia = ledger.assets[row.sourceId]?.poster;
  const productLedger = ledger.products[row.sourceId];
  const expected = modelMedia && posterMedia ? {
    mediaId: modelMedia.id,
    posterId: posterMedia.id,
    alt: modelMedia.altText,
  } : null;
  if (current.document.model3d) {
    ensure(expected && sameModelReference(current.document.model3d, expected), "existing_model_reference_conflict");
    ensure(productLedger?.mediaId === expected.mediaId && productLedger?.posterId === expected.posterId, "untracked_product_model_reference");
  }
  if (productLedger) ensure(productLedger.id === row.productId, "product_ledger_mapping_conflict");
  if (current.publishedRevisionId) {
    const published = await getPublishedProduct(api, row, current.publishedRevisionId);
    ensure(documentsMatchExceptModel3dAndStaffReview(current.document, published.document), "unrelated_product_draft_changes");
    if (published.document.model3d) ensure(expected && sameModelReference(published.document.model3d, expected) &&
      sameModelReference(current.document.model3d, expected), "published_model_reference_conflict");
    if (!row.publicEligible && productLedger) ensure(productLedger.initialPublishedRevisionId === current.publishedRevisionId, "private_product_publication_changed");
    return { current, published };
  }
  ensure(!row.publicEligible, "public_model_product_not_published");
  return { current, published: null };
}

async function attachProduct(api, row, expected, modelReference, ledger, apply, state) {
  const existing = state.current;
  const old = ledger.products[row.sourceId];
  const pending = ledger.pending[`product:${row.sourceId}`];
  if (old && old.initialPublishedRevisionId !== existing.publishedRevisionId && !row.publicEligible) {
    throw new Error("private_product_publication_changed");
  }
  const documentFingerprint = sha256(Buffer.from(stable(comparisonDocument(existing.document))));
  if (pending) {
    ensure(["attach", "publish"].includes(pending.phase) && pending.fingerprint === documentFingerprint, "product_pending_state_conflict");
    if (pending.phase === "attach") {
      ensure(pending.basePublishedRevisionId === existing.publishedRevisionId &&
        existing.version === pending.expectedVersion + (sameModelReference(existing.document.model3d, modelReference) ? 1 : 0),
      "product_update_outcome_requires_reconciliation");
    } else if (!row.publicEligible || !sameModelReference(existing.document.model3d, modelReference)) {
      throw new Error("product_publish_outcome_requires_reconciliation");
    }
  }
  if (sameModelReference(existing.document.model3d, modelReference)) {
    if (row.publicEligible && !sameModelReference(state.published?.document.model3d, modelReference)) {
      ensure(apply, "public_product_model_not_published_in_read_only_plan");
      ensure(pending, "product_model_publish_requires_reconciliation");
      ensure(!pending || pending.basePublishedRevisionId === existing.publishedRevisionId, "product_publish_revision_conflict");
      ledger.pending[`product:${row.sourceId}`] = { phase: "publish", fingerprint: documentFingerprint, expectedVersion: existing.version, basePublishedRevisionId: existing.publishedRevisionId };
      await saveLedger(ledger);
      let publishedCurrent = await getPublishedProduct(api, row, existing.publishedRevisionId);
      ensure(documentsMatchExceptModel3dAndStaffReview(existing.document, publishedCurrent.document), "unrelated_product_draft_changes");
      let result;
      try { result = await api(`/api/admin/products/${row.productId}/publish`, { method: "POST", json: { expectedVersion: existing.version } }); }
      catch { throw new Error("product_publish_outcome_requires_reconciliation"); }
      const updated = result.record;
      ensure(updated?.publishedRevisionId && updated.publishedRevisionId !== existing.publishedRevisionId, "product_publish_response_invalid");
      publishedCurrent = await getPublishedProduct(api, row, updated.publishedRevisionId);
      ensure(sameModelReference(publishedCurrent.document.model3d, modelReference) &&
        documentsMatchExceptModel3dAndStaffReview(updated.document, publishedCurrent.document), "published_product_verification_failed");
      ledger.products[row.sourceId] = { id: row.productId, mediaId: modelReference.mediaId, posterId: modelReference.posterId,
        version: updated.version, initialPublishedRevisionId: updated.publishedRevisionId, state: "published" };
      delete ledger.pending[`product:${row.sourceId}`];
      await saveLedger(ledger);
    } else {
      ledger.products[row.sourceId] = { id: row.productId, mediaId: modelReference.mediaId, posterId: modelReference.posterId,
        version: existing.version, initialPublishedRevisionId: existing.publishedRevisionId, state: row.publicEligible ? "published" : "draft" };
      delete ledger.pending[`product:${row.sourceId}`];
      await saveLedger(ledger);
    }
    return;
  }

  ensure(apply, "product_model_not_attached_in_read_only_plan");
  ensure(!existing.document.model3d, "existing_model_reference_conflict");
  ensure(!pending || (pending.phase === "attach" && pending.expectedVersion === existing.version &&
    pending.basePublishedRevisionId === existing.publishedRevisionId), "product_pending_state_conflict");
  if (row.publicEligible) {
    ensure(state.published && state.published.revisionId === existing.publishedRevisionId &&
      documentsMatchExceptModel3dAndStaffReview(existing.document, state.published.document), "unrelated_product_draft_changes");
  }
  const candidate = { ...existing.document, model3d: modelReference };
  const fingerprint = documentFingerprint;
  ledger.pending[`product:${row.sourceId}`] = { phase: "attach", fingerprint, expectedVersion: existing.version, basePublishedRevisionId: existing.publishedRevisionId };
  await saveLedger(ledger);
  let result;
  try {
    result = await api(`/api/admin/products/${row.productId}`, { method: "PATCH", json: { expectedVersion: existing.version, document: candidate } });
  } catch {
    throw new Error("product_update_outcome_requires_reconciliation");
  }
  let updated = result.record;
  ensure(updated?.version === existing.version + 1 && sameModelReference(updated.document?.model3d, modelReference), "product_update_response_invalid");
  if (row.publicEligible) {
    const stillPublished = await getPublishedProduct(api, row, existing.publishedRevisionId);
    ensure(documentsMatchExceptModel3dAndStaffReview(updated.document, stillPublished.document), "unrelated_product_draft_changes");
    ledger.pending[`product:${row.sourceId}`] = { phase: "publish", fingerprint, expectedVersion: updated.version, basePublishedRevisionId: existing.publishedRevisionId };
    await saveLedger(ledger);
    try { result = await api(`/api/admin/products/${row.productId}/publish`, { method: "POST", json: { expectedVersion: updated.version } }); }
    catch { throw new Error("product_publish_outcome_requires_reconciliation"); }
    updated = result.record;
    ensure(updated?.publishedRevisionId && updated.publishedRevisionId !== existing.publishedRevisionId, "product_publish_response_invalid");
    const published = await getPublishedProduct(api, row, updated.publishedRevisionId);
    ensure(sameModelReference(published.document.model3d, modelReference) &&
      documentsMatchExceptModel3dAndStaffReview(updated.document, published.document), "published_product_verification_failed");
  } else {
    const afterUpdate = await getAdminProduct(api, row);
    ensure(afterUpdate.version === updated.version && sameModelReference(afterUpdate.document.model3d, modelReference) &&
      afterUpdate.publishedRevisionId === existing.publishedRevisionId, "private_draft_attachment_verification_failed");
    updated = afterUpdate;
  }
  ledger.products[row.sourceId] = { id: row.productId, mediaId: modelReference.mediaId, posterId: modelReference.posterId,
    version: updated.version, initialPublishedRevisionId: updated.publishedRevisionId, state: row.publicEligible ? "published" : "draft" };
  delete ledger.pending[`product:${row.sourceId}`];
  await saveLedger(ledger);
}

async function run() {
  const mode = parseMode(process.argv.slice(2));
  await verifyWorkDirectory();
  const inputs = await loadInputs();
  const summary = summarize(inputs);
  if (mode === "inspect") {
    process.stdout.write(`${JSON.stringify({ ...summary, mode: "inspect" })}\n`);
    return;
  }

  const prepared = await prepareAssets(inputs.rows, inputs.manifest);
  const { api, origin } = await createDevelopmentApi();
  const ledger = await loadIntegrationLedger();
  const verifiedSourceProducts = await verifyAllSourceObservations(api, inputs.sourcePlan, inputs.importLedger);
  let knownMedia = 0;
  for (const row of inputs.rows) {
    const productState = await inspectProductState(api, row, ledger);
    const mediaMappings = [];
    for (const kind of ["model", "poster"]) {
      const expected = mediaExpectations(row, prepared.get(row.sourceId), kind);
      const tracked = ledger.assets[row.sourceId]?.[kind];
      const pending = ledger.pending[`${row.sourceId}:${kind}`];
      const matches = await listMediaByFilename(api, expected.filename);
      ensure(matches.length <= 1, "media_filename_ambiguous");
      if (tracked) {
        ensure(mediaMatches(matches[0], expected, tracked.id), "tracked_media_changed_requires_review");
        const expectedNextVersion = tracked.version + (row.publicEligible && !tracked.published && matches[0].published ? 1 : 0);
        ensure(matches[0].version === expectedNextVersion, "tracked_media_version_conflict");
      } else if (pending) ensure(pending.filename === expected.filename && pending.deliverySha256 === expected.deliverySha256 && matches.length === 1, "pending_upload_requires_manual_reconciliation");
      else if (matches.length === 1) ensure(mediaMatches(matches[0], expected), "media_filename_collision");
      if (matches.length === 1) {
        await verifyMediaDelivery(api, matches[0], expected);
        knownMedia++;
      }
      mediaMappings.push(matches[0] ?? null);
    }
    if (productState.current.document.model3d) ensure(ledger.products[row.sourceId], "untracked_product_model_reference");
    if (mode === "plan" && mediaMappings.every(Boolean)) {
      const media = {
        model: storedMedia(mediaMappings[0], mediaExpectations(row, prepared.get(row.sourceId), "model")),
        poster: storedMedia(mediaMappings[1], mediaExpectations(row, prepared.get(row.sourceId), "poster")),
      };
      await validateProductState(api, row, media, prepared.get(row.sourceId), ledger);
    }
  }
  if (mode === "plan") {
    process.stdout.write(`${JSON.stringify({ ...summary, mode, origin, verifiedSourceProducts, mediaAlreadyMapped: knownMedia })}\n`);
    return;
  }

  const lock = await acquireLock();
  try {
    for (const row of inputs.rows) {
      const model = await ensureMedia(api, row, prepared.get(row.sourceId), "model", ledger, true);
      const poster = await ensureMedia(api, row, prepared.get(row.sourceId), "poster", ledger, true);
      ensure(model && poster, "media_mapping_required");
      const current = await validateProductState(api, row, { model, poster }, prepared.get(row.sourceId), ledger);
      await attachProduct(api, row, prepared.get(row.sourceId), { mediaId: model.id, posterId: poster.id, alt: prepared.get(row.sourceId).alt }, ledger, true, current);
    }
    process.stdout.write(`${JSON.stringify({ ...summary, mode, verifiedSourceProducts, integrated: inputs.rows.length, publicPublished: 12, privateDraftOnly: 6 })}\n`);
  } finally {
    await lock.close();
    await fs.unlink(APPLY_LOCK_PATH).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    const code = error instanceof Error && /^[a-z0-9_]+$/u.test(error.message) ? error.message : "product_models_integration_stopped_safely";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
