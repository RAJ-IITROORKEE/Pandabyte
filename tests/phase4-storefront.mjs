import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@insforge/sdk";
import sharp from "sharp";

import { ensureOwnedCleanup } from "./phase3-publishing.mjs";
import {
  appRequest,
  cleanFixtures,
  createFixtures,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "phase4-test-fixtures.json");
const fixtureCapabilities = ["catalog.edit", "content.edit", "content.publish", "orders.manage", "media.manage", "inquiries.manage"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND_FOR_MODULE = {
  products: "product", categories: "category", blog: "blog", pages: "page", faqs: "faq", team: "team",
  navigation: "navigation", contact: "contact", learn: "resource", videos: "video",
};
let lastRequestPath = "none";

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.name = "HarnessFailure";
    this.label = label;
  }
}

function ensure(condition, label) {
  if (!condition) throw new HarnessFailure(label);
}

function safeFailureLocation(error) {
  const errorName = typeof error?.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error.name) ? error.name : "UnknownError";
  const causeName = typeof error?.cause?.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error.cause.name) ? error.cause.name : "";
  const causeCode = typeof error?.cause?.code === "string" && /^[A-Z0-9_-]{1,64}$/.test(error.cause.code) ? error.cause.code : "";
  const stack = typeof error?.stack === "string" ? error.stack : "";
  const frames = [];
  for (const line of stack.split("\n").slice(1)) {
    const match = line.match(/(?:^|[\\/])([^\\/():]+?\.(?:c?js|mjs|tsx?|jsx?)):(\d+):\d+\)?$/i);
    if (!match) continue;
    frames.push(`${match[1]}:${match[2]}`);
    if (frames.length === 4) break;
  }
  const causeInfo = causeName || causeCode ? ` cause=${[causeName, causeCode].filter(Boolean).join("/")}` : "";
  return `${errorName}${causeInfo}${frames.length ? ` at ${frames.join(" <- ")}` : " (no source frames)"}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function table(client, name) {
  return client.database.schema("public").from(name);
}

async function rpc(client, name, args) {
  try {
    return await client.database.schema("public").rpc(name, args);
  } catch {
    return { data: null, error: true };
  }
}

function parseArguments() {
  const args = new Set(process.argv.slice(2));
  ensure([...args].every((arg) => arg === "--keep-fixtures" || arg === "--cleanup"), "invalid_command_line");
  ensure(!(args.has("--keep-fixtures") && args.has("--cleanup")), "invalid_command_line");
  return { keepFixtures: args.has("--keep-fixtures"), cleanupOnly: args.has("--cleanup") };
}

async function request(context, route, token, options = {}) {
  try { lastRequestPath = new URL(route, context.appOrigin).pathname; } catch { lastRequestPath = "invalid-route"; }
  const headers = new Headers(options.headers ?? {});
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", context.appOrigin);
    return appRequest(context.appOrigin, route, token, {
      ...options,
      body: JSON.stringify(options.json),
      headers,
    });
  }
  return appRequest(context.appOrigin, route, token, { ...options, headers });
}

async function jsonResponse(response, expectedStatus, label) {
  ensure(response.status === expectedStatus, label);
  return safeJson(response, `${label}_invalid_json`);
}

function titleFor(runId, suffix) {
  return `Phase3 ${runId} ${suffix}`;
}

function slugFor(runId, suffix) {
  return `p4-${runId.replaceAll("-", "")}-${suffix}`;
}

function commonDocument(runId, suffix, overrides = {}) {
  const title = titleFor(runId, suffix);
  return {
    title,
    slug: slugFor(runId, suffix),
    summary: `Disposable Phase 4 fixture summary ${runId} ${suffix}.`,
    blocks: [{ type: "paragraph", text: `Disposable Phase 4 body ${runId} ${suffix}.` }],
    seoTitle: `${title} SEO`,
    seoDescription: `Test-only metadata for ${runId} ${suffix}.`,
    ...overrides,
  };
}

function categoryDocument(runId, suffix, position = 0) {
  return commonDocument(runId, suffix, { parentId: null, position, mediaIds: [] });
}

function productDocument(runId, suffix, { titleSuffix = suffix, categoryIds = [], skuLabels, modelNumbers = [], summary } = {}) {
  const doc = commonDocument(runId, suffix, {
    title: titleFor(runId,titleSuffix),
    categoryIds,
    modelNumbers,
    variants: skuLabels.map(({ sku, label }) => ({ sku, label })),
    specifications: [],
    compatibility: [],
    kitContents: [],
    resources: [],
    mediaIds: [],
  });
  if (summary !== undefined) doc.summary = summary;
  return doc;
}

async function checkpoint(state) {
  const safe = {
    runId: state.runId,
    users: state.users.map(({ userId, email, sessionId, role, runId }) => ({ userId, email, sessionId, role, runId })),
    staffUserId: state.staffUserId,
    records: state.records,
    variants: state.variants,
    media: state.media,
    storageKeys: state.storageKeys,
    inquiries: state.inquiries,
  };
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
}

async function ensureNoExistingFixtureFile() {
  try {
    await readFile(fixturePath, "utf8");
    throw new HarnessFailure("phase4_fixture_file_already_exists_use_cleanup");
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    if (error?.code !== "ENOENT") throw new HarnessFailure("phase4_fixture_file_unavailable");
  }
}

async function grantFixtureCapabilities(context, state, auth) {
  for (const capability of [...fixtureCapabilities, "staff.manage"]) {
    const customerCheck = await rpc(auth.customer.database, "has_capability", { capability_name: capability });
    const staffCheck = await rpc(auth.staff.database, "has_capability", { capability_name: capability });
    ensure(!customerCheck.error && customerCheck.data === false, `customer_pregranted_${capability}`);
    ensure(!staffCheck.error && staffCheck.data === false, `staff_pregranted_${capability}`);
  }
  for (const capability of fixtureCapabilities) {
    const result = await rpc(context.admin, "set_staff_capability", {
      target_user_id: state.staffUserId,
      capability_name: capability,
      enabled: true,
      reason: `phase4 disposable fixture ${state.runId}`,
    });
    ensure(!result.error, `fixture_capability_grant_${capability}_failed`);
  }
  for (const capability of fixtureCapabilities) {
    const result = await rpc(auth.staff.database, "has_capability", { capability_name: capability });
    ensure(!result.error && result.data === true, `fixture_capability_${capability}_missing`);
  }
}

async function createRecord(context, state, auth, module, document) {
  ensure(document.title.startsWith(`Phase3 ${state.runId} `), "fixture_document_title_prefix_missing");
  const response = await request(context, `/api/admin/${module}`, auth.staff.appToken, {
    method: "POST",
    json: { document },
  });
  const body = await jsonResponse(response, 201, `create_${module}_failed`);
  const record = body.record;
  ensure(record?.id && record.kind === KIND_FOR_MODULE[module] && record.slug === document.slug, `create_${module}_shape_invalid`);
  state.records.push({ id: record.id, module, kind: record.kind, slug: record.slug });
  for (const variant of record.document?.variants ?? []) {
    ensure(variant.id && typeof variant.sku === "string", "created_variant_shape_invalid");
    state.variants.push({ id: variant.id, productId: record.id, sku: variant.sku });
  }
  await checkpoint(state);
  return record;
}

async function updateRecord(context, state, auth, module, record, document) {
  ensure(document.title.startsWith(`Phase3 ${state.runId} `), "fixture_document_title_prefix_missing");
  await checkpoint(state);
  const response = await request(context, `/api/admin/${module}/${record.id}`, auth.staff.appToken, {
    method: "PATCH",
    json: { expectedVersion: record.version, document },
  });
  const body = await jsonResponse(response, 200, `update_${module}_failed`);
  const next = body.record;
  const tracked = state.records.find((item) => item.id === record.id);
  ensure(next?.id === record.id && tracked, `update_${module}_shape_invalid`);
  tracked.slug = next.slug;
  await checkpoint(state);
  return next;
}

async function transition(context, auth, module, record, action) {
  const response = await request(context, `/api/admin/${module}/${record.id}/${action}`, auth.staff.appToken, {
    method: "POST",
    json: { expectedVersion: record.version },
  });
  const body = await jsonResponse(response, 200, `${action}_${module}_failed`);
  ensure(body.record?.id === record.id, `${action}_${module}_shape_invalid`);
  return body.record;
}

async function setPrice(context, auth, variant, { regularPaise, salePaise = null, saleFrom = null, saleUntil = null }) {
  const response = await request(context, `/api/admin/pricing/${variant.id}`, auth.staff.appToken, {
    method: "PATCH",
    json: {
      expectedVersion: 0,
      regularPaise,
      salePaise,
      saleFrom,
      saleUntil,
      reason: `Phase3 ${variant.sku} Phase 4 storefront fixture price`,
    },
  });
  const body = await jsonResponse(response, 200, "fixture_price_set_failed");
  ensure(body.variant?.id === variant.id && body.variant.regularPaise === regularPaise && body.variant.priceVersion === 1,
    "fixture_price_response_invalid");
  return body.variant;
}

async function adjustStock(context, auth, variant, delta) {
  const requestId = randomUUID();
  const patch = {
    expectedVersion: 0,
    delta,
    reason: `Phase3 ${variant.sku} Phase 4 storefront fixture stock`,
    requestId,
  };
  const response = await request(context, `/api/admin/inventory/${variant.id}`, auth.staff.appToken, {
    method: "PATCH",
    json: patch,
  });
  const body = await jsonResponse(response, 200, "fixture_stock_adjustment_failed");
  ensure(body.variant?.id === variant.id && body.variant.stock === delta && body.variant.stockVersion === 1,
    "fixture_stock_response_invalid");
  return body.variant;
}

async function publicCatalog(context, query, label = "catalog_query_failed") {
  const response = await request(context, `/api/catalog${query ? `?${query}` : ""}`, null);
  ensure(response.status === 200, `${label}_http_${response.status}`);
  const body = await safeJson(response, `${label}_invalid_json`);
  ensure(response.headers.get("cache-control")?.includes("no-store"), "catalog_api_cacheable");
  ensure(Array.isArray(body.items) && Number.isSafeInteger(body.total), `${label}_shape_invalid`);
  return body;
}

async function createProducts(context, state, auth) {
  const tag = state.runId.replaceAll("-", "").slice(0, 8).toUpperCase();
  const needle = `P4X-C6-${tag}`;
  const skuA = `P4-${tag}-X-C6`;
  const skuB = `P4-${tag}-B-3000`;
  const skuTwo = `C3-${tag}-1500`;
  const skuThree = `P4-${tag}-B-2000`;
  const skuDraft = `P4-${tag}-DRAFT-500`;
  const categoryA = await createRecord(context, state, auth, "categories", categoryDocument(state.runId, "category-a", 1));
  const categoryB = await createRecord(context, state, auth, "categories", categoryDocument(state.runId, "category-b", 2));
  const publishedCategoryA = await transition(context, auth, "categories", categoryA, "publish");
  const publishedCategoryB = await transition(context, auth, "categories", categoryB, "publish");

  const p1 = await createRecord(context, state, auth, "products", productDocument(state.runId, "product-one", {
    categoryIds: [categoryA.id],
    skuLabels: [{ sku: skuA, label: "Model C6 sale variant" }, { sku: skuB, label: "Model C6 unavailable variant" }],
    modelNumbers: [needle],
    summary: `Phase3 ${state.runId} published product one summary.`,
  }));
  const p2 = await createRecord(context, state, auth, "products", productDocument(state.runId, "product-two", {
    categoryIds: [categoryA.id],
    titleSuffix: `product-two containing ${needle}`,
    skuLabels: [{ sku: skuTwo, label: "C3 fixture variant" }],
    modelNumbers: [`C3-${tag}`],
    summary: `Phase3 ${state.runId} published product two summary.`,
  }));
  const p3 = await createRecord(context, state, auth, "products", productDocument(state.runId, "product-three", {
    categoryIds: [categoryB.id],
    skuLabels: [{ sku: skuThree, label: "C3 category B fixture variant" }],
    modelNumbers: [`C3-${tag}-B`],
    summary: `Phase3 ${state.runId} published product three summary.`,
  }));
  const draft = await createRecord(context, state, auth, "products", productDocument(state.runId, "draft-product", {
    categoryIds: [categoryA.id],
    skuLabels: [{ sku: skuDraft, label: "Draft fixture variant" }],
    modelNumbers: [`DRAFT-${tag}-OLD`],
    summary: `Phase3 ${state.runId} initial draft summary.`,
  }));

  const bySku = new Map(state.variants.map((variant) => [variant.sku, variant]));
  const saleFrom = new Date(Date.now() - 60 * 60_000).toISOString();
  const saleUntil = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const pricing = new Map();
  pricing.set(skuA, await setPrice(context, auth, bySku.get(skuA), { regularPaise: 100_000, salePaise: 80_000, saleFrom, saleUntil }));
  pricing.set(skuB, await setPrice(context, auth, bySku.get(skuB), { regularPaise: 300_000 }));
  pricing.set(skuTwo, await setPrice(context, auth, bySku.get(skuTwo), { regularPaise: 150_000 }));
  pricing.set(skuThree, await setPrice(context, auth, bySku.get(skuThree), { regularPaise: 200_000 }));
  pricing.set(skuDraft, await setPrice(context, auth, bySku.get(skuDraft), { regularPaise: 50_000 }));
  const inventory = new Map();
  inventory.set(skuA, await adjustStock(context, auth, bySku.get(skuA), 2));
  inventory.set(skuThree, await adjustStock(context, auth, bySku.get(skuThree), 2));

  const published = new Map();
  for (const [key, record] of [["p1", p1], ["p2", p2], ["p3", p3]]) {
    published.set(key, await transition(context, auth, "products", record, "publish"));
  }
  return {
    tag,
    needle,
    skus: { skuA, skuB, skuTwo, skuThree, skuDraft },
    categories: { a: publishedCategoryA, b: publishedCategoryB },
    products: { p1: published.get("p1"), p2: published.get("p2"), p3: published.get("p3"), draft },
    variantBySku: bySku,
    pricing,
    inventory,
  };
}

async function verifyCatalogQueries(context, state, auth, setup) {
  const marker = encodeURIComponent(state.runId);
  const pricingResponse = await request(context, `/api/admin/pricing?q=${marker}&limit=100`, auth.staff.appToken);
  const pricingBody = await jsonResponse(pricingResponse, 200, "fixture_pricing_read_failed");
  const priceBySku = new Map(asArray(pricingBody.items).map((variant) => [variant.sku, variant]));
  ensure(pricingBody.total >= 5 && priceBySku.get(setup.skus.skuA)?.regularPaise === 100_000 &&
    priceBySku.get(setup.skus.skuA)?.salePaise === 80_000 && priceBySku.get(setup.skus.skuB)?.regularPaise === 300_000 &&
    priceBySku.get(setup.skus.skuTwo)?.regularPaise === 150_000 && priceBySku.get(setup.skus.skuThree)?.regularPaise === 200_000,
  "fixture_price_values_invalid");
  const inventoryResponse = await request(context, `/api/admin/inventory?q=${marker}&limit=100`, auth.staff.appToken);
  const inventoryBody = await jsonResponse(inventoryResponse, 200, "fixture_inventory_read_failed");
  const stockBySku = new Map(asArray(inventoryBody.items).map((variant) => [variant.sku, variant]));
  ensure(inventoryBody.total >= 5 && stockBySku.get(setup.skus.skuA)?.stock === 2 &&
    stockBySku.get(setup.skus.skuB)?.stock === 0 && stockBySku.get(setup.skus.skuTwo)?.stock === 0 &&
    stockBySku.get(setup.skus.skuThree)?.stock === 2,
  "fixture_stock_values_invalid");

  const baseline = await publicCatalog(context, `q=${marker}&sort=title_asc&limit=12`);
  ensure(baseline.total === 3 && baseline.items.length === 3, "run_id_catalog_scope_includes_draft_or_foreign_record");
  ensure(baseline.items.every((item) => item.title.startsWith(`Phase3 ${state.runId} `)), "catalog_returned_nonfixture_product");
  ensure(baseline.items.every((item) => !item.document?.blocks?.length), "catalog_list_returned_rich_blocks");

  const exactModel = await publicCatalog(context, `q=${encodeURIComponent(setup.needle.toLowerCase())}`);
  ensure(exactModel.items[0]?.id === setup.products.p1.id && exactModel.items.some((item) => item.id === setup.products.p2.id),
    "exact_model_did_not_rank_ahead_of_title_match");
  const punctuatedSku = await publicCatalog(context, `q=${encodeURIComponent(setup.skus.skuA.toLowerCase())}`);
  ensure(punctuatedSku.total === 1 && punctuatedSku.items[0]?.id === setup.products.p1.id, "normalized_punctuated_sku_search_failed");
  const emptyPriceBounds = await publicCatalog(context,
    `q=${encodeURIComponent(setup.skus.skuA)}&min=&max=&availability=all&sort=relevance&limit=12&page=1`);
  ensure(emptyPriceBounds.total === 1 && emptyPriceBounds.items[0]?.id === setup.products.p1.id,
    "empty_optional_price_bounds_rejected_or_filtered");
  const suffix = await publicCatalog(context, `q=${encodeURIComponent(`C6-${setup.tag}`)}`);
  ensure(suffix.items.some((item) => item.id === setup.products.p1.id), "model_suffix_search_failed");

  const categoryA = await publicCatalog(context, `q=${marker}&category=${encodeURIComponent(setup.categories.a.slug)}`);
  ensure(categoryA.total === 2, "category_a_filter_count_invalid");
  const categoryB = await publicCatalog(context, `q=${marker}&category=${encodeURIComponent(setup.categories.b.slug)}`);
  ensure(categoryB.total === 1 && categoryB.items[0]?.id === setup.products.p3.id, "category_b_filter_invalid");
  const categoryOr = await publicCatalog(context,
    `q=${marker}&category=${encodeURIComponent(setup.categories.a.slug)}&category=${encodeURIComponent(setup.categories.b.slug)}`);
  ensure(categoryOr.total === 3, "repeated_category_filters_not_or_combined");

  const priceSorted = await publicCatalog(context, `q=${marker}&sort=price_asc`);
  ensure(priceSorted.items.map((item) => item.id).join(",") === [setup.products.p1.id, setup.products.p2.id, setup.products.p3.id].join(","),
    "price_sort_did_not_use_effective_variant_price");
  ensure(priceSorted.items[0].variants[0]?.effectivePricePaise === 80_000 && priceSorted.items[0].variants[0]?.isOnSale === true,
    "catalog_card_sale_price_projection_invalid");

  const unavailableRange = await publicCatalog(context,
    `q=${marker}&category=${setup.categories.a.slug}&category=${setup.categories.b.slug}&min=2500&max=3500&availability=unavailable&sort=price_asc`);
  ensure(unavailableRange.total === 1 && unavailableRange.items[0]?.id === setup.products.p1.id,
    "combined_category_price_availability_filter_invalid");
  ensure(unavailableRange.items[0].variants.length === 1 && unavailableRange.items[0].variants[0].sku === setup.skus.skuB &&
    unavailableRange.items[0].variants[0].availability === "unavailable" && unavailableRange.items[0].variants[0].effectivePricePaise === 300_000,
  "matching_unavailable_variant_not_narrowed");
  const availableSameRange = await publicCatalog(context,
    `q=${marker}&min=2500&max=3500&availability=available`);
  ensure(availableSameRange.total === 0, "availability_filter_used_out_of_range_variant");
  const noPriceMatch = await publicCatalog(context, `q=${marker}&min=8000&max=9000`);
  ensure(noPriceMatch.total === 0 && noPriceMatch.items.length === 0, "empty_price_range_not_empty");
  const unknownCategory = await publicCatalog(context, `category=not-a-${setup.tag.toLowerCase()}-category`);
  ensure(unknownCategory.total === 0, "unknown_category_expanded_to_all_products");

  const all = await publicCatalog(context, `q=${marker}&sort=title_asc&limit=12`);
  const paged = [];
  for (let page = 1; page <= 3; page += 1) {
    const response = await publicCatalog(context, `q=${marker}&sort=title_asc&limit=1&page=${page}`);
    ensure(response.total === 3 && response.items.length === 1, "catalog_page_total_or_size_invalid");
    paged.push(response.items[0].id);
  }
  ensure(paged.join(",") === all.items.map((item) => item.id).join(",") && new Set(paged).size === 3,
    "stable_catalog_pagination_invalid");

  const invalidQueries = [
    `q=${marker}&q=${marker}`,
    `q=${marker}&unexpected=1`,
    `q=${marker}&min=-1`,
    `q=${marker}&sort=price`,
    `q=${marker}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}&category=${setup.categories.a.slug}`,
  ];
  for (let index = 0; index < invalidQueries.length; index += 1) {
    const response = await request(context, `/api/catalog?${invalidQueries[index]}`, null);
    ensure(response.status === 400, `invalid_catalog_query_${index}_accepted`);
  }
}

async function verifyAnonymousBoundaries(context, state, auth, setup) {
  const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
  ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
  const anon = createClient({
    baseUrl: context.baseUrl,
    anonKey,
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
  const query = await rpc(anon, "published_list_products", {
    p_query: state.runId,
    p_category_ids: [],
    p_min_price_paise: null,
    p_max_price_paise: null,
    p_availability: "all",
    p_sort: "relevance",
    p_limit: 12,
    p_offset: 0,
  });
  ensure(!query.error && Array.isArray(query.data?.items) && query.data.items.length === 3, "anonymous_public_catalog_rpc_failed");
  ensure(query.data.items.every((item) => !item.document?.blocks && !JSON.stringify(item).includes("inventory")),
    "anonymous_catalog_projection_exposed_large_or_private_fields");

  const content = await rpc(anon, "published_list_content", {
    p_kind: "product", p_query: state.runId, p_placement: "", p_collection: "", p_product_id: null, p_limit: 20, p_offset: 0,
  });
  ensure(!content.error && content.data?.total === 3 && content.data.items.some((item) => item.id === setup.products.p1.id),
    "anonymous_public_content_rpc_failed");
  ensure(content.data.items.every((item) => !item.document?.blocks), "anonymous_content_projection_includes_blocks");

  const unauthorizedRpc = await rpc(anon, "admin_list_records", {
    p_kind: "product", p_query: "", p_limit: 1, p_offset: 0,
  });
  ensure(Boolean(unauthorizedRpc.error), "anonymous_admin_rpc_allowed");
  const privateHelper = await rpc(anon, "admin_assert_capability", { p_capability: "catalog.edit" });
  ensure(Boolean(privateHelper.error), "anonymous_private_capability_helper_allowed");

  for (const [name, columns] of [
    ["cms_records", "id,kind"], ["cms_revisions", "id,record_id"], ["catalog_variants", "id,sku"],
    ["inventory_balances", "variant_id,available_quantity"], ["catalog_search_documents", "product_id,identifiers"],
  ]) {
    const result = await anon.database.schema("public").from(name).select(columns).limit(5);
    if (!result.error) ensure(asArray(result.data).length === 0, `anonymous_${name}_table_exposed`);
  }

  for (const route of ["/api/admin/products?limit=1", "/api/admin/pricing?limit=1", "/api/admin/inventory?limit=1", "/api/admin/inquiries?limit=1"]) {
    const denied = await request(context, route, auth.customer.appToken);
    ensure(denied.status === 403, `customer_admin_access_allowed_${route.split("?")[0]}`);
  }
  const anonAdmin = await request(context, "/api/admin/products?limit=1", null);
  ensure(anonAdmin.status === 401, "anonymous_admin_api_allowed");
  void setup;
}

async function verifyDraftAndRepublish(context, state, auth, setup) {
  const draft = setup.products.draft;
  const draftMarker = `DRAFT-${setup.tag}-OLD`;
  const newDraftModel = `DRAFT-${setup.tag}-NEW`;
  ensure((await publicCatalog(context, `q=${draftMarker}`)).total === 0, "unpublished_product_model_searchable");
  const newSummary = `Phase3 ${state.runId} changed draft summary.`;
  const editedDraft = await updateRecord(context, state, auth, "products", draft, {
    ...draft.document,
    summary: newSummary,
    modelNumbers: [newDraftModel],
    blocks: [{ type: "paragraph", text: `Updated private draft body ${state.runId}.` }],
  });
  const draftSearch = await publicCatalog(context, `q=${newDraftModel}`);
  ensure(draftSearch.total === 0 && !(await publicCatalog(context, `q=${encodeURIComponent(state.runId)}`)).items.some((item) => item.id === draft.id),
    "edited_draft_entered_public_catalog");
  const draftDetail = await request(context, `/api/published/products/${draft.slug}`, null);
  ensure(draftDetail.status === 404, "unpublished_edited_draft_detail_public");
  await checkpoint(state);
  const publishedDraft = await transition(context, auth, "products", editedDraft, "publish");
  const nowPublished = await publicCatalog(context, `q=${newDraftModel}`);
  ensure(nowPublished.items.some((item) => item.id === draft.id && item.summary === newSummary), "published_draft_update_not_searchable");
  await checkpoint(state);
  const withdrawnDraft = await transition(context, auth, "products", publishedDraft, "unpublish");
  ensure(withdrawnDraft.id === draft.id && !(await publicCatalog(context, `q=${newDraftModel}`)).items.some((item) => item.id === draft.id),
    "unpublished_draft_fixture_remains_searchable");

  const live = setup.products.p1;
  const oldSlug = live.slug;
  const oldModel = setup.needle;
  const newModel = `P4UPDATED-C7-${setup.tag}`;
  const newSlug = oldSlug === slugFor(state.runId, "product-one")
    ? slugFor(state.runId, "product-one-revised")
    : slugFor(state.runId, `product-one-republished-${Date.now().toString(36)}`);
  const updatedLive = await updateRecord(context, state, auth, "products", live, {
    ...live.document,
    slug: newSlug,
    summary: `Phase3 ${state.runId} republished product one summary.`,
    modelNumbers: [newModel],
  });
  const oldStillLive = await publicCatalog(context, `q=${encodeURIComponent(oldModel)}`);
  ensure(oldStillLive.items.some((item) => item.id === live.id), "live_search_changed_before_publish");
  ensure(!(await publicCatalog(context, `q=${encodeURIComponent(newModel)}`)).items.some((item) => item.id === live.id),
    "draft_model_searchable_before_publish");
  await checkpoint(state);
  const republished = await transition(context, auth, "products", updatedLive, "publish");
  const newLiveSearch = await publicCatalog(context, `q=${encodeURIComponent(newModel)}`);
  ensure(newLiveSearch.items.some((item) => item.id === live.id && item.summary === `Phase3 ${state.runId} republished product one summary.`),
    "republished_model_or_summary_not_projected");
  ensure(!(await publicCatalog(context, `q=${encodeURIComponent(oldModel)}`)).items.some((item) => item.id === live.id),
    "old_model_remained_after_republish");
  const oldRoute = await request(context, `/api/published/products/${oldSlug}`, null, { redirect: "manual" });
  ensure(oldRoute.status === 307 && oldRoute.headers.get("location")?.endsWith(encodeURIComponent(newSlug)), "republished_slug_redirect_missing");
  const newProductPage = await page(context, `/products/${newSlug}`, "republished_product_page");
  assertHtmlContains(newProductPage.html, newModel, "republished_model_missing_from_product_page");
  assertCanonical(newProductPage.html, `/products/${newSlug}`, "republished_product_page");
  const liveSitemapPage = await request(context, "/sitemap/0.xml", null, { headers: { accept: "application/xml,text/xml" } });
  ensure(liveSitemapPage.status === 200, "live_sitemap_page_http_failed");
  const liveSitemapXml = await liveSitemapPage.text();
  const sitemapPaths = [...liveSitemapXml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, location]) => {
    try { return new URL(location).pathname; } catch { return ""; }
  });
  ensure(sitemapPaths.includes(`/products/${newSlug}`) && !sitemapPaths.includes(`/products/${oldSlug}`),
    "sitemap_includes_historical_slug_or_misses_canonical");
  await checkpoint(state);
  const withdrawn = await transition(context, auth, "products", republished, "unpublish");
  ensure(withdrawn.id === live.id, "unpublish_response_invalid");
  ensure(!(await publicCatalog(context, `q=${encodeURIComponent(newModel)}`)).items.some((item) => item.id === live.id),
    "unpublished_product_remains_searchable");
  const withdrawnDetail = await request(context, `/api/published/products/${newSlug}`, null);
  ensure(withdrawnDetail.status === 404, "unpublished_product_detail_remains_public");
  return { draftSlug: draft.slug, oldSlug, newSlug, oldModel, newModel };
}

async function moduleSlugIsAvailable(context, auth, module, slug) {
  const pageSize = 100;
  let offset = 0;
  let total = null;
  do {
    const response = await request(context, `/api/admin/${module}?limit=${pageSize}&offset=${offset}`, auth.staff.appToken);
    const body = await jsonResponse(response, 200, `singleton_preflight_${module}_failed`);
    if (!Array.isArray(body.items) || !Number.isSafeInteger(body.total)) throw new HarnessFailure(`singleton_preflight_${module}_shape_invalid`);
    total = body.total;
    if (body.items.some((record) => record.slug === slug)) return false;
    offset += pageSize;
  } while (offset < total && offset <= 10_000);
  return total <= 10_000;
}

async function createEditorialFixtures(context, state, auth, setup) {
  const created = {};
  for (const slug of ["home", "help", "about"]) {
    if (!await moduleSlugIsAvailable(context, auth, "pages", slug)) {
      console.log(`Phase 4 storefront: skipped the ${slug} page fixture because that canonical slot is already occupied.`);
      created[slug] = null;
      continue;
    }
    const page = await createRecord(context, state, auth, "pages", commonDocument(state.runId, `page-${slug}`, { slug }));
    created[slug] = await transition(context, auth, "pages", page, "publish");
  }

  const blogTag = `phase4-${state.runId}`;
  const draftOnlyBlogTag = `draft-${state.runId}`;
  const blog = await createRecord(context, state, auth, "blog", commonDocument(state.runId, "blog", {
    author: `Phase3 ${state.runId} staff fixture`, tags: ["phase4", blogTag], mediaIds: [],
  }));
  created.blog = await transition(context, auth, "blog", blog, "publish");
  created.blogTag = blogTag;
  created.draftBlog = await createRecord(context, state, auth, "blog", commonDocument(state.runId, "blog-draft", {
    author: `Phase3 ${state.runId} draft fixture`, tags: [draftOnlyBlogTag], mediaIds: [],
  }));
  created.draftOnlyBlogTag = draftOnlyBlogTag;

  const faq = await createRecord(context, state, auth, "faqs", commonDocument(state.runId, "faq", {
    answer: `Phase3 ${state.runId} FAQ answer.`, topic: "phase4-test", placements: ["home", "help"], position: 1,
  }));
  created.faq = await transition(context, auth, "faqs", faq, "publish");

  const team = await createRecord(context, state, auth, "team", commonDocument(state.runId, "team-profile", {
    name: titleFor(state.runId, "team name"), role: "Disposable test profile", bio: `Phase3 ${state.runId} team bio.`,
    mediaIds: [], links: [], position: 1,
  }));
  created.team = await transition(context, auth, "team", team, "publish");

  const resource = await createRecord(context, state, auth, "learn", commonDocument(state.runId, "resource", {
    url: `https://example.com/phase4-resource-${setup.tag.toLowerCase()}`,
    productIds: [setup.products.p2.id], position: 1, collection: "product-specs",
  }));
  created.resource = await transition(context, auth, "learn", resource, "publish");

  const video = await createRecord(context, state, auth, "videos", commonDocument(state.runId, "video", {
    url: "https://youtu.be/AAAAAAAAAAA", productIds: [setup.products.p3.id], position: 1,
  }));
  created.video = await transition(context, auth, "videos", video, "publish");

  if (await moduleSlugIsAvailable(context, auth, "navigation", "primary")) {
    const nav = await createRecord(context, state, auth, "navigation", commonDocument(state.runId, "primary-navigation", {
      slug: "primary", links: [{ label: titleFor(state.runId, "nav item"), href: `/blog/${created.blog.slug}`, group: "header", position: 1, visible: true }],
    }));
    created.navigation = await transition(context, auth, "navigation", nav, "publish");
  } else {
    console.log("Phase 4 storefront: skipped the primary navigation fixture because that singleton is already occupied.");
    created.navigation = null;
  }

  if (await moduleSlugIsAvailable(context, auth, "contact", "contact")) {
    const officeAddress = titleFor(state.runId, "fixture office address");
    const contact = await createRecord(context, state, auth, "contact", commonDocument(state.runId, "contact-details", {
      slug: "contact", email: `${state.runId}@phase3-test.example`, phone: "+91 00000 00000",
      address: officeAddress, hours: "Test only", timezone: "Asia/Kolkata", socialLinks: [],
      blocks: [{ type: "paragraph", text: officeAddress }],
    }));
    created.contact = await transition(context, auth, "contact", contact, "publish");
  } else {
    console.log("Phase 4 storefront: skipped the contact singleton fixture because that canonical slot is already occupied.");
    created.contact = null;
  }

  return created;
}

