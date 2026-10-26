import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { appRequest, preflight, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "admin-product-integration-fixtures.json");
const previewPath = path.join(projectRoot, ".bootstrap", "admin-products", "preview.json");
const mediaPath = path.join(projectRoot, ".bootstrap", "admin-products", "browser-media.json");
const evidencePath = path.join(projectRoot, ".bootstrap", "admin-products", "api-evidence.json");
const mediaBucket = "editorial-media";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CleanupFailure extends Error {
  constructor(label) { super(label); this.label = label; }
}

const fail = (condition, label) => { if (!condition) throw new CleanupFailure(label); };
const rpc = (client, name, args) => client.database.schema("public").rpc(name, args);
const table = (client, name) => client.database.schema("public").from(name);

function collectDocumentMediaIds(document) {
  const ids = new Set();
  if (Array.isArray(document?.mediaIds)) document.mediaIds.forEach((id) => ids.add(id));
  if (Array.isArray(document?.blocks)) {
    for (const block of document.blocks) if (block?.type === "image" && typeof block.mediaId === "string") ids.add(block.mediaId);
  }
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "image" && typeof node.attrs?.mediaId === "string") ids.add(node.attrs.mediaId);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(document?.richContent);
  if (typeof document?.documentMediaId === "string") ids.add(document.documentMediaId);
  if (typeof document?.model3d?.mediaId === "string") ids.add(document.model3d.mediaId);
  if (typeof document?.model3d?.posterId === "string") ids.add(document.model3d.posterId);
  return ids;
}

