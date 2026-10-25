import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { exitCodeForReport, inspectArchive, inspectSnapshot } from "../scripts/catalog-import-preflight.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-preflight-tests-"));

function removeTempTree(target) {
  const temp = path.resolve(os.tmpdir());
  const resolved = path.resolve(target);
  assert.ok(resolved.startsWith(`${temp}${path.sep}`), "test cleanup must stay under the OS temp directory");
  assert.ok(path.basename(resolved).startsWith("catalog-preflight-"), "test cleanup must target a generated fixture");
  fs.rmSync(resolved, { recursive: true, force: true });
}

after(() => removeTempTree(tempRoot));

function createFixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(tempRoot, "catalog-preflight-archive-"));
  t.after(() => removeTempTree(root));
  return root;
}

function sourceRecord(overrides = {}) {
  return {
    sourceId: "legacy:test-product",
    slug: "test-product",
    source: { status: "observed", rawSha256: "a".repeat(64) },
    identity: { title: "Test product", sku: "TEST-1" },
    categories: { sourceSlugs: ["sensors"], assignmentStatus: "awaiting-owner-review" },
    specifications: { status: "observed", items: [] },
    compatibility: { status: "not_checked", items: [] },
    kitContents: { status: "not_present", items: [] },
    resources: [],
    images: { manifest: "product-images/manifest.json", gallery: [] },
    reviewStatus: {
      extraction: "passed",
      factualQA: "passed",
      imageQA: "passed",
      owner: "awaiting-owner-review",
    },
    ...overrides,
  };
}

