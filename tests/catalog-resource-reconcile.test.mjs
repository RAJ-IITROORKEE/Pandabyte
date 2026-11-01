import test from "node:test";
import assert from "node:assert/strict";
import { inspectResourceUpdate, planResourceUpdate, verifiedCandidate } from "../scripts/catalog-resource-reconcile.mjs";

const base = "https://www.pandabyte.in/product-page/test-board";
const link = { label: "Datasheet", url: "https://example.com/data.pdf" };
const candidate = { slug: "test-board", sku: "TEST-1", sourceUrl: base, resources: [link] };
const source = { slug: "test-board", identity: { sku: "TEST-1" }, source: { url: base, resolvedUrl: base, status: "observed" }, resources: [{ label: link.label, originalUrl: link.url }] };
const document = { slug: candidate.slug, title: "Board", sourceObservation: { sourceUrl: base }, variants: [{ id: "variant", sku: candidate.sku }], resources: [{ label: "Manual", url: "https://example.com/manual" }], mediaIds: ["media"], model3d: { mediaId: "model" }, specifications: [{ name: "Voltage", value: "3V" }] };
const admin = { id: "record", kind: "product", slug: candidate.slug, version: 3, publishedRevisionId: "revision", archived: false, document };
const live = { id: admin.id, slug: candidate.slug, revisionId: admin.publishedRevisionId, document: structuredClone(document) };

test("only source-associated secure resource links enter the allowlist", () => {
  assert.equal(verifiedCandidate(candidate, source), true);
  for (const bad of [
    { ...candidate, sku: "WRONG" }, { ...candidate, sourceUrl: base + "-other" },
    { ...candidate, resources: [{ label: "Unknown", url: link.url }] },
    { ...candidate, resources: [{ label: link.label, url: "https://attacker.example/data.pdf" }] },
    { ...candidate, resources: [{ label: link.label, url: "javascript:alert(1)" }] },
    { ...candidate, resources: [{ ...link, displayLabel: "\n" }] },
    { ...candidate, resources: [link, link] },
  ]) assert.equal(verifiedCandidate(bad, source), false);
});

test("plans an additive version-guarded update that preserves the entire draft", () => {
  const result = planResourceUpdate(candidate, source, admin, live, true);
  assert.equal(result.status, "ready");
  assert.equal(result.expectedVersion, 3);
  assert.equal(result.previousRevision, "revision");
  assert.deepEqual(result.document, { ...document, resources: [...document.resources, link] });
  assert.equal(result.document.mediaIds, document.mediaIds);
  assert.deepEqual(document.resources, [{ label: "Manual", url: "https://example.com/manual" }]);
  const corrected = planResourceUpdate({ ...candidate, resources: [{ ...link, displayLabel: "Official product page" }] }, source, admin, live, true);
  assert.deepEqual(corrected.additions, [{ label: "Official product page", url: link.url }]);
  const existing = { ...admin, document: { ...document, resources: [...document.resources, link] } };
  assert.equal(planResourceUpdate(candidate, source, existing, { ...live, document: structuredClone(existing.document) }, true).status, "unchanged");
});

test("holds uncertain revisions, private changes, unmatched identity and user edits", () => {
  assert.equal(planResourceUpdate(candidate, source, { ...admin, document: { ...document, sourceReview: ["private"] } }, live).status, "private_revision_unverifiable");
  assert.equal(planResourceUpdate(candidate, source, { ...admin, document: { ...document, title: "Staff edit" } }, live).status, "draft_differs_from_published");
  assert.equal(planResourceUpdate(candidate, source, admin, { ...live, revisionId: "old" }).status, "record_mismatch");
  assert.equal(planResourceUpdate(candidate, source, { ...admin, archived: true }, live).status, "record_mismatch");
  assert.equal(planResourceUpdate(candidate, source, { ...admin, document: { ...document, variants: [{ sku: "WRONG" }] } }, live).status, "record_mismatch");
});

test("requires exact private draft comparison and holds on CLI errors", async () => {
  const withPrivate = { ...admin, document: { ...document, sourceReview: ["private"] } };
  assert.equal((await inspectResourceUpdate(candidate, source, withPrivate, live, async () => true)).status, "ready");
  assert.equal((await inspectResourceUpdate(candidate, source, withPrivate, live, async () => false)).status, "private_revision_unverifiable");
  assert.equal((await inspectResourceUpdate(candidate, source, withPrivate, live, async () => { throw new Error("unavailable"); })).status, "revision_check_unavailable");
  assert.deepEqual((await inspectResourceUpdate(candidate, source, withPrivate, live, async () => true)).document.sourceReview, ["private"]);
});