async function verifyBlogTopics(context, state, editorial) {
  const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
  ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
  const anon = createClient({ baseUrl: context.baseUrl, anonKey, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
  const tagged = await rpc(anon, "published_list_blog", {
    p_query: state.runId, p_tag: editorial.blogTag, p_limit: 12, p_offset: 0,
  });
  ensure(!tagged.error && tagged.data?.total === 1 && tagged.data.items?.length === 1 &&
    tagged.data.items[0]?.id === editorial.blog.id && !tagged.data.items.some((item) => item.id === editorial.draftBlog.id),
  "published_blog_topic_rpc_included_draft_or_missed_live_post");
  const tags = await rpc(anon, "published_blog_tags", {});
  ensure(!tags.error && Array.isArray(tags.data) && tags.data.includes(editorial.blogTag) &&
    !tags.data.includes(editorial.draftOnlyBlogTag), "published_blog_tag_options_included_draft_topic");
  const missingTag = await rpc(anon, "published_list_blog", {
    p_query: state.runId, p_tag: `${editorial.blogTag}-missing`, p_limit: 12, p_offset: 0,
  });
  ensure(!missingTag.error && missingTag.data?.total === 0 && missingTag.data.items?.length === 0,
    "unknown_published_blog_topic_not_empty");
}

async function createProductGalleryMedia(context, state, auth, setup) {
  const fixtures = [
    { name: "green", color: { r: 46, g: 142, b: 104 } },
    { name: "blue", color: { r: 44, g: 101, b: 174 } },
  ];
  const uploaded = [];
  for (const fixture of fixtures) {
    const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: fixture.color } }).png().toBuffer();
    const altText = `Synthetic Phase 4 test image ${state.runId} ${fixture.name}; not product imagery.`;
    const form = new FormData();
    form.set("file", new File([bytes], `phase4-${fixture.name}.png`, { type: "image/png" }));
    form.set("altText", altText);
    form.set("source", `Synthetic Phase 4 test fixture ${state.runId}; not hardware imagery.`);
    const response = await request(context, "/api/admin/media", auth.staff.appToken, {
      method: "POST", headers: { origin: context.appOrigin }, body: form,
    });
    const body = await jsonResponse(response, 201, "product_gallery_media_upload_failed");
    const media = body.media;
    ensure(media?.id && media.mimeType === "image/webp" && media.width === 8 && media.height === 6 && media.altText === altText,
      "product_gallery_media_upload_dto_invalid");
    const metadata = await table(context.admin, "cms_media").select("id,object_key,created_by,alt_text").eq("id", media.id).limit(1);
    const row = asArray(metadata.data)[0];
    ensure(!metadata.error && row?.id === media.id && row.created_by === state.staffUserId &&
      row.object_key === `assets/${media.id}.webp` && row.alt_text === altText && row.alt_text.includes(state.runId),
    "product_gallery_media_metadata_or_ownership_invalid");
    state.media.push({ id: row.id, key: row.object_key, altText: row.alt_text });
    await checkpoint(state);
    uploaded.push({ ...media, key: row.object_key });
  }

  const published = [];
  for (const media of uploaded) {
    const response = await request(context, `/api/admin/media/${media.id}`, auth.staff.appToken, {
      method: "PATCH",
      json: { expectedVersion: media.version, altText: media.altText, source: media.source, published: true },
    });
    const body = await jsonResponse(response, 200, "product_gallery_media_publish_failed");
    ensure(body.media?.id === media.id && body.media.published === true, "product_gallery_media_publish_invalid");
    published.push(body.media);
  }

  const product = setup.products.p2;
  const mediaIds = published.map(({ id }) => id);
  const imageBlocks = published.map((media) => ({ type: "image", mediaId: media.id, alt: media.altText }));
  const edited = await updateRecord(context, state, auth, "products", product, {
    ...product.document,
    mediaIds,
    blocks: [...product.document.blocks.filter((block) => block.type !== "image"), ...imageBlocks],
  });
  setup.products.p2 = await transition(context, auth, "products", edited, "publish");
  return published;
}