function writeRecord(root, folder, record, manifest = { assets: [] }) {
  const directory = path.join(root, folder);
  fs.mkdirSync(path.join(directory, "product-images"), { recursive: true });
  const productPath = path.join(directory, "product.json");
  fs.writeFileSync(productPath, `${JSON.stringify(record, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, "product-images", "manifest.json"), `${JSON.stringify(manifest)}\n`);
  return productPath;
}

test("archive-only probe uses the app parser but never emits normalized defaults or import eligibility", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord(), {
    assets: [{ processed: { status: "passed" } }, { processed: { status: "preserve-original" } }],
  });

  const report = inspectArchive(root);
  assert.equal(report.status, "blocked");
  assert.equal(exitCodeForReport(report), 2);
  assert.equal(report.counts.productRecords, 1);
  assert.equal(report.counts.appShapeValid, 1);
  assert.equal(report.counts.archiveImageProcessedStatusCounts.passed, 1);
  assert.equal(report.counts.archiveImageProcessedStatusCounts["preserve-original"], 1);
  assert.equal(report.counts.applicationMediaMappings, 0);
  assert.equal(report.products[0].importEligible, false);
  assert.equal(report.products[0].shapeProbe.status, "valid");
  assert.equal(report.products[0].applicationMappings, "not_supplied");
  assert.ok(report.products[0].blockers.includes("application_category_mapping_not_supplied"));
  assert.ok(report.products[0].blockers.includes("application_variant_mapping_not_supplied"));
  assert.ok(report.products[0].blockers.includes("application_media_mapping_not_supplied"));
  assert.ok(!("summary" in report.products[0]));
  assert.ok(!("blocks" in report.products[0]));
  assert.ok(!("categoryIds" in report.products[0]));
  assert.ok(!("mediaIds" in report.products[0]));
  assert.ok(!("variants" in report.products[0]));
  assert.ok(!("price" in report.products[0]));
  assert.ok(!("stock" in report.products[0]));
  assert.ok(!("sku" in report.products[0]));
  assert.ok(!("title" in report.products[0]));
});

test("pure snapshot inspection leaves source data unchanged and does not infer approval", () => {
  const record = sourceRecord({ reviewStatus: { owner: "unknown-state" } });
  const snapshot = {
    archivePath: "sensors/item/product.json",
    productJsonSha256: "b".repeat(64),
    record,
    manifest: { state: "readable", assetCount: 0, processedStatusCounts: {} },
  };
  const before = structuredClone(snapshot);
  const report = inspectSnapshot([snapshot]);

  assert.deepEqual(snapshot, before);
  assert.equal(report.products[0].ownerReview, "unknown");
  assert.equal(report.products[0].importEligible, false);
  assert.equal(report.products[0].shapeProbe.status, "valid");
  const empty = inspectSnapshot([]);
  assert.equal(empty.status, "error");
  assert.equal(exitCodeForReport(empty), 1);
});

test("reports malformed product JSON as an incomplete preflight", (t) => {
  const root = createFixtureRoot(t);
  const productPath = path.join(root, "sensors", "broken", "product.json");
  fs.mkdirSync(path.dirname(productPath), { recursive: true });
  fs.writeFileSync(productPath, "{not-json");

  const report = inspectArchive(root);
  assert.equal(report.status, "error");
  assert.equal(exitCodeForReport(report), 1);
  assert.equal(report.counts.malformedRecords, 1);
  assert.ok(report.diagnostics.some(({ code }) => code === "invalid_product_json"));
});

test("finds duplicate source keys, slugs, and case-insensitive SKUs", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord());
  writeRecord(root, "sensors/item-2", sourceRecord({ sourceId: "legacy:test-product", slug: "TEST-PRODUCT", identity: { title: "Other", sku: "test-1" } }));

  const report = inspectArchive(root);
  assert.equal(report.counts.duplicateSourceKeyGroups, 1);
  assert.equal(report.counts.duplicateSourceKeyRecords, 2);
  assert.equal(report.counts.duplicateSlugGroups, 1);
  assert.equal(report.counts.duplicateSlugRecords, 2);
  assert.equal(report.counts.duplicateSkuGroups, 1);
  assert.equal(report.counts.duplicateSkuRecords, 2);
  assert.ok(report.products.every((product) => product.duplicates.sourceKey && product.duplicates.slug && product.duplicates.sku));
});

test("missing SKU remains a blocker and an unknown owner state is never approved", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord({ identity: { title: "Test product" }, reviewStatus: { owner: "approved-ish" } }));

  const report = inspectArchive(root);
  assert.equal(report.counts.missingSkus, 1);
  assert.equal(report.counts.ownerApproved, 0);
  assert.equal(report.counts.ownerReviewUnknown, 1);
  assert.equal(report.products[0].ownerReview, "unknown");
  assert.ok(report.products[0].blockers.includes("source_sku_missing"));
  assert.ok(report.products[0].blockers.includes("owner_review_status_unknown"));
});

test("keeps explicit, false, and missing resource flags distinct from reachability", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord({ resources: [
    { check: { status: "reachable-headers-only", contentVerified: true } },
    { check: { status: "reachable-page-match", contentVerified: false } },
    { check: { status: "blocked-or-unverified" } },
  ] }));

  const report = inspectArchive(root);
  const product = report.products[0];
  assert.deepEqual(product.resources.contentVerifiedFlags, { true: 1, false: 1, unknown: 1 });
  assert.equal(product.resources.relevance, "not_verified_by_preflight");
  assert.ok(product.blockers.includes("resource_relevance_not_verified_by_preflight"));
  assert.equal(report.counts.resourcesNeedingRelevanceReview, 3);
});

test("the real product parser rejects an unsafe source slug without repairing it", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord({ slug: "../unsafe" }));

  const report = inspectArchive(root);
  assert.equal(report.counts.appShapeInvalid, 1);
  assert.equal(report.products[0].shapeProbe.status, "invalid");
  assert.deepEqual(report.products[0].shapeProbe.errors, [{ field: "document.slug", code: "invalid" }]);
});

test("rejects a manifest reference that escapes its product directory", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord({ images: { manifest: "../../outside.json" } }));

  const report = inspectArchive(root);
  assert.equal(report.products[0].imageManifest.state, "invalid_reference");
  assert.ok(report.diagnostics.some(({ code }) => code === "invalid_reference"));
  assert.equal(report.counts.errors, 1);
});

test("hashes exact product JSON bytes and returns deterministic reports", (t) => {
  const root = createFixtureRoot(t);
  const productPath = writeRecord(root, "sensors/item-1", sourceRecord());
  const bytes = fs.readFileSync(productPath);
  const expected = createHash("sha256").update(bytes).digest("hex");

  const first = inspectArchive(root);
  const second = inspectArchive(root);
  assert.equal(first.products[0].productJsonSha256, expected);
  const manifestBytes = fs.readFileSync(path.join(path.dirname(productPath), "product-images/manifest.json"));
  assert.equal(first.products[0].imageManifest.manifestJsonSha256, createHash("sha256").update(manifestBytes).digest("hex"));
  assert.equal(first.products[0].claimedSourceSha256, "a".repeat(64));
  assert.deepEqual(first, second);
});

test("ignores independently maintained 3d product directories", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord());
  fs.mkdirSync(path.join(root, "sensors/item-1/3d"));
  fs.writeFileSync(path.join(root, "sensors/item-1/3d/product.json"), "not catalog JSON");
  const report = inspectArchive(root);
  assert.equal(report.counts.productRecords, 1);
  assert.equal(report.counts.errors, 0);
});

test("enforces entry and JSON byte limits", (t) => {
  const root = createFixtureRoot(t);
  writeRecord(root, "sensors/item-1", sourceRecord());

  const entryBound = inspectArchive(root, { maxEntries: 1 });
  assert.equal(entryBound.status, "error");
  assert.ok(entryBound.diagnostics.some(({ code }) => code === "scan_limit_exceeded"));

  const jsonBound = inspectArchive(root, { maxJsonBytes: 8 });
  assert.equal(jsonBound.status, "error");
  assert.ok(jsonBound.diagnostics.some(({ code }) => code === "json_size_limit"));
});

test("does not follow a directory symlink outside the archive", (t) => {
  const root = createFixtureRoot(t);
  const outside = fs.mkdtempSync(path.join(tempRoot, "catalog-preflight-outside-"));
  t.after(() => removeTempTree(outside));
  writeRecord(outside, "sensors/outside", sourceRecord({ sourceId: "legacy:outside" }));

  try {
    fs.symlinkSync(outside, path.join(root, "linked"), "junction");
  } catch (error) {
    t.skip(`directory junctions are unavailable in this environment (${error.code ?? "unknown error"})`);
    return;
  }

  const report = inspectArchive(root);
  assert.equal(report.status, "error");
  assert.equal(report.counts.productRecords, 0);
  assert.ok(report.diagnostics.some(({ code }) => code === "symbolic_link_skipped"));
  assert.ok(report.products.every((product) => !product.archivePath.includes("outside")));
});
