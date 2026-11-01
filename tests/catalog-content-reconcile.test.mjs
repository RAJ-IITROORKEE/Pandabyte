import test from "node:test";
import assert from "node:assert/strict";
import { planContentUpdate as planPinnedContent, publicContentDocument, revisionMatches, revisionQuery, verifiedContentCandidate as verifyPinnedCandidate } from "../scripts/catalog-content-reconcile.mjs";

const sourceUrl = "https://www.pandabyte.in/product-page/test-board";
const rawSha256 = "a".repeat(64);
const archiveFileSha256 = "c".repeat(64);
const verifiedContentCandidate = (candidate, source) => verifyPinnedCandidate(candidate, source, archiveFileSha256);
const planContentUpdate = (candidate, source, admin, published, equal = false) => planPinnedContent(candidate, source, admin, published, equal, archiveFileSha256);
const excerpt = "A board with a documented USB connector.";
const source = { slug: "test-board", identity: { sku: "TEST-1" }, source: { url: sourceUrl, resolvedUrl: sourceUrl, status: "observed", rawSha256 }, sections: [{ title: "PRODUCT INFO", text: `${excerpt} The exact board revision is unknown.` }] };
const link = { label: "Official product page", url: "https://example.com/product", evidenceSourceUrl: "https://example.com/product", evidence: "The manufacturer page identifies the same exact product." };
const candidate = { slug: "test-board", sku: "TEST-1", sourceUrl, rawSha256, archiveFileSha256, excerpts: [excerpt], supplementalLinks: [link] };
const document = { title: "Board", slug: "test-board", summary: "Retained", sourceObservation: { sourceUrl }, variants: [{ id: "variant", sku: "TEST-1" }], blocks: [{ type: "image", mediaId: "photo", alt: "Board" }], resources: [{ label: "Existing", url: "https://example.com/existing" }], mediaIds: ["photo"], model3d: { mediaId: "model" }, sourceReview: ["Private source review"] };
const admin = { id: "11111111-1111-4111-8111-111111111111", kind: "product", slug: "test-board", version: 3, publishedRevisionId: "22222222-2222-4222-8222-222222222222", archived: false, document };
const published = { id: admin.id, slug: admin.slug, revisionId: admin.publishedRevisionId, document: publicContentDocument(document) };

test("requires exact source identity, hash and verbatim reviewed excerpts", () => {
  assert.equal(verifiedContentCandidate(candidate, source), true);
  for (const changed of [
    { ...candidate, sku: "OTHER" }, { ...candidate, sourceUrl: sourceUrl + "-other" },
    { ...candidate, rawSha256: "b".repeat(64) }, { ...candidate, excerpts: ["Invented board feature"] },
    { ...candidate, archiveFileSha256: "b".repeat(64) },
    { ...candidate, excerpts: [excerpt, excerpt] }, { ...candidate, excerpts: [" " + excerpt] },
    { ...candidate, supplementalLinks: [{ ...link, url: "javascript:alert(1)" }] },
    { ...candidate, supplementalLinks: [{ ...link, evidence: "" }] },
    { ...candidate, supplementalLinks: [{ ...link, evidenceSourceUrl: "http://example.com" }] },
    { ...candidate, supplementalLinks: [link, link] },
  ]) assert.equal(verifiedContentCandidate(changed, source), false);
  assert.equal(verifiedContentCandidate(candidate, { ...source, sections: [] }), false);
  assert.equal(verifyPinnedCandidate(candidate, source), false);
});

test("adds a single source list and links without changing private review, images or other fields", () => {
  const before = structuredClone(document);
  const plan = planContentUpdate(candidate, source, admin, published, true);
  assert.equal(plan.status, "ready");
  assert.equal(plan.expectedVersion, 3);
  assert.deepEqual(plan.document.blocks, [document.blocks[0], { type: "heading", level: 2, text: "Source highlights" }, { type: "bulletList", items: [excerpt] }]);
  assert.deepEqual(plan.document.resources, [...document.resources, { label: link.label, url: link.url }]);
  assert.deepEqual(document, before);
  for (const key of ["title", "summary", "sourceReview", "mediaIds", "model3d", "variants"]) assert.deepEqual(plan.document[key], document[key]);
  const updated = { ...admin, document: plan.document };
  assert.equal(planContentUpdate(candidate, source, updated, { ...published, document: publicContentDocument(plan.document) }, true).status, "unchanged");
});

test("holds unrelated prose, rich content, unpublished edits and uncertain private revisions", () => {
  assert.equal(planContentUpdate(candidate, source, admin, published).status, "private_revision_unverifiable");
  assert.equal(planContentUpdate(candidate, source, { ...admin, document: { ...document, title: "Unpublished title" } }, published, true).status, "draft_differs_from_published");
  for (const [patch, status] of [
    [{ blocks: [...document.blocks, { type: "paragraph", text: "Admin prose" }] }, "existing_prose"],
    [{ richContent: { type: "doc", content: [] } }, "existing_rich_content"],
    [{ blocks: [null] }, "invalid_existing_blocks"],
  ]) {
    const changed = { ...admin, document: { ...document, ...patch } };
    assert.equal(planContentUpdate(candidate, source, changed, { ...published, document: publicContentDocument(changed.document) }, true).status, status);
  }
  assert.equal(planContentUpdate(candidate, source, admin, { ...published, revisionId: "changed" }, true).status, "record_mismatch");
});

test("link-only updates preserve existing rich content and skip duplicate destinations", () => {
  const linked = { ...candidate, excerpts: [] };
  const changed = { ...admin, document: { ...document, richContent: { type: "doc", content: [{ type: "paragraph" }] } } };
  const live = { ...published, document: publicContentDocument(changed.document) };
  const result = planContentUpdate(linked, source, changed, live, true);
  assert.equal(result.status, "ready"); assert.equal(result.contentAdded, false);
  assert.deepEqual(result.document.richContent, changed.document.richContent);
  const already = { ...changed, document: { ...changed.document, resources: result.document.resources } };
  assert.equal(planContentUpdate(linked, source, already, { ...live, document: publicContentDocument(already.document) }, true).status, "unchanged");
});

test("batch revision query is strictly bound and rejects injected, duplicate or stale records", () => {
  const sql = revisionQuery([admin]);
  for (const expected of [admin.id, admin.slug, admin.publishedRevisionId, "r.version=e.version", "r.draft=v.document"]) assert.ok(sql.includes(expected));
  assert.throws(() => revisionQuery([{ ...admin, slug: "test'; DROP TABLE public.cms_records;--" }]));
  assert.throws(() => revisionQuery([admin, admin]));
  assert.throws(() => revisionQuery([{ ...admin, version: "3" }]));
  const response = { rowCount: 1, rows: [{ slug: admin.slug, version: admin.version, revision: admin.publishedRevisionId, identical: true }] };
  assert.equal(revisionMatches([admin], response).get(admin.slug), true);
  assert.equal(revisionMatches([admin], { ...response, rows: [{ ...response.rows[0], identical: null }] }).get(admin.slug), false);
  assert.throws(() => revisionMatches([admin], { ...response, rows: [{ ...response.rows[0], version: 4 }] }));
  assert.throws(() => revisionMatches([admin], { ...response, rows: [] }));
});
