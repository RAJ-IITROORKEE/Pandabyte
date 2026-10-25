import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { buildCatalogSourcePlan, DEFAULT_ARCHIVE_ROOT } from "../scripts/catalog-source-map.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-source-map-tests-"));

function removeTempTree(target) {
  const temp = path.resolve(os.tmpdir());
  const resolved = path.resolve(target);
  assert.ok(resolved.startsWith(`${temp}${path.sep}`), "test cleanup must stay under the OS temp directory");
  assert.ok(path.basename(resolved).startsWith("catalog-source-map-tests-") || path.basename(resolved).startsWith("fixture-"), "test cleanup must target a generated fixture");
  fs.rmSync(resolved, { recursive: true, force: true });
}

after(() => removeTempTree(tempRoot));

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function makeFixture(t, { processedPath = "product-images/processed/photo.png", processedBytes = "processed photo", expectedOutputSha = null, reviewRawSha = "a".repeat(64), catalogFolder = "sensors/test-product" } = {}) {
  const root = fs.mkdtempSync(path.join(tempRoot, "fixture-"));
  t.after(() => removeTempTree(root));
  const productDirectory = path.join(root, "sensors", "test-product");
  const originalPath = "product-images/original/photo.jpg";
  const originalBytes = "source photo";
  fs.mkdirSync(path.join(productDirectory, "product-images", "original"), { recursive: true });
  fs.mkdirSync(path.join(productDirectory, "product-images", "processed"), { recursive: true });
  fs.writeFileSync(path.join(productDirectory, originalPath), originalBytes);
  if (!processedPath.includes("..")) {
    fs.mkdirSync(path.dirname(path.join(productDirectory, processedPath)), { recursive: true });
    fs.writeFileSync(path.join(productDirectory, processedPath), processedBytes);
  }

  const sourceRawSha = "a".repeat(64);
  const actualOutputSha = digest(processedBytes);
  const outputSha = expectedOutputSha ?? actualOutputSha;
  const product = {
    schemaVersion: 1,
    sourceId: "legacy:test-product",
    slug: "test-product",
    source: {
      url: "https://www.pandabyte.in/product-page/test-product",
      resolvedUrl: "https://www.pandabyte.in/product-page/test-product",
      capturedAt: "2026-10-25T12:00:00.000Z",
      captureTimeProvenance: "metadata.scrapeId UUIDv7 job creation timestamp; response completion time unverified",
      rawSha256: sourceRawSha,
      status: "observed",
      sourceRelativeReview: { meaning: "Compared with captured source; not engineering certification or owner approval." },
    },
    identity: { title: "Test Product", sku: "TEST-1", legacyProductId: "do-not-map" },
    categories: { sourceSlugs: ["sensors"], sourceRecords: [{ id: "source-only-id", name: "Sensors" }] },
    sections: [{ id: "section-1", title: "description", text: "Exact source description." }],
    specifications: { status: "observed", items: [] },
    compatibility: { status: "not_checked", items: [] },
    kitContents: { status: "not_present", items: [] },
    variants: { status: "observed", items: [{ sku: "TEST-1", optionsSelections: [] }] },
    modelNumbers: [],
    commercialObservations: {
      prices: [{ field: "formattedPrice", text: "₹10.00", currency: "INR", paise: 1000, evidence: ["public-product-data"], capturedAt: "2026-10-25T12:00:00.000Z" }],
      listingPriceText: "Price₹10.00",
    },
    resources: [],
    images: { manifest: "product-images/manifest.json" },
    reviewStatus: { extraction: "passed", factualQA: "passed", imageQA: "passed", owner: "awaiting-owner-review" },
  };
  const originalSha = digest(originalBytes);
  const manifest = {
    schemaVersion: 1,
    sourceId: product.sourceId,
    gallery: [{ position: 0, assetId: "image-test", sourceUrl: "https://cdn.example.test/photo.jpg", origin: "product-gallery" }],
    mainAssetId: "image-test",
    assets: [{
      id: "image-test",
      classification: "photo",
      original: { path: originalPath, sha256: originalSha, status: "downloaded", mime: "image/jpeg" },
      processed: {
        path: processedPath,
        status: "passed",
        review: "passed",
        sha256: outputSha,
        sourceSha256: originalSha,
        mime: "image/png",
        visualQA: { outputSHA256: outputSha },
      },
      sourceReferences: [{ url: "https://cdn.example.test/photo.jpg", origin: "product-gallery", sourceIndex: 0, title: "Test Product front", altText: null, mediaType: "PHOTO" }],
      classificationReview: { status: "source-visually-reviewed", sourceSHA256: originalSha, evidence: "A photographed test product viewed from the front." },
    }],
  };
  const review = {
    schemaVersion: 1,
    products: [{
      sourceId: product.sourceId,
      rawSha256: reviewRawSha,
      ownerIssues: [],
      missingResourceLabels: [],
      ownerFactualApproval: "awaiting-owner-review",
      proposedReplacements: {
        specifications: { status: "observed", items: [{ name: "Voltage", value: "5V", sourceText: "Voltage: 5V", evidence: ["section-1"], verification: "observed" }], review: { rawSha256: sourceRawSha } },
        compatibility: { status: "observed", items: [], review: { rawSha256: sourceRawSha } },
        kitContents: { status: "not_present", items: [], review: { rawSha256: sourceRawSha } },
      },
    }],
  };
  const pixel = { schemaVersion: 1, results: [{ sourceId: product.sourceId, assetId: "image-test", status: "passed", sourceSHA256: originalSha, outputSHA256: outputSha }] };
  writeJson(path.join(root, "catalog.json"), { schemaVersion: 1, products: [{ sourceId: product.sourceId, folder: catalogFolder, title: "Test Product", sku: "TEST-1", categories: ["sensors"] }] });
  writeJson(path.join(productDirectory, "product.json"), product);
  writeJson(path.join(productDirectory, "product-images", "manifest.json"), manifest);
  writeJson(path.join(root, "reports", "structured-field-review.json"), review);
  writeJson(path.join(root, "reports", "pixel-provenance.json"), pixel);
  writeJson(path.join(root, "reports", "resource-checks.json"), {});
  writeJson(path.join(root, "reports", "resource-followup.json"), { results: [] });
  return { root, productDirectory, outputSha, originalSha, outsideFile: path.join(tempRoot, "escape.png") };
}