async function page(context, route, label) {
  let response;
  try {
    response = await request(context, route, null, { cache: "no-store" });
  } catch (error) {
    console.error(`Phase 4 page request failed for ${label}: ${safeFailureLocation(error)}.`);
    throw new HarnessFailure(`${label}_request_failed`);
  }
  ensure(response.status === 200, `${label}_http_failed`);
  let html;
  try {
    html = await response.text();
  } catch (error) {
    console.error(`Phase 4 page response body read failed for ${label}: ${safeFailureLocation(error)}.`);
    throw new HarnessFailure(`${label}_body_read_failed`);
  }
  return { response, html };
}

function assertHtmlContains(html, value, label) {
  ensure(typeof html === "string" && typeof value === "string", `${label}_assertion_input_invalid`);
  const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
  ensure(html.includes(value) || html.includes(escaped), label);
}

function assertCanonical(html, route, label) {
  ensure(html.includes(`https://www.pandabyte.in${route}`) && html.includes("canonical"), `${label}_canonical_missing`);
}

function assertSeoTitle(html, title, label) {
  assertHtmlContains(html, `${title} SEO`, `${label}_seo_title_missing`);
}

async function verifyStorefrontPages(context, state, setup, editorial, slugChange) {
  const shop = await page(context, `/shop?q=${encodeURIComponent(state.runId)}&sort=price_asc`, "shop_page");
  assertHtmlContains(shop.html, titleFor(state.runId, "product-two containing"), "shop_catalog_cards_missing");
  assertHtmlContains(shop.html, "₹800", "shop_effective_sale_price_missing");
  assertCanonical(shop.html, "/shop", "shop_page");

  const productApi = await request(context, `/api/published/products/${setup.products.p1.slug}`, null);
  const productBody = await jsonResponse(productApi, 200, "published_product_detail_api_failed");
  const detail = productBody.record;
  ensure(detail?.variants?.length === 2, "published_product_variant_count_invalid");
  const saleVariant = detail.variants.find((variant) => variant.sku === setup.skus.skuA);
  ensure(saleVariant?.regularPricePaise === 100_000 && saleVariant.effectivePricePaise === 80_000 && saleVariant.isOnSale,
    "published_product_sale_variant_invalid");
  ensure(saleVariant.availability === "available" && detail.variants.find((variant) => variant.sku === setup.skus.skuB)?.availability === "unavailable",
    "published_product_availability_projection_invalid");
  const cardApi = await publicCatalog(context, `q=${encodeURIComponent(setup.skus.skuA)}`);
  const cardVariant = cardApi.items.find((item) => item.id === detail.id)?.variants?.find((variant) => variant.sku === setup.skus.skuA);
  ensure(cardVariant?.effectivePricePaise === saleVariant.effectivePricePaise && cardVariant.isOnSale === saleVariant.isOnSale,
    "catalog_card_and_product_detail_price_disagree");
  const productPage = await page(context, `/products/${setup.products.p1.slug}`, "product_detail_page");
  assertHtmlContains(productPage.html, setup.skus.skuA, "product_page_variant_sku_missing");
  assertHtmlContains(productPage.html, "₹800", "product_page_effective_price_missing");
  assertHtmlContains(productPage.html, "₹1,000", "product_page_regular_price_missing");
  assertCanonical(productPage.html, `/products/${setup.products.p1.slug}`, "product_detail_page");
  assertSeoTitle(productPage.html, setup.products.p1.title, "product_detail_page");

  const galleryPage = await page(context, `/products/${setup.products.p2.slug}`, "product_gallery_page");
  for (const media of state.media) assertHtmlContains(galleryPage.html, `/api/media/${media.id}`, "product_gallery_media_missing_from_page");
  assertHtmlContains(galleryPage.html, `Synthetic Phase 4 test image ${state.runId} green`, "product_gallery_green_alt_missing");
  assertHtmlContains(galleryPage.html, `Synthetic Phase 4 test image ${state.runId} blue`, "product_gallery_blue_alt_missing");
  assertHtmlContains(galleryPage.html, "not product imagery", "product_gallery_test_only_label_missing");

  const categoryRedirect = await request(context, `/shop/${setup.categories.a.slug}`, null, { redirect: "manual" });
  const redirectLocation = categoryRedirect.headers.get("location");
  const locationPath = redirectLocation ? new URL(redirectLocation, context.appOrigin).pathname : "";
  const locationMatches = locationPath === "/shop" && new URL(redirectLocation, context.appOrigin).searchParams.get("category") === setup.categories.a.slug;
  const expectedCategoryTarget = `/shop?category=${encodeURIComponent(setup.categories.a.slug)}`;
  let streamedRedirect = false;
  if (!([301, 308].includes(categoryRedirect.status) && locationMatches)) {
    let html = "";
    try { html = await categoryRedirect.clone().text(); } catch { /* Status and headers remain sufficient diagnostics. */ }
    const nextTarget = html.includes(`NEXT_REDIRECT;replace;${expectedCategoryTarget};308`);
    const refreshTarget = html.includes(`0;url=${expectedCategoryTarget}`);
    streamedRedirect = categoryRedirect.status === 200 && nextTarget && refreshTarget;
    if (!streamedRedirect) console.error(`Phase 4 legacy category redirect diagnostic: status=${categoryRedirect.status}, locationPath=${locationPath || "none"}, nextRedirect=${html.includes("NEXT_REDIRECT")}, refreshMeta=${/<meta[^>]+http-equiv=["']refresh/i.test(html)}, exactTarget=${nextTarget || refreshTarget}.`);
  }
  ensure(([301, 308].includes(categoryRedirect.status) && locationMatches) || streamedRedirect,
    "legacy_category_route_did_not_redirect");

  const home = await page(context, "/", "home_page");
  assertHtmlContains(home.html, titleFor(state.runId, "faq"), "homepage_fixture_faq_missing");
  if (editorial.home) assertHtmlContains(home.html, editorial.home.title, "homepage_fixture_title_missing");
  if (editorial.navigation) assertHtmlContains(home.html, titleFor(state.runId, "nav item"), "published_navigation_missing");

  const help = await page(context, "/help", "help_page");
  assertHtmlContains(help.html, titleFor(state.runId, "faq"), "help_faq_fixture_missing");
  if (editorial.help) {
    assertHtmlContains(help.html, editorial.help.title, "help_page_fixture_missing");
    assertCanonical(help.html, "/help", "help_page");
    assertSeoTitle(help.html, editorial.help.title, "help_page");
  }

  const about = await page(context, "/about", "about_page");
  assertHtmlContains(about.html, titleFor(state.runId, "team name"), "team_fixture_missing_from_about");
  if (editorial.about) {
    assertHtmlContains(about.html, editorial.about.title, "about_page_fixture_missing");
    assertCanonical(about.html, "/about", "about_page");
    assertSeoTitle(about.html, editorial.about.title, "about_page");
  }

  const blogList = await page(context, `/blog?q=${encodeURIComponent(state.runId)}`, "blog_list_page");
  assertHtmlContains(blogList.html, editorial.blog.title, "blog_fixture_missing_from_list");
  const topicPage = await page(context, `/blog?tag=${encodeURIComponent(editorial.blogTag)}`, "blog_topic_page");
  assertHtmlContains(topicPage.html, editorial.blog.title, "blog_topic_filter_missing_live_post");
  assertHtmlContains(topicPage.html, `value="${editorial.blogTag}"`, "blog_topic_dropdown_missing_live_tag");
  const emptyTopic = await page(context, `/blog?tag=${encodeURIComponent(`${editorial.blogTag}-missing`)}`, "blog_empty_topic_page");
  assertHtmlContains(emptyTopic.html, "No published articles match these filters.", "blog_nonmatching_topic_not_empty");
  ensure(!emptyTopic.html.includes(editorial.blog.title), "blog_nonmatching_topic_rendered_fixture");
  const blogDetail = await page(context, `/blog/${editorial.blog.slug}`, "blog_detail_page");
  assertHtmlContains(blogDetail.html, `Disposable Phase 4 body ${state.runId} blog.`, "blog_detail_body_missing");
  assertCanonical(blogDetail.html, `/blog/${editorial.blog.slug}`, "blog_detail_page");
  assertSeoTitle(blogDetail.html, editorial.blog.title, "blog_detail_page");

  const collection = await page(context, "/learn/product-specs", "resource_collection_page");
  assertHtmlContains(collection.html, editorial.resource.title, "resource_missing_from_collection");
  const resourceDetail = await page(context, `/learn/resources/${editorial.resource.slug}`, "resource_detail_page");
  assertHtmlContains(resourceDetail.html, `Disposable Phase 4 body ${state.runId} resource.`, "resource_detail_body_missing");
  assertCanonical(resourceDetail.html, `/learn/resources/${editorial.resource.slug}`, "resource_detail_page");
  assertSeoTitle(resourceDetail.html, editorial.resource.title, "resource_detail_page");

  const youtubeList = await page(context, "/learn/youtube", "youtube_list_page");
  assertHtmlContains(youtubeList.html, editorial.video.title, "video_missing_from_youtube_list");
  const youtubeDetail = await page(context, `/learn/youtube/${editorial.video.slug}`, "youtube_detail_page");
  assertHtmlContains(youtubeDetail.html, editorial.video.title, "video_detail_title_missing");
  assertCanonical(youtubeDetail.html, `/learn/youtube/${editorial.video.slug}`, "youtube_detail_page");
  assertSeoTitle(youtubeDetail.html, editorial.video.title, "youtube_detail_page");

  const contactPage = await page(context, "/contact", "contact_page");
  assertHtmlContains(contactPage.html, "Send a message", "contact_form_missing");
  if (editorial.contact) {
    assertHtmlContains(contactPage.html, titleFor(state.runId, "fixture office address"), "contact_fixture_missing");
    assertCanonical(contactPage.html, "/contact", "contact_page");
    assertSeoTitle(contactPage.html, editorial.contact.title, "contact_page");
  }
  void slugChange;
}

