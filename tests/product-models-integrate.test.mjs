import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelIntegrationPlan,
  documentsMatchExceptModel3dAndStaffReview,
  modelAltText,
} from "../scripts/product-models-integrate.mjs";
import { PRIVATE_MODEL_SOURCE_IDS } from "../scripts/product-models-source.mjs";

const PROJECT_ID = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function sourceFixtures() {
  const privateIds = [...PRIVATE_MODEL_SOURCE_IDS];
  const ids = [...privateIds, ...Array.from({ length: 36 }, (_, index) => `fixture:${index}`)];
  const entries = ids.map((sourceId, index) => {
    const title = `Product ${index}`;
    const slug = `product-${index}`;
    return {
      sourceIdentity: { sourceId, title, slug, sourceSku: `SKU-${index}` },
      disposition: { localCmsCandidate: true },
      publicSourceObservation: { priceText: "Observed", capturedAt: "2026-10-26T00:00:00Z", sourceUrl: "https://example.test/product" },
    };
  });
  const sourcePlan = { sourceProductCount: 44, summary: { eligiblePotential: 42, heldMissingSourceSku: 2, otherHeld: 0 }, entries };
  const products = Object.fromEntries(entries.map((entry, index) => [entry.sourceIdentity.sourceId, {
    id: uuid(index + 1), version: 1, publishedRevisionId: uuid(index + 100),
    provenance: { source: { ...entry.sourceIdentity } },
  }]));
  const importLedger = { schemaVersion: 1, projectId: PROJECT_ID, products };
  const assets = ids.slice(0, 18).map((sourceId, index) => {
    const entry = entries[index];
    return {
      sourceId,
      title: entry.sourceIdentity.title,
      slug: entry.sourceIdentity.slug,
      publicUseAllowed: !PRIVATE_MODEL_SOURCE_IDS.has(sourceId),
      readiness: { rootReview: sourceId === privateIds[0] ? "awaiting-owner-review" : "passed", deliveryCheck: "passed" },
    };
  });
  return { sourcePlan, importLedger, manifest: { schemaVersion: 1, assets } };
}

test("maps 18 exact model source identities to 18 catalog records and preserves private draft gates", () => {
  const plan = buildModelIntegrationPlan(sourceFixtures());
  assert.equal(plan.length, 18);
  assert.equal(new Set(plan.map((row) => row.productId)).size, 18);
  assert.equal(plan.filter((row) => row.publicEligible).length, 12);
  assert.equal(plan.filter((row) => !row.publicEligible).length, 6);
  assert.equal(plan.find((row) => row.sourceId === [...PRIVATE_MODEL_SOURCE_IDS][0]).publicEligible, false);
});

test("stops on duplicate source identity, record mapping, or catalog provenance", () => {
  const duplicateSource = sourceFixtures();
  duplicateSource.manifest.assets[17].sourceId = duplicateSource.manifest.assets[16].sourceId;
  assert.throws(() => buildModelIntegrationPlan(duplicateSource), /model_source_identity_ambiguous/u);

  const duplicateRecord = sourceFixtures();
  duplicateRecord.importLedger.products[duplicateRecord.manifest.assets[1].sourceId].id =
    duplicateRecord.importLedger.products[duplicateRecord.manifest.assets[0].sourceId].id;
  assert.throws(() => buildModelIntegrationPlan(duplicateRecord), /catalog_ledger_record_id_collision/u);

  const wrongIdentity = sourceFixtures();
  wrongIdentity.manifest.assets[0].slug = "different-product";
  assert.throws(() => buildModelIntegrationPlan(wrongIdentity), /model_catalog_identity_conflict/u);
});

test("does not publish unrelated draft changes while ignoring generated variant ids and staff-only review fields", () => {
  const published = {
    title: "Board",
    slug: "board",
    summary: "Published text",
    variants: [{ id: uuid(1), sku: "BOARD-1", label: "Board" }],
    mediaIds: [uuid(2)],
  };
  const modelDraft = {
    ...published,
    variants: [{ id: uuid(3), sku: "BOARD-1", label: "Board" }],
    model3d: { mediaId: uuid(4), posterId: uuid(5), alt: "Board model" },
    sourceReview: ["staff-only note"],
  };
  assert.equal(documentsMatchExceptModel3dAndStaffReview(modelDraft, published), true);
  assert.equal(documentsMatchExceptModel3dAndStaffReview({ ...modelDraft, summary: "Unpublished edit" }, published), false);
  assert.equal(documentsMatchExceptModel3dAndStaffReview({ ...modelDraft, mediaIds: [uuid(6)] }, published), false);
});

test("uses the approved photographed NEO-M8M wording while retaining the NEO-6M catalog title", () => {
  assert.equal(modelAltText("PandaByte NEO-6M GPS Grove Sensor"),
    "PandaByte NEO-6M GPS Grove Sensor visual model of the photographed NEO-M8M assembly");
  assert.equal(modelAltText("PandaByte Push Button Grove Sensor"), "PandaByte Push Button Grove Sensor visual 3D model");
});