test("maps and accounts for the current archive without changing its source states", () => {
  const plan = buildCatalogSourcePlan(DEFAULT_ARCHIVE_ROOT);
  assert.equal(plan.mode, "read-only-source-mapping-plan");
  assert.equal(plan.sourceProductCount, 44);
  assert.deepEqual(plan.summary, {
    eligiblePotential: 42,
    heldMissingSourceSku: 2,
    otherHeld: 0,
    sourceCategoryMemberships: 45,
    galleryEntries: 98,
    acceptedProcessed: 87,
    preservedOriginal: 11,
    blockedOrUnselectedAssets: 3,
    aboveCurrentMediaUploadLimit: 3,
  });

  const byId = new Map(plan.entries.map((entry) => [entry.sourceIdentity.sourceId, entry]));
  const atoms3 = byId.get("legacy:atoms3-lite-esp32s3-dev-kit");
  const smartSwitch = byId.get("legacy:m5stack-single-live-wire-wi-fi-smart-switch-esp32-c6");
  assert.equal(atoms3.disposition.status, "hold-missing-source-sku");
  assert.equal(smartSwitch.disposition.status, "hold-missing-source-sku");
  assert.deepEqual(atoms3.documentFields.variants, []);
  assert.deepEqual(smartSwitch.documentFields.variants, []);
  assert.ok(plan.entries.filter((entry) => entry.disposition.localCmsCandidate).every((entry) => entry.documentFields.variants.length === 1));
  assert.ok(plan.entries.every((entry) => entry.sourceReviewContext.ownerStatus === "awaiting-owner-review"));
  assert.ok(plan.entries.every((entry) => !("categoryIds" in entry.documentFields) && !("mediaIds" in entry.documentFields)));
  assert.ok(plan.entries.every((entry) => !("legacyProductId" in entry.sourceIdentity)));
  assert.ok(plan.entries.every((entry) => !("price" in entry.documentFields) && !("stock" in entry.documentFields) && !("availability" in entry.documentFields)));

  for (const entry of plan.entries) {
    const source = JSON.parse(fs.readFileSync(path.join(DEFAULT_ARCHIVE_ROOT, entry.sourceIdentity.relativeFolder, "product.json"), "utf8"));
    assert.deepEqual(entry.privateSourcePriceObservations.prices, source.commercialObservations.prices);
    assert.equal(entry.privateSourcePriceObservations.captureTimeProvenance, source.source.captureTimeProvenance);
    for (const asset of entry.gallery) {
      assert.ok(!asset.relativePath?.split(/[\\/]/).includes("3d"));
      if (asset.integrityVerified) {
        assert.equal(digest(fs.readFileSync(asset.absolutePath)), asset.sha256);
        assert.equal(asset.altTextEvidence, "classificationReview.evidence");
      }
      if (asset.attachmentEligible) {
        assert.ok(asset.altText);
      }
    }
  }

  const dupont = byId.get("legacy:female-to-female-breadboard-jumper-dupont-2-54mm-cable-40-pcs-10cm");
  const xC3m = byId.get("legacy:pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible");
  assert.deepEqual(dupont.gallery.map((asset) => asset.mediaUploadStatus), ["exceeds-current-4MiB-upload-limit"]);
  assert.deepEqual(xC3m.gallery.map((asset) => asset.mediaUploadStatus), ["exceeds-current-4MiB-upload-limit", "exceeds-current-4MiB-upload-limit", "within-current-4MiB-upload-limit"]);

  const temt6000 = byId.get("legacy:light-sensor-temt6000-grove-compatible");
  assert.ok(!temt6000.documentFields.specifications.some((item) => /rgb|voltage/i.test(item.name)));
  assert.ok(temt6000.reviewIssues.some((issue) => issue.code === "source-unrelated-rgb-copy"));
  const pandaPulse = byId.get("legacy:pandabyte-esp32c3-arduino-iot-kit");
  assert.deepEqual(pandaPulse.documentFields.kitContents, []);
  assert.ok(pandaPulse.reviewIssues.some((issue) => issue.code === "source-kit-count-reconciliation"));
  const nodeMcuHat = byId.get("legacy:nodemcu-grove-expansion-board-shield-hat");
  assert.deepEqual(nodeMcuHat.documentFields.compatibility, []);
  assert.ok(!nodeMcuHat.documentFields.specifications.some((item) => item.name.toLocaleLowerCase("en-US") === "compatible with"));

  const resourceLinks = plan.entries.flatMap((entry) => entry.documentFields.resources.map((resource) => ({ sourceId: entry.sourceIdentity.sourceId, ...resource })));
  assert.deepEqual(resourceLinks, [{
    sourceId: "legacy:maker-uno-simplifying-arduino-for-education",
    label: "Product Wiki",
    url: "https://www.cytron.io/p-maker-uno-simplifying-arduino-for-education",
  }]);
});

