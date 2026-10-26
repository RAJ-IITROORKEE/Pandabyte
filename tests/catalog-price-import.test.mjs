import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyCurrentPrice,
  isMaskedPublicVariant,
  mapBounded,
  matchesSourceAdminRecord,
  priceMutation,
  reconcilePendingPrices,
  sourceCandidates,
  sourcePricePair,
} from "../scripts/catalog-price-import.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("source price mapping preserves explicit regular and sale amounts in integer paise", () => {
  const product = { commercialObservations: { prices: [
    { field: "formattedPrice", text: "₹3,500.00", currency: "INR", paise: 350000 },
    { field: "formattedDiscountedPrice", text: "₹3,000.00", currency: "INR", paise: 300000 },
    { field: "listingPriceText", text: "Regular Price₹3,500.00Sale Price₹3,000.00" },
  ] } };
  assert.deepEqual(sourcePricePair(product), {
    regularPricePaise: 350000,
    actualPricePaise: 300000,
    regularText: "₹3,500.00",
    actualText: "₹3,000.00",
    listingPriceText: "Regular Price₹3,500.00Sale Price₹3,000.00",
    discountedInSource: true,
  });
  const singlePrice = structuredClone(product);
  singlePrice.commercialObservations.prices[1] = { field: "formattedDiscountedPrice", text: "₹3,500.00", currency: "INR", paise: 350000 };
  singlePrice.commercialObservations.prices[2].text = "Price₹3,500.00";
  assert.equal(sourcePricePair(singlePrice).discountedInSource, false);
  singlePrice.commercialObservations.prices[2].text = "Price₹3,600.00";
  assert.throws(() => sourcePricePair(singlePrice), /source_listing_regular_price_mismatch/);
});

test("price classification updates only an unpriced tuple and preserves exact or manual values", () => {
  const target = { regularPricePaise: 350000, actualPricePaise: 300000 };
  assert.equal(classifyCurrentPrice({ regularPaise: null, actualPaise: null, salePaise: null, saleFrom: null, saleUntil: null }, target), "ready-to-update");
  assert.equal(classifyCurrentPrice({ regularPaise: 350000, actualPaise: 300000, salePaise: null, saleFrom: null, saleUntil: null }, target), "already-exact");
  assert.equal(classifyCurrentPrice({ regularPaise: 350000, actualPaise: null, salePaise: null, saleFrom: null, saleUntil: null }, target), "conflict");
  assert.equal(classifyCurrentPrice({ regularPaise: 350000, actualPaise: 300000, salePaise: 250000, saleFrom: "2026-10-01T00:00:00Z", saleUntil: "2026-11-01T00:00:00Z" }, target), "conflict");
});

test("admin matching requires the same published source URL, SKU, and private price row", () => {
  const candidate = { slug: "test-item", sku: "SKU-1", sourceUrl: "https://www.pandabyte.in/product-page/test-item" };
  const record = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "product",
    slug: candidate.slug,
    version: 7,
    publishedRevisionId: "00000000-0000-4000-8000-000000000002",
    archived: false,
    document: { sourceObservation: { sourceUrl: candidate.sourceUrl }, variants: [{ sku: candidate.sku }] },
  };
  const listed = { slug: candidate.slug, status: "published", sourceObservation: true, version: 7 };
  const pricing = { sourceObservation: true, items: [{ productId: record.id, sku: candidate.sku, priceVersion: 0, stock: null, stockVersion: null }] };
  assert.equal(matchesSourceAdminRecord(candidate, listed, record, pricing), true);
  assert.equal(matchesSourceAdminRecord(candidate, { ...listed, sourceObservation: false }, record, pricing), false);
  assert.equal(matchesSourceAdminRecord(candidate, listed, { ...record, document: { ...record.document, sourceObservation: { sourceUrl: "https://wrong.test" } } }, pricing), false);
  assert.equal(matchesSourceAdminRecord(candidate, listed, record, { ...pricing, items: [{ ...pricing.items[0], sku: "OTHER" }] }), false);
});

