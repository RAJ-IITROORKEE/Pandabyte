import assert from "node:assert/strict";
import test from "node:test";

import {
  documentWithoutVariantIds,
  fingerprint,
  recordDecision,
  sourceReviewNotes,
  trackRecord,
} from "../scripts/catalog-import-state.mjs";
import { parsePublishedRecord } from "../lib/editorial/public-record.ts";

const appId = "fdb5682c-c8f4-4c8e-a6fe-3fb15ccac700";
const revisionId = "d8e5f26f-8c9f-43be-a1c6-5b71026a905b";

function currentRecord(overrides = {}) {
  return {
    id: appId,
    version: 3,
    publishedRevisionId: revisionId,
    archived: false,
    document: {
      title: "Sensor board",
      variants: [{ id: "variant-private-id", sku: "SENSE-1", label: "Board" }],
    },
    ...overrides,
  };
}

test("fingerprints ignore object key order and preserve array order", () => {
  const first = { title: "Sensor", document: { variants: [{ sku: "S1" }, { sku: "S2" }], nested: { a: 1, b: 2 } } };
  const reordered = { document: { nested: { b: 2, a: 1 }, variants: [{ sku: "S1" }, { sku: "S2" }] }, title: "Sensor" };
  const reversed = { ...first, document: { ...first.document, variants: [...first.document.variants].reverse() } };

  assert.equal(fingerprint(first), fingerprint(reordered));
  assert.notEqual(fingerprint(first), fingerprint(reversed));
});

test("an untracked first record is created, while an existing record is a collision", () => {
  const current = currentRecord();
  const before = structuredClone(current);

  assert.equal(recordDecision(null, null, "source-v1"), "create");
  assert.equal(recordDecision(undefined, current, "source-v1"), "collision");
  assert.deepEqual(current, before);
});

test("an exact tracked source and remote record is unchanged; source-only changes are safe updates", () => {
  const current = currentRecord();
  const sourceFingerprint = "source-v1";
  const tracked = trackRecord(current, sourceFingerprint);
  const before = structuredClone({ tracked, current });

  assert.equal(recordDecision(tracked, current, sourceFingerprint), "unchanged");
  assert.equal(recordDecision(tracked, current, "source-v2"), "update");
  assert.deepEqual({ tracked, current }, before);
});

test("version, document, or publication edits are preserved; missing, changed, or archived records conflict", () => {
  const current = currentRecord();
  const tracked = trackRecord(current, "source-v1");
  const trackedBefore = structuredClone(tracked);
  const cases = [
    ["version", { ...current, version: current.version + 1 }, "admin-edited"],
    ["document", { ...current, document: { ...current.document, title: "Staff edit" } }, "admin-edited"],
    ["published revision", { ...current, publishedRevisionId: "0f3c8b34-39a4-4d2a-b13b-fb5ccacbd970" }, "admin-edited"],
    ["archive", { ...current, archived: true }, "conflict"],
    ["identity", { ...current, id: "0f3c8b34-39a4-4d2a-b13b-fb5ccacbd970" }, "conflict"],
    ["missing", null, "conflict"],
  ];

  for (const [label, candidate, expected] of cases) {
    const before = structuredClone(candidate);
    assert.equal(recordDecision(tracked, candidate, "source-v2"), expected, label);
    assert.deepEqual(candidate, before, `${label} candidate must remain unchanged`);
  }
  assert.deepEqual(current, currentRecord(), "the tracked source payload remains unchanged");
  assert.deepEqual(tracked, trackedBefore, "the source ledger remains unchanged");
});

test("tracking a newly created record makes a rerun unchanged instead of creating a duplicate", () => {
  const sourceFingerprint = "source-v1";
  const firstDecision = recordDecision(null, null, sourceFingerprint);
  const created = currentRecord();
  const tracked = trackRecord(created, sourceFingerprint);
  const rerunDecision = recordDecision(tracked, created, sourceFingerprint);
  const createCount = [firstDecision, rerunDecision].filter((decision) => decision === "create").length;

  assert.equal(firstDecision, "create");
  assert.equal(rerunDecision, "unchanged");
  assert.equal(createCount, 1);
});

test("an unchanged publication-pending record is retried without treating it as an Admin edit", () => {
  const current = currentRecord({ publishedRevisionId: null });
  const tracked = trackRecord(current, "source-v1", true);

  assert.equal(recordDecision(tracked, current, "source-v1"), "publish");
  assert.equal(recordDecision(tracked, current, "source-v2"), "conflict");
});

test("a one-version publication after a lost response is confirmed and Admin edits are preserved", () => {
  const current = currentRecord({ publishedRevisionId: null });
  const tracked = trackRecord(current, "source-v1", true);
  const published = { ...current, version: current.version + 1, publishedRevisionId: revisionId };
  const edited = { ...published, document: { ...published.document, title: "Staff edit" } };
  const otherVersion = { ...current, version: current.version + 2, publishedRevisionId: revisionId };

  assert.equal(recordDecision(tracked, published, "source-v1"), "publication-confirmed");
  assert.equal(recordDecision(tracked, edited, "source-v1"), "admin-edited");
  assert.equal(recordDecision(tracked, otherVersion, "source-v1"), "admin-edited");
});

test("variant projection drops app IDs while preserving real SKU, label, and order", () => {
  const document = {
    title: "Two variants",
    variants: [
      { id: "private-app-variant-1", sku: "SOURCE-1", label: "Single" },
      { id: "private-app-variant-2", sku: "SOURCE-2", label: "Pair" },
    ],
  };
  const before = structuredClone(document);
  const projected = documentWithoutVariantIds(document);

  assert.deepEqual(projected, {
    title: "Two variants",
    variants: [
      { sku: "SOURCE-1", label: "Single" },
      { sku: "SOURCE-2", label: "Pair" },
    ],
  });
  assert.deepEqual(document, before);
});

test("staff review notes are bounded, ignore opaque top-level source IDs, and stay out of public records", () => {
  const privateValues = ["legacy:opaque-source-id", "private-db-record-id", "https://source.invalid/private", "raw-sha-secret"];
  const entry = {
    sourceId: privateValues[0],
    appRecordId: privateValues[1],
    sourceUrl: privateValues[2],
    rawSha256: privateValues[3],
    reviewIssues: Array.from({ length: 65 }, () => ({
      code: "compatibility_conflict",
      field: "compatibility",
      meaning: "Conflicting source claim",
      rationale: "R".repeat(2200),
    })),
  };
  const before = structuredClone(entry);
  const notes = sourceReviewNotes(entry);

  assert.equal(notes.length, 64);
  assert.ok(notes.every((note) => note.length <= 2000));
  assert.ok(notes[1].startsWith("compatibility conflict · compatibility · Conflicting source claim · "));
  assert.ok(notes.every((note) => privateValues.every((value) => !note.includes(value))));
  assert.deepEqual(entry, before);

  const product = { title: "Board", slug: "board", summary: "", blocks: [], seoTitle: "", seoDescription: "" };
  const published = {
    id: appId,
    kind: "product",
    revisionId,
    publishedAt: "2026-10-26T00:00:00Z",
    document: { ...product, sourceReview: notes },
    variants: [],
  };
  assert.throws(() => parsePublishedRecord("products", published));
});