test("preserves exact reviewed claim clauses and refuses stale structured reviews", (t) => {
  const fixture = makeFixture(t);
  const first = buildCatalogSourcePlan(fixture.root);
  const second = buildCatalogSourcePlan(fixture.root);
  assert.deepEqual(first, second, "the no-write plan is deterministic for unchanged archive bytes");
  const before = fs.readFileSync(path.join(fixture.productDirectory, "product.json"));
  assert.deepEqual(fs.readFileSync(path.join(fixture.productDirectory, "product.json")), before);
  assert.deepEqual(first.entries[0].documentFields.specifications, [{ name: "Voltage", value: "5V" }]);

  const productPath = path.join(fixture.productDirectory, "product.json");
  const product = JSON.parse(fs.readFileSync(productPath, "utf8"));
  product.source.rawSha256 = "b".repeat(64);
  writeJson(productPath, product);
  const stale = buildCatalogSourcePlan(fixture.root).entries[0];
  assert.deepEqual(stale.documentFields.specifications, []);
  assert.ok(stale.reviewIssues.some((issue) => issue.code === "structured_review_hash_mismatch"));
});

test("does not select processed media with a path escape or byte hash mismatch", (t) => {
  const fixture = makeFixture(t, { processedPath: "../escape.png" });
  fs.writeFileSync(fixture.outsideFile, "must not be read");
  const plan = buildCatalogSourcePlan(fixture.root);
  const asset = plan.entries[0].gallery[0];
  assert.equal(asset.disposition, "blocked-integrity-or-review");
  assert.equal(asset.attachmentEligible, false);
  assert.equal(asset.absolutePath, null);
  assert.ok(plan.entries[0].reviewIssues.some((issue) => issue.code === "processed_asset_hash_or_path_invalid"));
  assert.equal(fs.readFileSync(fixture.outsideFile, "utf8"), "must not be read");

  const mismatch = makeFixture(t, { expectedOutputSha: "f".repeat(64) });
  const mismatchAsset = buildCatalogSourcePlan(mismatch.root).entries[0].gallery[0];
  assert.equal(mismatchAsset.disposition, "blocked-integrity-or-review");
  assert.equal(mismatchAsset.sha256, null);
});

test("rejects an archive folder outside the archive and never descends into 3d", (t) => {
  const fixture = makeFixture(t, { catalogFolder: "../outside-product" });
  assert.throws(() => buildCatalogSourcePlan(fixture.root), /unsafe_relative_path/);

  const validFixture = makeFixture(t);
  const source = JSON.parse(fs.readFileSync(path.join(validFixture.productDirectory, "product-images", "manifest.json"), "utf8"));
  source.assets[0].processed.path = "product-images/3d/asset.png";
  writeJson(path.join(validFixture.productDirectory, "product-images", "manifest.json"), source);
  const plan = buildCatalogSourcePlan(validFixture.root);
  assert.equal(plan.entries[0].gallery[0].attachmentEligible, false);
  assert.equal(plan.entries[0].gallery[0].absolutePath, null);
});