test("price mutation resends the existing document and contains only guarded price fields", () => {
  const document = { slug: "test-item", sourceObservation: { sourceUrl: "https://www.pandabyte.in/product-page/test-item" }, variants: [{ sku: "SKU-1" }] };
  const candidate = {
    sku: "SKU-1",
    transcript: "products/accessories/test-item/sources_links/source.md",
    sourceRawSha256: "a".repeat(64),
    sourcePrice: { regularPricePaise: 15000, actualPricePaise: 12000 },
  };
  const body = priceMutation({ version: 4, document }, candidate, { priceVersion: 2 });
  assert.deepEqual(Object.keys(body).sort(), ["document", "expectedVersion", "prices"]);
  assert.equal(body.document, document);
  assert.equal(body.expectedVersion, 4);
  assert.deepEqual(body.prices, [{
    sku: "SKU-1",
    expectedPriceVersion: 2,
    regularPricePaise: 15000,
    actualPricePaise: 12000,
    salePricePaise: null,
    saleStartsAt: null,
    saleEndsAt: null,
    reason: `Owner-approved source price import: ${candidate.transcript}#public-product-data sha256=${"a".repeat(64)}`,
  }]);
});

test("source products remain masked in public variants", () => {
  const variant = { sku: "SKU-1", regularPricePaise: null, effectivePricePaise: null, isOnSale: false, availability: "unavailable", purchasable: false };
  assert.equal(isMaskedPublicVariant(variant, "SKU-1"), true);
  assert.equal(isMaskedPublicVariant({ ...variant, effectivePricePaise: 100 }, "SKU-1"), false);
  assert.equal(isMaskedPublicVariant({ ...variant, purchasable: true }, "SKU-1"), false);
});

test("verification reconciles only exact pending writes before reporting a partial import", () => {
  const ledger = { items: {
    "SKU-EXACT": { status: "pending", expectedPriceVersion: 0 },
    "SKU-UNPRICED": { status: "pending", expectedPriceVersion: 0 },
  } };
  const reconciled = reconcilePendingPrices(ledger, [
    { candidate: { sku: "SKU-EXACT" }, found: { status: "already-exact" } },
    { candidate: { sku: "SKU-UNPRICED" }, found: { status: "ready-to-update" } },
  ], "2026-10-27T00:00:00.000Z");
  assert.equal(reconciled, 1);
  assert.equal(ledger.items["SKU-EXACT"].status, "verified-after-unknown-outcome");
  assert.equal(ledger.items["SKU-UNPRICED"].status, "pending");
});

test("bounded work groups cap concurrency, retain input order, and report ten-item milestones", async () => {
  let active = 0;
  let maximumActive = 0;
  const progress = [];
  const result = await mapBounded(Array.from({ length: 42 }, (_, index) => index), 3, async (index) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, (3 - (index % 3)) * 2));
    active--;
    return index * 2;
  }, (completed, total) => progress.push([completed, total]));
  assert.equal(maximumActive, 3);
  assert.deepEqual(result, Array.from({ length: 42 }, (_, index) => index * 2));
  assert.deepEqual(progress, [[10, 42], [20, 42], [30, 42], [40, 42], [42, 42]]);
});

test("repository source extraction validates all captured hashes and the 42-SKU scope", async () => {
  const source = await sourceCandidates(repoRoot);
  assert.equal(source.sourceProductCount, 44);
  assert.equal(source.candidates.length, 42);
  assert.equal(source.held.length, 2);
  assert.equal(source.listingObservationCount, 89);
  assert.deepEqual(source.held.map(({ slug }) => slug).sort(), [
    "atoms3-lite-esp32s3-dev-kit",
    "m5stack-single-live-wire-wi-fi-smart-switch-esp32-c6",
  ]);
  const bySku = new Map(source.candidates.map((item) => [item.sku, item]));
  assert.equal(bySku.get("XLORA").sourcePrice.regularPricePaise, 350000);
  assert.equal(bySku.get("XLORA").sourcePrice.actualPricePaise, 300000);
  assert.equal(bySku.get("PBNEO6M").sourcePrice.regularPricePaise, 48000);
  assert.equal(bySku.get("PBNEO6M").sourcePrice.actualPricePaise, 36000);
  assert.equal(bySku.get("PB-BMV080").sourcePrice.regularPricePaise, 800000);
  assert.equal(bySku.get("PB-BMV080").sourcePrice.actualPricePaise, 600000);
  assert.equal(source.candidates.filter((item) => item.sourcePrice.discountedInSource).length, 3);
});