async function verifyInquiryFlow(context, state, auth) {
  const requestId = randomUUID();
  const inquiry = {
    challengeToken: "XXXX.DUMMY.TOKEN.XXXX",
    name: titleFor(state.runId, "contact sender"),
    email: `${state.runId}@phase3-test.example`,
    phone: "+91 00000 00000",
    subject: titleFor(state.runId, "storefront inquiry"),
    message: `Phase3 ${state.runId} disposable storefront inquiry message.`,
    idempotencyKey: requestId,
  };
  await checkpoint(state);
  const created = await request(context, "/api/contact", null, { method: "POST", json: inquiry });
  const createdBody = await jsonResponse(created, 201, "public_contact_submission_failed");
  ensure(UUID.test(createdBody.receipt) && createdBody.notificationStatus === "unconfigured", "public_contact_receipt_invalid");
  state.inquiries.push({ id: createdBody.receipt, requestId });
  await checkpoint(state);

  await checkpoint(state);
  const replay = await request(context, "/api/contact", null, { method: "POST", json: inquiry });
  const replayBody = await jsonResponse(replay, 201, "contact_idempotent_replay_failed");
  ensure(replayBody.receipt === createdBody.receipt, "contact_idempotency_created_duplicate");
  await checkpoint(state);
  const mismatch = await request(context, "/api/contact", null, { method: "POST", json: { ...inquiry, message: `${inquiry.message} changed` } });
  ensure(mismatch.status === 409, "contact_idempotency_payload_conflict_accepted");

  const list = await request(context, `/api/admin/inquiries?q=${encodeURIComponent(state.runId)}&limit=20`, auth.staff.appToken);
  const listBody = await jsonResponse(list, 200, "staff_inquiry_list_failed");
  ensure(listBody.total >= 1 && listBody.items.some((item) => item.id === createdBody.receipt), "staff_inquiry_list_missing_fixture");
  const detail = await request(context, `/api/admin/inquiries/${createdBody.receipt}`, auth.staff.appToken);
  const detailBody = await jsonResponse(detail, 200, "staff_inquiry_detail_failed");
  ensure(detailBody.inquiry?.message === inquiry.message && Array.isArray(detailBody.inquiry.notes), "staff_inquiry_detail_invalid");
  await checkpoint(state);
  const updated = await request(context, `/api/admin/inquiries/${createdBody.receipt}`, auth.staff.appToken, {
    method: "PATCH",
    json: { expectedVersion: detailBody.inquiry.version, status: "in_progress", note: `Phase3 ${state.runId} staff processing fixture.` },
  });
  const updatedBody = await jsonResponse(updated, 200, "staff_inquiry_update_failed");
  ensure(updatedBody.inquiry?.status === "in_progress" && updatedBody.inquiry.notes.length === 1, "staff_inquiry_update_shape_invalid");
  const customerRead = await request(context, `/api/admin/inquiries/${createdBody.receipt}`, auth.customer.appToken);
  ensure(customerRead.status === 403, "customer_inquiry_access_allowed");
}

