import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { preflight } from "./phase2-isolation.mjs";
import { buildCatalogSourcePlan } from "../scripts/catalog-source-map.mjs";
import { fingerprint } from "../scripts/catalog-import-state.mjs";
import { parseDocument } from "../lib/admin/validation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap/catalog-import");
const ensure = (ok, label) => { if (!ok) throw new Error(label); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function main() {
  ensure(process.argv.length === 2, "no_options_supported");
  const context = await preflight();
  const ledger = JSON.parse(await fs.readFile(path.join(work, "ledger.json"), "utf8"));
  const prepared = JSON.parse(await fs.readFile(path.join(work, "prepared.json"), "utf8"));
  const plan = buildCatalogSourcePlan();
  const eligible = plan.entries.filter(e => e.disposition.localCmsCandidate);
  const held = plan.entries.filter(e => !e.disposition.localCmsCandidate);
  ensure(plan.sourceProductCount === 44 && eligible.length === 42 && held.length === 2, "source_accounting_changed");
  ensure(Object.keys(ledger.products).length === 42 && Object.keys(ledger.categories).length === 5 &&
    Object.keys(ledger.media).length === 96 && !Object.keys(ledger.pending).length, "import_incomplete");
  const table = name => context.admin.database.schema("public").from(name);
  const read = async (query, label) => { const { data, error } = await query; ensure(!error && Array.isArray(data), label); return data; };
  const productIds = Object.values(ledger.products).map(p => p.id);
  const records = await read(table("cms_records").select("id,kind,slug,draft,version,published_revision_id,archived_at").in("id", productIds).limit(100), "record_read_failed");
  ensure(records.length === 42 && records.every(r => r.kind === "product" && !r.archived_at && r.published_revision_id), "product_publication_incomplete");
  const variants = await read(table("catalog_variants").select("id,product_id,sku,regular_paise,sale_paise,price_version,archived_at").in("product_id", productIds).limit(100), "variant_read_failed");
  ensure(variants.length === 42 && variants.every(v => !v.archived_at && v.regular_paise === null && v.sale_paise === null && Number(v.price_version) === 0), "operational_price_changed");
  const inventory = await read(table("inventory_balances").select("variant_id,available_quantity,version").in("variant_id", variants.map(v => v.id)).limit(100), "inventory_read_failed");
  ensure(inventory.length === 42 && inventory.every(i => i.available_quantity === 0 && Number(i.version) === 0), "operational_stock_changed");
  const categories = await read(table("cms_records").select("id,slug,published_revision_id,archived_at").in("id", Object.values(ledger.categories).map(c => c.id)).limit(10), "category_read_failed");
  ensure(categories.length === 5 && categories.every(c => !c.archived_at && c.published_revision_id), "category_publication_incomplete");
  const excluded = await read(table("cms_records").select("id").eq("kind", "product").in("slug", held.map(e => e.sourceIdentity.slug)).limit(3), "held_record_read_failed");
  ensure(excluded.length === 0, "missing_sku_record_was_imported");
  const get = async route => { const r = await fetch(context.appOrigin + route, { signal: AbortSignal.timeout(60000), cache: "no-store" }); ensure(r.ok, "public_request_failed"); return r.json(); };
  const entries = [];
  for (const source of eligible) {
    const tracked = ledger.products[source.sourceIdentity.sourceId];
    const record = records.find(r => r.id === tracked.id);
    ensure(record && !tracked.awaitingPublication && record.slug === source.sourceIdentity.slug, "source_record_mapping_changed");
    ensure(fingerprint(tracked.provenance.source) === fingerprint(source.sourceIdentity) &&
      fingerprint(tracked.provenance.priceObservations) === fingerprint(source.privateSourcePriceObservations), "source_provenance_changed");
    const expectedMedia = source.gallery.map(a => {
      const item = prepared.find(p => p.sourceId === source.sourceIdentity.sourceId && p.assetId === a.assetId && p.sourceSha256 === a.sha256);
      ensure(item && ledger.media[item.key], "gallery_mapping_missing"); return ledger.media[item.key].id;
    });
    const detail = (await get(`/api/published/products/${encodeURIComponent(source.sourceIdentity.slug)}`)).record;
    ensure(detail && detail.id === tracked.id && !('sourceReview' in detail.document) &&
      fingerprint(detail.document.sourceObservation) === fingerprint(source.publicSourceObservation), "public_source_document_changed");
    const mapped = parseDocument("products", { ...source.documentFields, categoryIds: detail.document.categoryIds, mediaIds: expectedMedia });
    ensure(mapped.ok, "source_fields_invalid");
    for (const key of Object.keys(source.documentFields).filter(k => !["blocks", "variants"].includes(k)))
      ensure(fingerprint(detail.document[key]) === fingerprint(mapped.value[key]), "public_source_claim_changed");
    ensure(fingerprint(detail.document.mediaIds) === fingerprint(expectedMedia) &&
      fingerprint(detail.document.blocks.filter(b => b.type === "image").map(b => b.mediaId)) === fingerprint(expectedMedia), "public_gallery_order_changed");
    ensure(fingerprint(detail.document.categoryIds) === fingerprint(source.sourceCategorySlugs.map(s => ledger.categories[s].id)), "category_membership_changed");
    ensure(detail.variants.length === 1 && detail.variants[0].sku === source.sourceIdentity.sourceSku && detail.variants[0].label === mapped.value.variants[0].label &&
      detail.variants.every(v => v.purchasable === false && v.regularPricePaise === null && v.effectivePricePaise === null && !v.isOnSale && v.availability === "unavailable"), "public_purchase_guard_failed");
    const list = await get(`/api/catalog?q=${encodeURIComponent(source.sourceIdentity.sourceSku)}&limit=48`);
    ensure(list.items.some(p => p.id === tracked.id && p.document.sourceObservation && !('sourceReview' in p.document)), "source_missing_from_catalog");
    entries.push({ title: source.sourceIdentity.title, disposition: "development-published-source-observation", images: expectedMedia.length, ownerReview: "pending" });
  }
  const mediaRows = [], mediaIds = Object.values(ledger.media).map(m => m.id);
  for (let start = 0; start < mediaIds.length; start += 40) mediaRows.push(...await read(
    table("cms_media").select("id,byte_size,mime_type,published,archived").in("id", mediaIds.slice(start, start + 40)).limit(40), "media_read_failed"));
  ensure(mediaRows.length === 96 && mediaRows.every(m => m.published && !m.archived && m.mime_type === "image/webp"), "media_publication_incomplete");
  // Two concurrent read-only downloads verify content; this is not a capacity exercise.
  for (let start = 0; start < prepared.length; start += 2) await Promise.all(prepared.slice(start, start + 2).map(async item => {
    const media = ledger.media[item.key], row = mediaRows.find(m => m.id === media?.id);
    ensure(row && row.byte_size === item.normalizedBytes, "media_size_changed");
    const response = await fetch(`${context.appOrigin}/api/media/${media.id}`, { signal: AbortSignal.timeout(60000) });
    ensure(response.ok && hash(Buffer.from(await response.arrayBuffer())) === item.normalizedSha256, "public_media_bytes_changed");
  }));
  entries.push(...held.map(e => ({ title: e.sourceIdentity.title, disposition: "held-outside-cms-missing-source-sku", sourceCategories: e.sourceCategorySlugs, ownerReview: "pending" })));
  const report = { scope: "development-only", checkedAt: new Date().toISOString(), sourceProducts: 44, publishedProducts: 42, heldProducts: 2,
    categories: 5, deliveredImages: 96, operationalPrices: "unset", operationalStock: "zero-unconfigured", sourceOwnerReview: "pending", entries };
  await fs.writeFile(path.join(work, "reconciliation-report.json"), JSON.stringify(report, null, 2));
  console.log("Catalog reconciliation passed: 42 development products, 2 SKU holds, 5 categories and 96 exact stored image deliveries.");
}

main().catch(error => { console.error(/^[a-z_]+$/.test(error.message) ? error.message : "catalog_reconciliation_stopped_safely"); process.exitCode = 1; });