async function readState(mode) {
  let fixtures = null, preview = null, marker;
  try { marker = JSON.parse(await readFile(mediaPath, "utf8")); }
  catch { throw new CleanupFailure("browser_media_fixture_marker_unavailable"); }
  try { fixtures = JSON.parse(await readFile(fixturePath, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw new CleanupFailure("browser_media_fixture_ledger_unavailable"); }
  try { preview = JSON.parse(await readFile(previewPath, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw new CleanupFailure("browser_media_preview_marker_unavailable"); }
  fail(Object.keys(marker).every((key) => ["runId", "productId", "filename", "media", "verification"].includes(key)),
    "browser_media_marker_has_unknown_fields");
  fail(uuid.test(marker.runId ?? "") && uuid.test(marker.productId ?? "") && Array.isArray(marker.media) && marker.media.length === 2,
    "browser_media_marker_invalid");
  fail(marker.filename === `${marker.runId}-browser.webp` &&
    marker.media[0]?.alt === `Disposable browser fixture ${marker.runId}` &&
    marker.media[1]?.alt === `Disposable inline fixture ${marker.runId}` &&
    marker.media.every((item) => uuid.test(item.id ?? "")) && new Set(marker.media.map((item) => item.id)).size === 2,
  "browser_media_marker_scope_invalid");
  if (mode === "--inspect") {
    fail(fixtures?.runId === marker.runId && preview?.runId === marker.runId && preview?.productId === marker.productId,
      "browser_media_fixture_run_mismatch");
    fail(Array.isArray(fixtures.records) && fixtures.records.some((record) =>
      record.id === marker.productId && record.kind === "product" && record.module === "products"),
    "browser_product_not_in_fixture_ledger");
  } else if (fixtures) {
    fail(fixtures.runId === marker.runId && Array.isArray(fixtures.users) &&
      fixtures.users.some((user) => user.role === "staff" && user.runId === marker.runId),
    "browser_media_cleanup_fixture_ledger_mismatch");
  }
  const staff = fixtures?.users?.find((user) => user.role === "staff" && user.runId === fixtures.runId) ?? null;
  if (mode === "--inspect") fail(staff?.userId && staff.sessionId, "browser_fixture_staff_missing");
  if (mode === "--cleanup") {
    fail(Array.isArray(marker.verification?.images) && marker.verification.images.length === 2 &&
      marker.verification.fixtureProductOwnerVerified === true && marker.verification.fixtureLatestUpdaterVerified === true &&
      Array.isArray(marker.verification.fixtureRecordIds) && marker.verification.fixtureRecordIds.length === 2 &&
      typeof marker.verification.fixtureStaffId === "string" && /^user_[A-Za-z0-9_-]{1,96}$/.test(marker.verification.fixtureStaffId) &&
      uuid.test(marker.verification.docxMediaId ?? ""),
    "browser_media_verified_inspection_required");
  }
  return { fixtures, preview, marker, staff };
}

async function inspectExpectedImage(sourcePath, media) {
  const source = await readFile(sourcePath).catch(() => { throw new CleanupFailure("browser_media_source_fixture_missing"); });
  let expected;
  try {
    expected = await sharp(source, { limitInputPixels: 20000000, animated: false, failOn: "error" })
      .rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new CleanupFailure("browser_media_source_fixture_invalid");
  }
  const key = `assets/${media.id}.webp`;
  const result = await table(media.client, "cms_media").select(
    "id,object_key,filename,mime_type,byte_size,width,height,alt_text,created_by,published,archived,version",
  ).eq("id", media.id).limit(2);
  fail(!result.error && Array.isArray(result.data) && result.data.length === 1, "browser_media_metadata_lookup_failed");
  const row = result.data[0];
  fail(row.id === media.id && row.object_key === key && row.filename === media.filename && row.alt_text === media.alt &&
    row.mime_type === "image/webp" && row.published === false && row.archived === false &&
    Number.isSafeInteger(row.byte_size) && row.byte_size === expected.data.byteLength &&
    row.width === expected.info.width && row.height === expected.info.height,
  "browser_media_metadata_mismatch");

  const listed = await media.client.storage.from(mediaBucket).list({ prefix: key, limit: 10 });
  fail(!listed.error && Array.isArray(listed.data?.data), "browser_media_storage_lookup_failed");
  const matches = listed.data.data.filter((object) => object.key === key);
  fail(matches.length === 1 && matches[0].bucket === mediaBucket && matches[0].uploaded_by === row.created_by,
    "browser_media_storage_actor_mismatch");

  const download = await media.client.storage.from(mediaBucket).download(key);
  fail(!download.error && download.data, "browser_media_storage_download_failed");
  const bytes = Buffer.from(await download.data.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const expectedHash = createHash("sha256").update(expected.data).digest("hex");
  let metadata;
  try { metadata = await sharp(bytes, { limitInputPixels: 20000000, animated: false, failOn: "error" }).metadata(); }
  catch { throw new CleanupFailure("browser_media_stored_image_invalid"); }
  fail(bytes.byteLength === row.byte_size && bytes.equals(expected.data) && hash === expectedHash &&
    metadata.format === "webp" && metadata.width === row.width && metadata.height === row.height && (metadata.pages ?? 1) === 1,
  "browser_media_original_bytes_mismatch");
  return { id: media.id, key, filename: row.filename, alt: row.alt_text, byteSize: row.byte_size, version: row.version,
    width: row.width, height: row.height, sha256: hash, metadataPrivate: row.published === false && row.archived === false,
    actorId: row.created_by, storageUploaderMatchesMediaCreator: true };
}

async function readReferences(client, productId, runId) {
  const recordResult = await table(client, "cms_records").select(
    "id,kind,created_by,updated_by,draft,published_revision_id,draft_source_revision_id,archived_at",
  ).eq("id", productId).limit(2);
  fail(!recordResult.error && Array.isArray(recordResult.data) && recordResult.data.length === 1,
    "browser_product_record_lookup_failed");
  const record = recordResult.data[0];
  fail(record.kind === "product" && record.draft?.title?.startsWith(`Phase3 ${runId} `) &&
    record.published_revision_id === null && record.archived_at === null,
  "browser_product_not_unpublished_fixture");
  const revisionsResult = await table(client, "cms_revisions").select("id,record_id,document")
    .eq("record_id", productId).limit(100);
  fail(!revisionsResult.error && Array.isArray(revisionsResult.data), "browser_product_revision_lookup_failed");
  const revisions = revisionsResult.data;
  fail(revisions.every((revision) => revision.record_id === productId), "browser_product_revision_scope_invalid");
  return { record, revisions };
}

async function assertFixtureOnlyReferences(client, marker, record, revisions) {
  const docs = [record.draft, ...revisions.map((revision) => revision.document)];
  const draftGallery = new Set(Array.isArray(record.draft?.mediaIds) ? record.draft.mediaIds : []);
  const richIds = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "image" && typeof node.attrs?.mediaId === "string") richIds.add(node.attrs.mediaId);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(record.draft?.richContent);
  const galleryId = marker.media[0].id, inlineId = marker.media[1].id;
  fail(draftGallery.has(galleryId) && richIds.has(inlineId), "browser_media_fixture_reference_missing");
  for (const id of [galleryId, inlineId]) {
    const references = await rpc(client, "media_referenced", { p_id: id, p_live_only: false });
    fail(!references.error && references.data === true, "browser_media_expected_reference_missing");
    fail(docs.some((document) => collectDocumentMediaIds(document).has(id)), "browser_media_reference_not_fixture_scoped");
  }
  return { gallery: true, inline: true, records: 1, revisions: revisions.length };
}

async function inspect(context, state) {
  await verifyFixtureOwnership(context.clerk, state.staff);
  const { record, revisions } = await readReferences(context.admin, state.marker.productId, state.marker.runId);
  fail(record.created_by === state.staff.userId, "browser_product_fixture_owner_mismatch");
  const configured = await table(context.admin, "cms_media").select("id,filename")
    .eq("filename", state.marker.filename).limit(5);
  fail(!configured.error && Array.isArray(configured.data) && configured.data.length === 2 &&
    configured.data.every((row) => state.marker.media.some((item) => item.id === row.id)),
  "browser_media_run_filename_not_unique");

  const sourcePath = path.join(projectRoot, ".bootstrap", "admin-products", `${state.marker.runId}-browser.png`);
  const images = [];
  for (const item of state.marker.media) {
    const inspected = await inspectExpectedImage(sourcePath, { ...item, filename: state.marker.filename, client: context.admin });
    fail(inspected.id === item.id, "browser_media_inspection_scope_changed");
    fail(inspected.actorId === record.updated_by, "browser_media_actor_not_product_editor");
    images.push({ ...inspected, uploaderMatchesFixtureLatestUpdater: true });
  }
  const references = await assertFixtureOnlyReferences(context.admin, state.marker, record, revisions);
  const evidence = {
    runId: state.marker.runId,
    status: "browser_verified_cleanup_pending",
    counts: {
      adminProductUnitTestCases: 3,
      fixtureProductRecordsCreated: 2,
      initialPriceRowsWritten: 2,
      atomicPriceRollbackAttempts: 1,
      docxUploads: 1,
      ownerSyntheticWebpUploads: 2,
      publishedFixtureRecords: 0,
      publishedFixtureMedia: 0,
      richTextBrowserFeatures: 3,
    },
    checked: {
      strictTableQueryAndScopedPriceRead: true,
      staleAtomicPriceWriteRolledBackProduct: true,
      customerProductAndPriceAccessDenied: true,
      sourceObservationPricesMaskedAndWriteRejected: true,
      invalidRichContentMissingMediaAndGalleryOverFiveRejected: true,
      sqlInvalidPortAndMissingRichRootRejected: true,
      astralRichTextRoundTripped: true,
      docxStaffDeliveryPreservedBytesAndPrivateNoStore: true,
      docxAnonymousDeliveryAndStorageDenied: true,
      browserBoldListsAndTables: true,
      browserWordPreview: true,
      browserGalleryAndInlineImageUploads: true,
      browserAtomicPriceSave: true,
      imageUploadMetadataAndUploaderMatch: true,
      imageByteHashAndSharpRoundTrip: true,
      fixtureDraftAndRevisionImageReferencesConfirmed: true,
      cleanupRequiresGlobalNoReferences: true,
      ownerSessionChanged: false,
      cleanupPerformed: false,
    },
    browserMedia: { references, count: images.length, allUnpublished: images.every((image) => image.metadataPrivate) },
    cleanup: { status: "pending_root_authorization", requiresProductRecordsRemoved: true },
    productionOrPublication: false,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const updatedMarker = { ...state.marker, verification: {
    fixtureProductOwnerVerified: true,
    fixtureLatestUpdaterVerified: true,
    fixtureRecordIds: state.fixtures.records.map((record) => record.id),
    fixtureStaffId: state.staff.userId,
    docxMediaId: state.preview.docxMediaId,
    images: images.map(({ id, actorId, sha256, byteSize, width, height, version, uploaderMatchesFixtureLatestUpdater }) => ({
      id, actorId, sha256, byteSize, width, height, version, uploaderMatchesFixtureLatestUpdater,
    })),
  } };
  await writeFile(mediaPath, `${JSON.stringify(updatedMarker, null, 2)}\n`, "utf8");
  console.log("Two unpublished browser images passed exact metadata, uploader, Sharp byte-hash, and fixture-reference inspection.");
}

async function cleanup(context, state) {
  if (state.staff) {
    await verifyFixtureOwnership(context.clerk, state.staff);
  }
  const product = await table(context.admin, "cms_records").select("id").eq("id", state.marker.productId).limit(1);
  fail(!product.error && Array.isArray(product.data) && product.data.length === 0,
    "browser_media_fixture_product_still_exists");

  const rows = await table(context.admin, "cms_media").select(
    "id,object_key,filename,mime_type,byte_size,width,height,alt_text,created_by,published,archived,version",
  ).in("id", state.marker.media.map((item) => item.id));
  fail(!rows.error && Array.isArray(rows.data) && rows.data.length === 2, "browser_media_cleanup_metadata_lookup_failed");
  const sameFilename = await table(context.admin, "cms_media").select("id").eq("filename", state.marker.filename).limit(5);
  fail(!sameFilename.error && Array.isArray(sameFilename.data) && sameFilename.data.length === 2 &&
    sameFilename.data.every((row) => state.marker.media.some((item) => item.id === row.id)),
  "browser_media_cleanup_filename_not_unique");
  const keys = [];
  for (const item of state.marker.media) {
    const row = rows.data.find((candidate) => candidate.id === item.id);
    const verified = state.marker.verification.images.find((candidate) => candidate.id === item.id);
    fail(row && verified && verified.actorId && row.created_by === verified.actorId && row.object_key === `assets/${item.id}.webp` && row.filename === state.marker.filename &&
      row.alt_text === item.alt && row.mime_type === "image/webp" && row.byte_size === verified.byteSize && row.version === verified.version &&
      row.width === verified.width && row.height === verified.height && row.published === false && row.archived === false,
    "browser_media_cleanup_metadata_mismatch");
    const reference = await rpc(context.admin, "media_referenced", { p_id: item.id, p_live_only: false });
    fail(!reference.error && reference.data === false, "browser_media_still_referenced");
    const listed = await context.admin.storage.from(mediaBucket).list({ prefix: row.object_key, limit: 10 });
    fail(!listed.error && Array.isArray(listed.data?.data), "browser_media_cleanup_storage_lookup_failed");
    const objects = listed.data.data.filter((object) => object.key === row.object_key);
    if (objects.length) {
      fail(objects.length === 1 && objects[0].bucket === mediaBucket && objects[0].uploaded_by === row.created_by,
        "browser_media_cleanup_storage_actor_mismatch");
      const downloaded = await context.admin.storage.from(mediaBucket).download(row.object_key);
      fail(!downloaded.error && downloaded.data, "browser_media_cleanup_download_failed");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      fail(hash === verified.sha256 && bytes.byteLength === row.byte_size, "browser_media_cleanup_hash_mismatch");
      keys.push(row.object_key);
    }
  }

  const ids = state.marker.media.map((item) => item.id);
  const events = await table(context.admin, "editorial_media_events").delete().in("media_id", ids);
  fail(!events.error, "browser_media_cleanup_event_delete_failed");
  const removed = await table(context.admin, "cms_media").delete().in("id", ids);
  fail(!removed.error, "browser_media_cleanup_metadata_delete_failed");
  if (keys.length) {
    const removedObjects = await context.admin.storage.from(mediaBucket).remove(keys);
    fail(!removedObjects.error, "browser_media_cleanup_storage_remove_failed");
  }
  const leftover = await table(context.admin, "cms_media").select("id").in("id", state.marker.media.map((item) => item.id));
  fail(!leftover.error && Array.isArray(leftover.data) && leftover.data.length === 0, "browser_media_cleanup_incomplete");
  const fixtureRecords = await table(context.admin, "cms_records").select("id").in("id", state.marker.verification.fixtureRecordIds);
  fail(!fixtureRecords.error && Array.isArray(fixtureRecords.data) && fixtureRecords.data.length === 0,
    "browser_fixture_records_remain");
  const realProducts = await table(context.admin, "cms_records").select("id,draft").eq("kind", "product").limit(1000);
  fail(!realProducts.error && Array.isArray(realProducts.data) && realProducts.data.length === 42 &&
    realProducts.data.every((record) => !record.draft?.title?.startsWith(`Phase3 ${state.marker.runId} `)),
  "real_product_count_or_fixture_prefix_mismatch");
  const docxId = state.marker.verification.docxMediaId;
  const docxMetadata = await table(context.admin, "cms_media").select("id").eq("id", docxId).limit(1);
  fail(!docxMetadata.error && Array.isArray(docxMetadata.data) && docxMetadata.data.length === 0,
    "browser_fixture_docx_metadata_remains");
  const docxKey = `assets/${docxId}.docx`;
  const docxStorage = await context.admin.storage.from(mediaBucket).list({ prefix: docxKey, limit: 10 });
  fail(!docxStorage.error && Array.isArray(docxStorage.data?.data) &&
    !docxStorage.data.data.some((object) => object.key === docxKey), "browser_fixture_docx_storage_remains");
  const grants = await table(context.admin, "staff_capabilities").select("capability")
    .eq("user_id", state.marker.verification.fixtureStaffId).limit(20);
  fail(!grants.error && Array.isArray(grants.data) && grants.data.length === 0, "browser_fixture_staff_capabilities_remain");
  for (const id of [...ids, docxId]) {
    const response = await appRequest(context.appOrigin, `/api/media/${id}`, null);
    fail(response.status === 404, "anonymous_fixture_media_still_accessible");
  }
  const evidence = await readFile(evidencePath, "utf8").then(JSON.parse).catch(() => ({}));
  evidence.status = "cleanup_verified_local_commit_pending";
  evidence.counts = { ...(evidence.counts ?? {}), remainingRealProducts: realProducts.data.length,
    remainingFixtureRecords: fixtureRecords.data.length, remainingFixtureMedia: 0, remainingTemporaryStaffGrants: grants.data.length };
  evidence.cleanup = { status: "removed_after_exact_checks", requiresProductRecordsRemoved: true };
  evidence.checked = { ...(evidence.checked ?? {}), cleanupPerformed: true,
    fixtureDocumentAndBrowserMediaAbsent: true, temporaryFixtureCapabilitiesRemoved: true,
    anonymousFixtureMedia404: true, ownerAccessMutated: false };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log("Verified cleanup: 42 real products remain, fixture records/media and temporary grants are absent, and anonymous fixture media returns 404.");
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--inspect" && mode !== "--cleanup") {
    console.error("Usage: admin-product-browser-media-cleanup.mjs --inspect|--cleanup");
    process.exitCode = 2;
    return;
  }
  let context;
  try { context = await preflight(); }
  catch (error) {
    console.error(`Browser media cleanup preflight stopped safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  try {
    const state = await readState(mode);
    if (mode === "--inspect") await inspect(context, state);
    else await cleanup(context, state);
  } catch (error) {
    const label = error instanceof CleanupFailure ? error.label : "browser_media_operation_failed";
    console.error(`Browser media operation stopped safely: ${label}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