async function verifySitemap(context, anon, state, setup, editorial, slugChange) {
  const direct = await rpc(anon, "published_sitemap", { p_limit: 1000, p_offset: 0 });
  ensure(!direct.error && Array.isArray(direct.data?.items) && Number.isSafeInteger(direct.data.total), "published_sitemap_rpc_failed");
  const paths = new Set(direct.data.items.map((item) => item.path));
  ensure(paths.has(`/products/${setup.products.p2.slug}`) && paths.has(`/products/${setup.products.p3.slug}`),
    "published_products_missing_from_sitemap");
  ensure(!paths.has(`/products/${setup.products.draft.slug}`), "draft_product_in_sitemap");
  ensure(!paths.has(`/products/${slugChange.oldSlug}`) && !paths.has(`/products/${slugChange.newSlug}`),
    "unpublished_product_or_historical_slug_in_sitemap");
  for (const pageRecord of [editorial.home, editorial.help, editorial.about]) {
    if (pageRecord) ensure(paths.has(pageRecord.slug === "home" ? "/" : `/${pageRecord.slug}`), "published_page_missing_from_sitemap");
  }
  ensure(paths.has(`/blog/${editorial.blog.slug}`) && paths.has(`/learn/resources/${editorial.resource.slug}`) &&
    paths.has(`/learn/youtube/${editorial.video.slug}`), "published_editorial_route_missing_from_sitemap");
  if (editorial.contact) ensure(paths.has("/contact"), "published_contact_missing_from_sitemap");

  const xmlIndex = await request(context, "/sitemap.xml", null, { headers: { accept: "application/xml,text/xml" } });
  ensure(xmlIndex.status === 200, "sitemap_index_http_failed");
  const indexBody = await xmlIndex.text();
  ensure(indexBody.includes("sitemap") && indexBody.includes("sitemap/0.xml"), "sitemap_index_shape_invalid");
  const xmlPage = await request(context, "/sitemap/0.xml", null, { headers: { accept: "application/xml,text/xml" } });
  ensure(xmlPage.status === 200, "sitemap_page_http_failed");
  const pageBody = await xmlPage.text();
  ensure(pageBody.includes(`/products/${setup.products.p2.slug}`) && pageBody.includes(`/blog/${editorial.blog.slug}`),
    "sitemap_xml_missing_published_fixture");
  ensure(!pageBody.includes(`/products/${setup.products.draft.slug}`) && !pageBody.includes(`/products/${slugChange.oldSlug}`),
    "sitemap_xml_contains_draft_or_alias");
}

