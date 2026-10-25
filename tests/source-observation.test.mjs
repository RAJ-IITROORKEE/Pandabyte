import assert from "node:assert/strict";
import test from "node:test";

import { parseDocument } from "../lib/admin/validation.ts";
import { parsePublishedRecord } from "../lib/editorial/public-record.ts";

const uuid = "d9428888-122b-11e1-b85c-61cd3cbb3210";
const common = { title: "Archived product", slug: "archived-product", summary: "", blocks: [], seoTitle: "", seoDescription: "" };
const product = {
  ...common,
  categoryIds: [],
  modelNumbers: [],
  variants: [{ sku: "SRC-1", label: "Original" }],
  specifications: [],
  compatibility: [],
  kitContents: [],
  resources: [],
  mediaIds: [],
};
const observation = {
  priceText: "  Price ₹400.00  ",
  capturedAt: "2026-10-25T14:26:46.928Z",
  sourceUrl: "https://www.pandabyte.in/product-page/archived-product",
};

test("source observations validate bounded fields and preserve exact public text", () => {
  const parsed = parseDocument("products", {
    ...product,
    sourceObservation: observation,
    sourceReview: ["Conflicting source claim; keep for staff review."],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.sourceObservation, observation);
  assert.deepEqual(parsed.value.sourceReview, ["Conflicting source claim; keep for staff review."]);
  const emptyPrice = parseDocument("products", { ...product, sourceObservation: { ...observation, priceText: "" } });
  assert.equal(emptyPrice.ok, true);
  assert.equal("sourceObservation" in parseDocument("products", product).value, false);
  assert.equal("sourceReview" in parseDocument("products", product).value, false);
});

test("source observations reject malformed dates, unsafe URLs, overlong text, and open-ended keys", () => {
  for (const sourceObservation of [
    { ...observation, capturedAt: "yesterday" },
    { ...observation, capturedAt: "2026-02-30T12:00:00Z" },
    { ...observation, capturedAt: "" },
    { ...observation, sourceUrl: "http://example.com/item" },
    { ...observation, sourceUrl: "https:\\example.com/item" },
    { ...observation, sourceUrl: "https://example.com/space here" },
    { ...observation, sourceUrl: "https://user:pass@example.com/item" },
    { ...observation, sourceUrl: `https://example.com/${"x".repeat(2048)}` },
    { ...observation, priceText: "x".repeat(161) },
    { ...observation, privateHash: "hidden" },
  ]) {
    assert.equal(parseDocument("products", { ...product, sourceObservation }).ok, false);
  }
  assert.equal(parseDocument("products", {
    ...product,
    sourceReview: ["Staff note without source mode"],
  }).ok, false);
  assert.equal(parseDocument("products", {
    ...product,
    sourceObservation: observation,
    sourceReview: Array.from({ length: 65 }, () => "note"),
  }).ok, false);
  assert.equal(parseDocument("products", {
    ...product,
    sourceObservation: observation,
    sourceReview: ["x".repeat(2001)],
  }).ok, false);
});

test("public product parsing marks source observations non-purchasable despite accidental active pricing", () => {
  const record = parsePublishedRecord("products", {
    id: uuid,
    kind: "product",
    revisionId: "d9428888-122b-11e1-b85c-61cd3cbb3211",
    publishedAt: "2026-10-25T14:26:46.928Z",
    document: { ...product, sourceObservation: observation },
    variants: [{
      id: uuid,
      sku: "SRC-1",
      label: "Original",
      regularPricePaise: 40_000,
      effectivePricePaise: 40_000,
      isOnSale: false,
      saleEndsAt: null,
      availability: "available",
    }],
  });
  assert.equal(record.variants[0].purchasable, false);
  assert.deepEqual(record.document.sourceObservation, observation);
  const normal = parsePublishedRecord("products", {
    id: uuid,
    kind: "product",
    revisionId: "d9428888-122b-11e1-b85c-61cd3cbb3211",
    publishedAt: "2026-10-25T14:26:46.928Z",
    document: product,
    variants: [{
      id: uuid,
      sku: "SRC-1",
      label: "Original",
      regularPricePaise: 40_000,
      effectivePricePaise: 40_000,
      isOnSale: false,
      saleEndsAt: null,
      availability: "available",
    }],
  });
  assert.equal(normal.variants[0].purchasable, undefined);
});

test("public product parsing rejects staff-only source review notes", () => {
  const record = {
    id: uuid,
    kind: "product",
    revisionId: "d9428888-122b-11e1-b85c-61cd3cbb3211",
    publishedAt: "2026-10-25T14:26:46.928Z",
    document: { ...product, sourceObservation: observation, sourceReview: ["Internal note"] },
    variants: [],
  };
  assert.throws(() => parsePublishedRecord("products", record));
  assert.throws(() => parsePublishedRecord("products", { ...record, document: { ...product, sourceObservation: observation }, sourceReview: ["Internal note"] }));
});