async function verifyRecordPrefixBeforeCleanup(context, state) {
  const ids = [...new Set(state.records.map(({ id }) => id))];
  if (!ids.length) return;
  const { data, error } = await table(context.admin, "cms_records").select("id,kind,draft,created_by").in("id", ids);
  ensure(!error, "cleanup_record_prefix_check_failed");
  for (const row of asArray(data)) {
    const expected = state.records.find((record) => record.id === row.id);
    ensure(row.created_by === state.staffUserId && row.draft?.title?.startsWith(`Phase3 ${state.runId} `) && expected?.kind === row.kind,
      "cleanup_record_prefix_or_owner_mismatch");
  }
}

function validateStoredState(state) {
  ensure(state && UUID.test(state.runId) && Array.isArray(state.users) && state.users.length === 2 &&
    Array.isArray(state.records) && Array.isArray(state.variants) && Array.isArray(state.media) &&
    Array.isArray(state.storageKeys) && Array.isArray(state.inquiries) && typeof state.staffUserId === "string" && state.staffUserId.length > 0 && state.staffUserId.length <= 256, "invalid_phase4_fixture_file");
  ensure(state.users.every((fixture) => fixture.runId === state.runId && typeof fixture.userId === "string" && fixture.userId.length > 0 && fixture.userId.length <= 256 && typeof fixture.email === "string" &&
    typeof fixture.sessionId === "string" && ["customer", "staff"].includes(fixture.role)), "invalid_phase4_fixture_users");
  ensure(new Set(state.users.map(({ role }) => role)).size === 2 && state.users.some(({ role }) => role === "customer") &&
    state.users.some(({ role }) => role === "staff") && state.users.find(({ role }) => role === "staff").userId === state.staffUserId,
  "invalid_phase4_fixture_roles");
  for (const record of state.records) {
    ensure(UUID.test(record.id) && KIND_FOR_MODULE[record.module] === record.kind && typeof record.slug === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug), "invalid_phase4_fixture_record");
  }
  for (const variant of state.variants) ensure(UUID.test(variant.id) && UUID.test(variant.productId) && typeof variant.sku === "string", "invalid_phase4_fixture_variant");
  for (const inquiry of state.inquiries) ensure(UUID.test(inquiry.id) && UUID.test(inquiry.requestId), "invalid_phase4_fixture_inquiry");
}

async function cleanupStoredFixtures(context) {
  let state;
  try {
    state = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    throw new HarnessFailure("phase4_fixture_file_unavailable");
  }
  validateStoredState(state);
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  await verifyRecordPrefixBeforeCleanup(context, state);
  await ensureOwnedCleanup(context, state);
  await unlink(fixturePath);
  return state.users.length;
}

async function run(context, keepFixtures) {
  await ensureNoExistingFixtureFile();
  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [] };
  let auth = null;
  let primaryFailure = null;
  let activePhase = "fixture_creation";
  try {
    console.log("Phase 4 storefront: fixture_creation.");
    let fixtures;
    try {
      fixtures = await createFixtures(context.clerk, state.runId, (fixture) => state.users.push(fixture));
    } catch (error) {
      if (state.users.length) await checkpoint(state);
      throw error;
    }
    state.users = fixtures.users;
    state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
    auth = fixtures.auth;
    await checkpoint(state);

    activePhase = "fixture_capabilities";
    console.log("Phase 4 storefront: fixture_capabilities.");
    await grantFixtureCapabilities(context, state, auth);

    activePhase = "catalog_records_and_pricing";
    console.log("Phase 4 storefront: catalog_records_and_pricing.");
    const setup = await createProducts(context, state, auth);

    activePhase = "catalog_search_filters_and_sorting";
    console.log("Phase 4 storefront: catalog_search_filters_and_sorting.");
    await verifyCatalogQueries(context, state, auth, setup);

    activePhase = "anonymous_boundaries";
    console.log("Phase 4 storefront: anonymous_boundaries.");
    await verifyAnonymousBoundaries(context, state, auth, setup);

    activePhase = "editorial_publication";
    console.log("Phase 4 storefront: editorial_publication.");
    const editorial = await createEditorialFixtures(context, state, auth, setup);

    activePhase = "published_blog_topics";
    console.log("Phase 4 storefront: published_blog_topics.");
    await verifyBlogTopics(context, state, editorial);

    activePhase = "product_gallery_media";
    console.log("Phase 4 storefront: product_gallery_media.");
    await createProductGalleryMedia(context, state, auth, setup);

    activePhase = "storefront_pages_and_metadata";
    console.log("Phase 4 storefront: storefront_pages_and_metadata.");
    await verifyStorefrontPages(context, state, setup, editorial, null);

    activePhase = "draft_and_republish";
    console.log("Phase 4 storefront: draft_and_republish.");
    const slugChange = await verifyDraftAndRepublish(context, state, auth, setup);

    activePhase = "contact_inquiry_flow";
    console.log("Phase 4 storefront: contact_inquiry_flow.");
    await verifyInquiryFlow(context, state, auth);

    activePhase = "published_sitemap";
    console.log("Phase 4 storefront: published_sitemap.");
    const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
    ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
    const anon = createClient({ baseUrl: context.baseUrl, anonKey, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
    await verifySitemap(context, anon, state, setup, editorial, slugChange);

    const customerAccess = await request(context, "/api/admin/pricing?limit=1", auth.customer.appToken);
    ensure(customerAccess.status === 403, "customer_pricing_access_allowed");
    const inventoryCustomer = await request(context, "/api/admin/inventory?limit=1", auth.customer.appToken);
    ensure(inventoryCustomer.status === 403, "customer_inventory_access_allowed");
    console.log("Phase 4 storefront API and render assertions passed.");
  } catch (error) {
    console.error(`Phase 4 sanitized failure location: ${safeFailureLocation(error)}.`);
    primaryFailure = error instanceof HarnessFailure ? error : new HarnessFailure(`${activePhase}_failed`);
  } finally {
    if (state.users.length === 2) {
      if (keepFixtures) {
        try {
          await checkpoint(state);
          console.log("Disposable Phase 4 fixtures retained in .bootstrap/phase4-test-fixtures.json.");
        } catch {
          primaryFailure ??= new HarnessFailure("phase4_fixture_checkpoint_failed");
        }
      } else {
        try {
          for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
          await verifyRecordPrefixBeforeCleanup(context, state);
          await ensureOwnedCleanup(context, state);
          await unlink(fixturePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
          console.log("All verified Phase 4 storefront fixtures were removed.");
        } catch (error) {
          try { await checkpoint(state); } catch { /* Preserve the original failure label. */ }
          primaryFailure ??= error instanceof HarnessFailure ? error : new HarnessFailure("phase4_fixture_cleanup_failed");
        }
      }
    } else if (state.users.length > 0) {
      try {
        await cleanFixtures(context, state.users, state.runId);
      } catch {
        primaryFailure ??= new HarnessFailure("partial_fixture_cleanup_failed");
      }
    }
  }
  if (primaryFailure) throw primaryFailure;
}

async function main() {
  let args;
  try {
    args = parseArguments();
  } catch (error) {
    console.error(`Phase 4 storefront harness stopped safely: ${error instanceof HarnessFailure ? error.label : "invalid_command_line"}.`);
    process.exitCode = 2;
    return;
  }
  let context;
  try {
    context = await preflight();
  } catch (error) {
    console.error(`Phase 4 storefront preflight failed safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  if (args.cleanupOnly) {
    try {
      const count = await cleanupStoredFixtures(context);
      console.log(`Cleanup completed for ${count} verified disposable fixture users.`);
    } catch (error) {
      console.error(`Phase 4 storefront cleanup stopped safely: ${error instanceof HarnessFailure ? error.label : "phase4_cleanup_failed"}.`);
      process.exitCode = 1;
    }
    return;
  }
  try {
    await run(context, args.keepFixtures);
  } catch (error) {
    console.error(`Phase 4 storefront integration harness failed safely: ${error instanceof HarnessFailure ? error.label : "phase4_integration_failed"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export {
  lastRequestPath,
  safeFailureLocation,
  verifyAnonymousBoundaries,
  verifyBlogTopics,
  verifyCatalogQueries,
  verifyDraftAndRepublish,
  verifyInquiryFlow,
  verifySitemap,
  verifyStorefrontPages,
};
