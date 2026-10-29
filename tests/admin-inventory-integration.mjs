import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appRequest,
  cleanFixtures,
  createFixtures,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";
import { ensureOwnedCleanup } from "./phase3-publishing.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "admin-inventory-integration-fixtures.json");
const fixtureCapabilities = ["catalog.edit", "orders.manage"];

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.label = label;
  }
}

function ensure(condition, label) {
  if (!condition) throw new HarnessFailure(label);
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

function request(context, route, token, method = "GET", json) {
  const headers = new Headers();
  const options = { method, headers, signal: AbortSignal.timeout(30000) };
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", context.appOrigin);
    options.body = JSON.stringify(json);
  }
  return appRequest(context.appOrigin, route, token, options);
}

async function responseBody(response, status, label) {
  ensure(response.status === status, `${label}_status_${response.status}`);
  return safeJson(response, `${label}_json`);
}

function newState(runId = randomUUID()) {
  return { runId, users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [] };
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

async function removeFixtureCarts(context, state) {
  if (!state.users.length) return;
  const { error } = await table(context.admin, "customer_carts").delete().in("user_id", state.users.map(({ userId }) => userId));
  ensure(!error, "fixture_cart_cleanup_failed");
}

async function cleanup(context, state) {
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  await removeFixtureCarts(context, state);
  if (state.staffUserId) await ensureOwnedCleanup(context, state);
  else if (state.users.length) await cleanFixtures(context, state.users, state.runId);
  await unlink(fixturePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
}

async function cleanupStored(context) {
  let state;
  try {
    state = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    throw new HarnessFailure("fixture_file_unavailable");
  }
  ensure(state && /^[0-9a-f-]{36}$/i.test(state.runId) && Array.isArray(state.users) && state.users.length === 2 &&
    Array.isArray(state.records) && Array.isArray(state.variants) && Array.isArray(state.media) &&
    Array.isArray(state.storageKeys) && Array.isArray(state.inquiries), "invalid_fixture_file");
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(roles.size === 2 && roles.has("customer") && roles.has("staff"), "invalid_fixture_roles");
  for (const fixture of state.users) {
    ensure(fixture.runId === state.runId, "fixture_run_id_mismatch");
    await verifyFixtureOwnership(context.clerk, fixture);
  }
  state.staffUserId = state.users.find(({ role }) => role === "staff").userId;
  await cleanup(context, state);
}

async function grantFixtureCapabilities(context, state, auth) {
  for (const capability of fixtureCapabilities) {
    for (const role of ["customer", "staff"]) {
      const result = await rpc(auth[role].database, "has_capability", { capability_name: capability });
      ensure(!result.error && result.data === false, `fixture_pregranted_${capability}`);
    }
  }
  for (const capability of fixtureCapabilities) {
    const result = await rpc(context.admin, "set_staff_capability", {
      target_user_id: state.staffUserId,
      capability_name: capability,
      enabled: true,
      reason: `admin inventory fixture ${state.runId}`,
    });
    ensure(!result.error, `fixture_capability_grant_${capability}`);
  }
  for (const capability of fixtureCapabilities) {
    const result = await rpc(auth.staff.database, "has_capability", { capability_name: capability });
    ensure(!result.error && result.data === true, `fixture_capability_missing_${capability}`);
  }
}

function productDocument(runId, suffix, sourceOnly = false) {
  const titleSuffix = suffix[0].toUpperCase() + suffix.slice(1);
  return {
    title: `Phase3 ${runId} Inventory ${titleSuffix}`,
    slug: `iv-${runId.slice(0, 8)}-${suffix}`,
    summary: `Disposable Admin inventory fixture ${runId}.`,
    blocks: [],
    seoTitle: `Phase3 Inventory ${titleSuffix}`,
    seoDescription: "Development-only inventory fixture.",
    categoryIds: [],
    modelNumbers: [],
    variants: [{ sku: `INV-${runId.slice(0, 8)}-${suffix}`.toUpperCase(), label: "Fixture variant" }],
    specifications: [],
    compatibility: [],
    kitContents: [],
    resources: [],
    mediaIds: [],
    ...(sourceOnly ? {
      sourceObservation: {
        priceText: "Price ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¹999.00",
        capturedAt: new Date().toISOString(),
        sourceUrl: "https://example.invalid/admin-inventory-fixture",
      },
    } : {}),
  };
}

async function createProduct(context, state, auth, suffix, sourceOnly = false) {
  const document = productDocument(state.runId, suffix, sourceOnly);
  const response = await request(context, "/api/admin/products", auth.staff.appToken, "POST", { document });
  const body = await responseBody(response, 201, `create_${suffix}`);
  const record = body.record;
  ensure(record?.id && record.kind === "product" && record.document?.variants?.length === 1, `create_${suffix}_record_invalid`);
  const variant = record.document.variants[0];
  ensure(variant.id && variant.sku === document.variants[0].sku, `create_${suffix}_variant_invalid`);
  state.records.push({ id: record.id, module: "products", kind: "product", slug: record.slug });
  state.variants.push({ id: variant.id, productId: record.id, sku: variant.sku });
  await checkpoint(state);
  return { record, variant };
}

function inventoryUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  return `/api/admin/inventory${query.size ? `?${query}` : ""}`;
}

async function listInventory(context, token, params, label) {
  const response = await request(context, inventoryUrl(params), token);
  const body = await responseBody(response, 200, label);
  ensure(Array.isArray(body.items) && Number.isSafeInteger(body.total) && body.total >= 0, `${label}_shape_invalid`);
  return body;
}

function fixtureItem(body, variant, label) {
  const item = body.items.find(({ id }) => id === variant.id);
  ensure(item, `${label}_fixture_missing`);
  return item;
}

async function adjust(context, auth, variant, expectedVersion, delta, reason) {
  const response = await request(context, `/api/admin/inventory/${variant.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion,
    delta,
    requestId: randomUUID(),
    reason,
  });
  const body = await responseBody(response, 200, `adjust_${variant.sku}_${expectedVersion}`);
  ensure(body.variant?.id === variant.id, "adjustment_variant_invalid");
  return body.variant;
}

async function initialize(context, auth, variant, quantity, reason) {
  const response = await request(context, `/api/admin/inventory/${variant.id}/initialize`, auth.staff.appToken, "POST", {
    expectedVersion: 0, quantity, requestId: randomUUID(), reason,
  });
  const body = await responseBody(response, 200, `initialize_${variant.sku}`);
  ensure(body.variant?.id === variant.id, "initialization_variant_invalid");
  return body.variant;
}

async function verifySorts(context, auth, state, fixtures) {
  const base = { q: state.runId, stock: "all", limit: 100, offset: 0 };
  const expectedAsc = [fixtures.alpha, fixtures.beta, fixtures.charlie, fixtures.source].map(({ variant }) => variant.id);
  const expectedDesc = [...expectedAsc].reverse();
  for (const [sort, expected] of [
    ["title_asc", expectedAsc], ["title_desc", expectedDesc],
    ["sku_asc", expectedAsc], ["sku_desc", expectedDesc],
  ]) {
    const body = await listInventory(context, auth.staff.appToken, { ...base, sort }, `sort_${sort}`);
    ensure(body.items.map(({ id }) => id).join(",") === expected.join(","), `sort_${sort}_order_invalid`);
  }

  const ascending = await listInventory(context, auth.staff.appToken, { ...base, sort: "stock_asc" }, "sort_stock_asc");
  const descending = await listInventory(context, auth.staff.appToken, { ...base, sort: "stock_desc" }, "sort_stock_desc");
  ensure(ascending.items.map(({ id }) => id).join(",") === [fixtures.beta, fixtures.alpha, fixtures.charlie, fixtures.source]
    .map(({ variant }) => variant.id).join(","), "sort_stock_asc_unknown_order_invalid");
  ensure(descending.items.map(({ id }) => id).join(",") === [fixtures.alpha, fixtures.beta, fixtures.charlie, fixtures.source]
    .map(({ variant }) => variant.id).join(","), "sort_stock_desc_unknown_order_invalid");

  const defaultSort = await listInventory(context, auth.staff.appToken, { q: state.runId, stock: "all", limit: 100 }, "default_sort");
  const explicitSort = await listInventory(context, auth.staff.appToken, { ...base, sort: "updated_desc" }, "sort_updated_desc");
  ensure(defaultSort.items.map(({ id }) => id).join(",") === explicitSort.items.map(({ id }) => id).join(","),
    "default_sort_mismatch");

  const alphaInput = { expectedVersion: 1, delta: 1, reason: `Recent sort fixture ${state.runId}`, requestId: randomUUID() };
  const alphaRoute = `/api/admin/inventory/${fixtures.alpha.variant.id}`;
  await responseBody(await request(context, alphaRoute, auth.staff.appToken, "PATCH", alphaInput), 200, "recent_sort_adjust_alpha");
  const afterAlpha = await listInventory(context, auth.staff.appToken, { ...base, sort: "updated_desc" }, "recent_sort_after_alpha");
  ensure(afterAlpha.items[0]?.id === fixtures.alpha.variant.id, "adjustment_not_recent_first");
  await adjust(context, auth, fixtures.beta.variant, 2, 1, `Recent sort fixture ${state.runId}`);
  await responseBody(await request(context, alphaRoute, auth.staff.appToken, "PATCH", alphaInput), 200, "recent_sort_adjust_replay");
  const afterReplay = await listInventory(context, auth.staff.appToken, { ...base, sort: "updated_desc" }, "recent_sort_after_replay");
  ensure(afterReplay.items[0]?.id === fixtures.beta.variant.id, "replay_changed_recent_order");
  await adjust(context, auth, fixtures.beta.variant, 3, -1, `Restore zero fixture ${state.runId}`);
}

async function verifyInitialState(context, auth, state, fixtures) {
  const all = await listInventory(context, auth.staff.appToken, {
    q: state.runId, stock: "all", limit: 100, offset: 0,
  }, "initial_query_all");
  ensure(all.total === 4 && all.items.length === 4, "initial_query_total_invalid");
  for (const name of ["alpha", "beta", "charlie"]) {
    const item = fixtureItem(all, fixtures[name].variant, `initial_${name}`);
    ensure(item.sourceOnly === false && item.stock === null && item.stockVersion === 0,
      `initial_unverified_${name}_not_masked`);
  }
  const sourceItem = fixtureItem(all, fixtures.source.variant, "initial_source_only");
  ensure(sourceItem.sourceOnly === true && sourceItem.stock === null && sourceItem.stockVersion === 0,
    "initial_source_only_not_masked");
  const unverified = await listInventory(context, auth.staff.appToken, {
    q: state.runId, stock: "unverified", limit: 100,
  }, "initial_filter_unverified");
  ensure(unverified.total === 4 && unverified.items.length === 4, "initial_unverified_filter_invalid");
}

async function verifyQueries(context, auth, state, fixtures) {
  const all = await listInventory(context, auth.staff.appToken, { q: state.runId, stock: "all", limit: 100, offset: 0 }, "query_all");
  ensure(all.total === 4 && all.items.length === 4, "query_all_total_invalid");
  const alpha = fixtureItem(all, fixtures.alpha.variant, "known_in_stock");
  ensure(alpha.sourceOnly === false && alpha.stock === 5 && alpha.stockVersion === 1, "known_in_stock_projection_invalid");
  const beta = fixtureItem(all, fixtures.beta.variant, "known_out_of_stock");
  ensure(beta.sourceOnly === false && beta.stock === 0 && beta.stockVersion === 2, "known_out_of_stock_projection_invalid");
  const charlie = fixtureItem(all, fixtures.charlie.variant, "unverified_normal");
  ensure(charlie.sourceOnly === false && charlie.stock === null && charlie.stockVersion === 0, "unverified_normal_not_masked");
  const sourceItem = fixtureItem(all, fixtures.source.variant, "source_only");
  ensure(Array.isArray(all.categories) && all.items.every(item => Array.isArray(item.categoryNames) && Array.isArray(item.categoryIds) && item.imageId === null), "workspace_projection_invalid");
  if (all.categories.length) {
    const categorized = await listInventory(context, auth.staff.appToken, { q: state.runId, category: all.categories[0].id, limit: 100 }, "category_filter");
    ensure(categorized.total === 0 && categorized.items.length === 0 && categorized.categories.length === all.categories.length, "category_filter_or_options_invalid");
  }
  ensure(sourceItem.sourceOnly === true && sourceItem.stock === null && sourceItem.stockVersion === 3,
    "source_only_not_masked");

  const unverified = await listInventory(context, auth.staff.appToken, { q: state.runId, stock: "unverified", limit: 100 }, "filter_unverified");
  ensure(unverified.total === 2 && unverified.items.length === 2 &&
    unverified.items.some(({ id }) => id === fixtures.charlie.variant.id) &&
    unverified.items.some(({ id }) => id === fixtures.source.variant.id), "filter_unverified_total_invalid");
  const inStock = await listInventory(context, auth.staff.appToken, { q: state.runId, stock: "in_stock", limit: 100 }, "filter_in_stock");
  ensure(inStock.total === 1 && inStock.items[0]?.id === fixtures.alpha.variant.id && inStock.items[0]?.stock === 5,
    "filter_in_stock_invalid");
  const outOfStock = await listInventory(context, auth.staff.appToken, { q: state.runId, stock: "out_of_stock", limit: 100 }, "filter_out_of_stock");
  ensure(outOfStock.total === 1 && outOfStock.items[0]?.id === fixtures.beta.variant.id &&
    outOfStock.items[0]?.stock === 0 && outOfStock.items[0]?.stockVersion === 2, "filter_out_of_stock_invalid");

  const exactSku = await listInventory(context, auth.staff.appToken, {
    q: fixtures.source.variant.sku.toLowerCase(), stock: "all", limit: 10,
  }, "search_exact_sku");
  ensure(exactSku.total === 1 && exactSku.items[0]?.id === fixtures.source.variant.id, "search_exact_sku_invalid");
  const titleSearch = await listInventory(context, auth.staff.appToken, {
    q: "Inventory Alpha", stock: "all", limit: 10,
  }, "search_title");
  ensure(titleSearch.total === 1 && titleSearch.items[0]?.id === fixtures.alpha.variant.id, "search_title_invalid");
  const partialSku = await listInventory(context, auth.staff.appToken, {
    q: `INV-${state.runId.slice(0, 8)}`, stock: "all", limit: 10,
  }, "search_partial_sku");
  ensure(partialSku.total === 0, "search_partial_sku_matched");

  const firstPage = await listInventory(context, auth.staff.appToken, {
    q: state.runId, stock: "all", sort: "sku_asc", limit: 2, offset: 0,
  }, "pagination_first");
  const secondPage = await listInventory(context, auth.staff.appToken, {
    q: state.runId, stock: "all", sort: "sku_asc", limit: 2, offset: 2,
  }, "pagination_second");
  const expected = [fixtures.alpha, fixtures.beta, fixtures.charlie, fixtures.source].map(({ variant }) => variant.id);
  ensure(firstPage.total === 4 && secondPage.total === 4 && firstPage.items.length === 2 && secondPage.items.length === 2 &&
    [...firstPage.items, ...secondPage.items].map(({ id }) => id).join(",") === expected.join(","), "pagination_order_invalid");
  const emptyPage = await listInventory(context, auth.staff.appToken, {
    q: state.runId, stock: "all", sort: "sku_asc", limit: 2, offset: 4,
  }, "pagination_empty");
  ensure(emptyPage.total === 4 && emptyPage.items.length === 0, "pagination_empty_invalid");

  const invalidStock = await request(context, inventoryUrl({ q: state.runId, stock: "verified" }), auth.staff.appToken);
  await responseBody(invalidStock, 400, "invalid_stock_filter");
  const invalidSort = await request(context, inventoryUrl({ q: state.runId, sort: "quantity_asc" }), auth.staff.appToken);
  await responseBody(invalidSort, 400, "invalid_sort");
}

async function verifySourceInitialization(context, auth, state, records) {
  const variant = records.source.variant;
  const route = `/api/admin/inventory/${variant.id}/initialize`;
  const input = { expectedVersion: 3, quantity: 0, reason: `Verified zero source fixture ${state.runId}`, requestId: randomUUID() };
  const before = await listInventory(context, auth.staff.appToken, { q: state.runId, limit: 100 }, "before_source_initialize");
  ensure(before.stats && before.stats.total === before.stats.aboveZero + before.stats.zero + before.stats.unverified,
    "initial_stats_partition_invalid");
  for (const [token, status, label] of [[null, 401, "anonymous"], [auth.customer.appToken, 403, "customer"]]) {
    await responseBody(await request(context, route, token, "POST", input), status, `${label}_initialize`);
  }
  await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, expectedVersion: 0 }), 409, "stale_initial_count");
  await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, quantity: -1 }), 400, "negative_initial_count");
  await responseBody(await request(context, `/api/admin/inventory/${records.alpha.variant.id}/initialize`, auth.staff.appToken,
    "POST", { ...input, expectedVersion: 1 }), 409, "configured_ordinary_initialization_denied");
  const initialized = await responseBody(await request(context, route, auth.staff.appToken, "POST", input), 200, "initialize_zero");
  ensure(initialized.variant?.stock === 0 && initialized.variant.stockVersion === 4, "initialize_zero_did_not_replace_hidden_balance");
  const repeated = await responseBody(await request(context, route, auth.staff.appToken, "POST", input), 200, "initialize_same_request");
  ensure(repeated.variant?.stock === 0 && repeated.variant.stockVersion === 4, "initialize_repeat_changed_balance");
  for (const changed of [{ quantity: 1 }, { expectedVersion: 4 }, { reason: "Different reason" }]) {
    await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, ...changed }), 409, "initialize_payload_conflict");
  }
  await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, expectedVersion: 4, requestId: randomUUID() }),
    409, "initialize_twice_denied");
  await responseBody(await request(context, `/api/admin/inventory/${variant.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion: 3, delta: -7, reason: input.reason, requestId: input.requestId,
  }), 409, "initialize_request_cannot_be_adjustment");
  const zero = await listInventory(context, auth.staff.appToken, { q: variant.sku, stock: "out_of_stock", limit: 10 }, "source_verified_zero");
  ensure(zero.total === 1 && zero.items[0].sourceOnly === true && zero.items[0].stock === 0 && zero.items[0].stockVersion === 4,
    "source_verified_zero_projection_invalid");
  ensure(zero.stats.total === before.stats.total && zero.stats.zero === before.stats.zero + 1 &&
    zero.stats.unverified === before.stats.unverified - 1 && zero.stats.aboveZero === before.stats.aboveZero,
    "initialize_zero_stats_invalid");
  const missingUnknown = await listInventory(context, auth.staff.appToken, { q: variant.sku, stock: "unverified", limit: 10 }, "source_left_unknown");
  ensure(missingUnknown.total === 0, "verified_source_still_unverified");
  const movement = await table(context.admin, "inventory_movements").select("delta,balance_after,stock_version,operation")
    .eq("variant_id", variant.id).eq("request_id", input.requestId);
  ensure(!movement.error && movement.data?.length === 1 && movement.data[0].delta === -7 &&
    movement.data[0].balance_after === 0 && movement.data[0].stock_version === 4 && movement.data[0].operation === "initialize",
    "initialize_movement_missing_or_duplicated");
  const preserved = await table(context.admin, "inventory_movements").select("delta,balance_after,operation")
    .eq("variant_id", variant.id).eq("stock_version", 3);
  ensure(!preserved.error && preserved.data?.length === 1 && preserved.data[0].delta === 7 &&
    preserved.data[0].balance_after === 7 && preserved.data[0].operation === "adjust", "historical_movement_was_changed");
  const audit = await table(context.admin, "cms_audit_events").select("action").eq("entity_id", variant.id).eq("action", "variant.inventory.initialize");
  ensure(!audit.error && audit.data?.length === 1, "initialize_audit_missing_or_duplicated");
  const stored = await table(context.admin, "inventory_balances").select("source_verified_at").eq("variant_id", variant.id);
  ensure(!stored.error && typeof stored.data?.[0]?.source_verified_at === "string", "source_verification_marker_missing");
  const adjusted = await adjust(context, auth, variant, 4, 2, `Source fixture restocked ${state.runId}`);
  ensure(adjusted.stock === 2 && adjusted.stockVersion === 5, "verified_source_adjustment_failed");
  const inStock = await listInventory(context, auth.staff.appToken, { q: variant.sku, stock: "in_stock", limit: 10 }, "source_verified_positive");
  ensure(inStock.total === 1 && inStock.items[0].sourceOnly === true && inStock.items[0].stock === 2 && inStock.items[0].stockVersion === 5,
    "source_provenance_lost_after_adjustment");
  ensure(inStock.stats.aboveZero === before.stats.aboveZero + 1 && inStock.stats.zero === before.stats.zero &&
    inStock.stats.unverified === before.stats.unverified - 1, "source_positive_stats_invalid");
  await responseBody(await request(context, `/api/admin/inventory/${variant.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion: 5, delta: 0, reason: "Zero adjustments remain invalid", requestId: randomUUID(),
  }), 400, "zero_adjustment_denied");
  const stockSorted = await listInventory(context, auth.staff.appToken, { q: state.runId, sort: "stock_asc", limit: 100 }, "source_stock_sort");
  ensure(stockSorted.items.map(({ id }) => id).join(",") === [records.beta.variant.id, variant.id, records.alpha.variant.id, records.charlie.variant.id].join(","),
    "verified_source_not_sorted_by_quantity");
  // A default-zero source fixture needs its own event: a zero-delta initialization is still an audited count.
  const fresh = await createProduct(context, state, auth, "zero-source", true);
  const freshInput = { expectedVersion: 0, quantity: 0, reason: `Fresh verified zero ${state.runId}`, requestId: randomUUID() };
  const simultaneous = await Promise.all([0, 1].map(() => request(context,
    `/api/admin/inventory/${fresh.variant.id}/initialize`, auth.staff.appToken, "POST", freshInput)));
  const freshZero = await responseBody(simultaneous[0], 200, "initialize_fresh_zero");
  const freshReplay = await responseBody(simultaneous[1], 200, "initialize_fresh_zero_concurrent_replay");
  ensure(freshReplay.variant?.stockVersion === 1, "concurrent_initialization_incremented_twice");
  ensure(freshZero.variant?.stock === 0 && freshZero.variant.stockVersion === 1, "fresh_zero_not_initialized");
  const zeroMovement = await table(context.admin, "inventory_movements").select("delta,operation").eq("request_id", freshInput.requestId);
  ensure(!zeroMovement.error && zeroMovement.data?.length === 1 && zeroMovement.data[0].delta === 0 &&
    zeroMovement.data[0].operation === "initialize", "zero_initialization_event_invalid");
}

async function verifyHistory(context, auth, state, records) {
  const variant = records.source.variant;
  const route = `/api/admin/inventory/${variant.id}/history`;
  for (const [token, status, label] of [[null, 401, "anonymous"], [auth.customer.appToken, 403, "customer"]]) {
    const response = await request(context, route, token);
    await responseBody(response, status, `${label}_history`);
    ensure(response.headers.get("cache-control")?.includes("no-store"), `${label}_history_cache`);
  }
  await responseBody(await request(context, `${route}?offset=1`, auth.staff.appToken), 400, "history_invalid_offset");
  await responseBody(await request(context, `/api/admin/inventory/${randomUUID()}/history`, auth.staff.appToken), 404, "history_missing_variant");
  const empty = await responseBody(await request(context, `/api/admin/inventory/${records.charlie.variant.id}/history`, auth.staff.appToken), 200, "history_empty");
  ensure(empty.items?.length === 0 && empty.offset === 0 && empty.hasMore === false, "history_empty_invalid");
  const response = await request(context, route, auth.staff.appToken);
  const first = await responseBody(response, 200, "history_initialized_and_adjusted");
  ensure(response.headers.get("cache-control")?.includes("private") && response.headers.get("cache-control")?.includes("no-store"), "history_private_cache");
  ensure(first.items?.length === 3 && first.hasMore === false && first.items[0].operation === "adjust" &&
    first.items[0].delta === 2 && first.items[0].balanceAfter === 2 &&
    first.items[1].operation === "initialize" && first.items[1].delta === -7 && first.items[1].balanceAfter === 0 &&
    first.items[2].delta === 7 && first.items[2].balanceAfter === 7 &&
    first.items.every(item => Object.keys(item).sort().join(",") === "balanceAfter,delta,occurredAt,operation,reason") &&
    !JSON.stringify(first).includes(state.staffUserId), "history_projection_invalid");
  console.log("History access and initial movements verified; creating pagination movements.");
  for (let index = 0; index < 18; index++) {
    await adjust(context, auth, variant, 5 + index, 1, `History page fixture ${state.runId}`);
  }
  const page1 = await responseBody(await request(context, route, auth.staff.appToken), 200, "history_page_one");
  const page2 = await responseBody(await request(context, `${route}?offset=20`, auth.staff.appToken), 200, "history_page_two");
  ensure(page1.items?.length === 20 && page1.hasMore === true && page1.items[0].balanceAfter === 20 &&
    page2.items?.length === 1 && page2.offset === 20 && page2.hasMore === false &&
    page2.items[0].balanceAfter === 7, "history_pagination_invalid");
  const revoke = await rpc(context.admin, "set_staff_capability", { target_user_id: state.staffUserId,
    capability_name: "orders.manage", enabled: false, reason: `history access fixture ${state.runId}` });
  ensure(!revoke.error, "history_capability_revoke_failed");
  await responseBody(await request(context, route, auth.staff.appToken), 403, "history_catalog_only_denied");
  const grant = await rpc(context.admin, "set_staff_capability", { target_user_id: state.staffUserId,
    capability_name: "orders.manage", enabled: true, reason: `history access fixture ${state.runId}` });
  ensure(!grant.error, "history_capability_restore_failed");
}

async function verifyOrdinaryInitialization(context, auth, state) {
  const fresh = await createProduct(context, state, auth, "zero-ordinary");
  const route = `/api/admin/inventory/${fresh.variant.id}/initialize`;
  const before = await listInventory(context, auth.staff.appToken, { q: fresh.variant.sku, limit: 10 }, "ordinary_before_count");
  ensure(before.total === 1 && before.items[0].stock === null && before.items[0].stockVersion === 0 &&
    before.items[0].sourceOnly === false, "ordinary_initial_state_invalid");
  const input = { expectedVersion: 0, quantity: 0, reason: `Ordinary verified zero ${state.runId}`, requestId: randomUUID() };
  const initialized = await responseBody(await request(context, route, auth.staff.appToken, "POST", input), 200, "ordinary_zero_count");
  ensure(initialized.variant?.stock === 0 && initialized.variant.stockVersion === 1, "ordinary_zero_count_invalid");
  const replayed = await responseBody(await request(context, route, auth.staff.appToken, "POST", input), 200, "ordinary_count_replay");
  ensure(replayed.variant?.stock === 0 && replayed.variant.stockVersion === 1, "ordinary_replay_changed_count");
  await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, requestId: randomUUID(), expectedVersion: 1 }),
    409, "ordinary_initialized_count_cannot_reset");
  await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, requestId: randomUUID() }),
    409, "ordinary_count_stale_version_denied");
  const zero = await listInventory(context, auth.staff.appToken, { q: fresh.variant.sku, stock: "out_of_stock", limit: 10 }, "ordinary_zero_filter");
  ensure(zero.total === 1 && zero.items[0].stock === 0 && zero.items[0].sourceOnly === false &&
    zero.stats.zero === before.stats.zero + 1 && zero.stats.unverified === before.stats.unverified - 1,
    "ordinary_zero_projection_or_stats_invalid");
  const stored = await table(context.admin, "inventory_balances").select("source_verified_at").eq("variant_id", fresh.variant.id);
  ensure(!stored.error && stored.data?.length === 1 && stored.data[0].source_verified_at === null,
    "ordinary_initialization_set_source_marker");
  const movements = await table(context.admin, "inventory_movements").select("delta,operation,balance_after").eq("variant_id", fresh.variant.id);
  ensure(!movements.error && movements.data?.length === 1 && movements.data[0].delta === 0 &&
    movements.data[0].operation === "initialize" && movements.data[0].balance_after === 0, "ordinary_zero_movement_invalid");
  const counted = await adjust(context, auth, fresh.variant, 1, 2, `Ordinary restock ${state.runId}`);
  ensure(counted.stock === 2 && counted.stockVersion === 2, "ordinary_adjust_after_initialization_failed");
  const positive = await listInventory(context, auth.staff.appToken, { q: fresh.variant.sku, stock: "in_stock", limit: 10 }, "ordinary_positive_filter");
  ensure(positive.total === 1 && positive.items[0].sourceOnly === false && positive.stats.aboveZero === before.stats.aboveZero + 1 &&
    positive.stats.zero === before.stats.zero && positive.stats.unverified === before.stats.unverified - 1,
    "ordinary_positive_projection_or_stats_invalid");
  await responseBody(await request(context, route, auth.staff.appToken, "POST", { ...input, requestId: randomUUID(), expectedVersion: 2 }),
    409, "ordinary_adjusted_count_cannot_reset");

  // Replay an adjustment made before initial counts were required.
  const legacy = await createProduct(context, state, auth, "legacy-ordinary");
  const legacyInput = { expectedVersion: 0, delta: 3, reason: `Legacy adjustment ${state.runId}`, requestId: randomUUID() };
  const legacyBalance = await table(context.admin, "inventory_balances").update({ available_quantity: 3, version: 1 })
    .eq("variant_id", legacy.variant.id).select("variant_id");
  ensure(!legacyBalance.error && legacyBalance.data?.length === 1, "legacy_balance_fixture_failed");
  const legacyMovement = await table(context.admin, "inventory_movements").insert({
    variant_id: legacy.variant.id, request_id: legacyInput.requestId, delta: 3, balance_after: 3, stock_version: 1,
    reason: legacyInput.reason, actor: state.staffUserId,
  }).select("id");
  ensure(!legacyMovement.error && legacyMovement.data?.length === 1, "legacy_movement_fixture_failed");
  const replay = await responseBody(await request(context, `/api/admin/inventory/${legacy.variant.id}`,
    auth.staff.appToken, "PATCH", legacyInput), 200, "legacy_adjustment_replay");
  ensure(replay.variant?.stock === 3 && replay.variant.stockVersion === 1, "legacy_replay_changed_stock");
}

async function run(context, browserReview = false, historyOnly = false, historyBrowser = false) {
  try {
    await readFile(fixturePath, "utf8");
    throw new HarnessFailure("fixture_file_already_exists_use_cleanup");
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    if (error?.code !== "ENOENT") throw new HarnessFailure("fixture_file_unavailable");
  }

  const state = newState();
  let primaryFailure = null;
  try {
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => state.users.push(fixture));
    state.users = fixtures.users;
    state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
    ensure(state.users.length === 2 && state.staffUserId, "fixture_users_invalid");
    await checkpoint(state);
    await grantFixtureCapabilities(context, state, fixtures.auth);
    await checkpoint(state);

    if (historyOnly) {
      const source = await createProduct(context, state, fixtures.auth, "history-source", true);
      const charlie = await createProduct(context, state, fixtures.auth, "history-empty");
      const prior = await table(context.admin, "inventory_balances").update({ available_quantity: 7, version: 3 })
        .eq("variant_id", source.variant.id).select("variant_id");
      ensure(!prior.error && prior.data?.length === 1, "history_prior_balance_fixture_failed");
      const movement = await table(context.admin, "inventory_movements").insert({
        variant_id: source.variant.id, request_id: randomUUID(), delta: 7, balance_after: 7, stock_version: 3,
        reason: `Historical unverified source fixture ${state.runId}`, actor: state.staffUserId,
      }).select("id");
      ensure(!movement.error && movement.data?.length === 1, "history_prior_movement_fixture_failed");
      const initialized = await responseBody(await request(context, `/api/admin/inventory/${source.variant.id}/initialize`,
        fixtures.auth.staff.appToken, "POST", { expectedVersion: 3, quantity: 0,
          reason: `Verified zero source fixture ${state.runId}`, requestId: randomUUID() }), 200, "history_initialize");
      ensure(initialized.variant?.stock === 0 && initialized.variant.stockVersion === 4, "history_initialize_invalid");
      await adjust(context, fixtures.auth, source.variant, 4, 2, `Source fixture restocked ${state.runId}`);
      console.log("History fixture initialized and adjusted; checking access and pages.");
      if (historyBrowser) {
        const ready = path.join(projectRoot, ".bootstrap", "inventory-browser-ready.json");
        const done = path.join(projectRoot, ".bootstrap", "inventory-browser-done");
        await unlink(done).catch(() => {});
        await writeFile(ready, JSON.stringify({ sku: source.variant.sku }));
        console.log(`Disposable history browser fixture ready: ${source.variant.sku}`);
        try {
          for (let attempt = 0; attempt < 600; attempt++) {
            if (await readFile(done).then(() => true).catch(() => false)) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } finally { await unlink(ready).catch(() => {}); await unlink(done).catch(() => {}); }
      } else await verifyHistory(context, fixtures.auth, state, { source, charlie });
    } else {
    const records = {
      alpha: await createProduct(context, state, fixtures.auth, "alpha"),
      beta: await createProduct(context, state, fixtures.auth, "beta"),
      charlie: await createProduct(context, state, fixtures.auth, "charlie"),
      source: await createProduct(context, state, fixtures.auth, "source", true),
    };
    await verifyInitialState(context, fixtures.auth, state, records);

    const sourceStockWrite = await request(context, `/api/admin/inventory/${records.source.variant.id}`,
      fixtures.auth.staff.appToken, "PATCH", {
        expectedVersion: 0, delta: 1, requestId: randomUUID(), reason: "Source-only fixture cannot be adjusted",
      });
    await responseBody(sourceStockWrite, 409, "source_stock_adjustment");

    // Exercise the projection against a rogue balance change on this disposable source fixture only.
    const rogueBalance = await table(context.admin, "inventory_balances").update({ available_quantity: 7, version: 3 })
      .eq("variant_id", records.source.variant.id).select("variant_id");
    ensure(!rogueBalance.error && rogueBalance.data?.some(({ variant_id }) => variant_id === records.source.variant.id),
      "source_rogue_balance_fixture_failed");
    const priorMovement = await table(context.admin, "inventory_movements").insert({
      variant_id: records.source.variant.id, request_id: randomUUID(), delta: 7, balance_after: 7, stock_version: 3,
      reason: `Historical unverified source fixture ${state.runId}`, actor: state.staffUserId,
    }).select("id");
    ensure(!priorMovement.error && priorMovement.data?.length === 1, "source_historical_movement_fixture_failed");

    const anonymousList = await request(context, inventoryUrl({ q: state.runId }), null);
    await responseBody(anonymousList, 401, "anonymous_inventory_list");
    const customerList = await request(context, inventoryUrl({ q: state.runId }), fixtures.auth.customer.appToken);
    await responseBody(customerList, 403, "customer_inventory_list");
    const customerWrite = await request(context, `/api/admin/inventory/${records.alpha.variant.id}`,
      fixtures.auth.customer.appToken, "PATCH", {
        expectedVersion: 0, delta: 1, requestId: randomUUID(), reason: "Customer fixture must be denied",
      });
    await responseBody(customerWrite, 403, "customer_inventory_adjustment");

    const uninitializedWrite = await request(context, `/api/admin/inventory/${records.alpha.variant.id}`,
      fixtures.auth.staff.appToken, "PATCH", {
        expectedVersion: 0, delta: 5, requestId: randomUUID(), reason: "An initial count is required",
      });
    await responseBody(uninitializedWrite, 409, "ordinary_uninitialized_adjustment_denied");
    const stillUnverified = await listInventory(context, fixtures.auth.staff.appToken,
      { q: records.alpha.variant.sku, limit: 10 }, "ordinary_after_denied_adjustment");
    ensure(stillUnverified.items[0]?.stock === null && stillUnverified.items[0]?.stockVersion === 0,
      "denied_adjustment_changed_initial_stock");

    const alphaAfter = await initialize(context, fixtures.auth, records.alpha.variant, 5, `Verified stock fixture ${state.runId}`);
    ensure(alphaAfter.stock === 5 && alphaAfter.stockVersion === 1, "known_stock_initialization_invalid");
    const betaFirst = await initialize(context, fixtures.auth, records.beta.variant, 2, `Verified zero fixture ${state.runId}`);
    ensure(betaFirst.stock === 2 && betaFirst.stockVersion === 1, "zero_fixture_add_invalid");
    const betaAfter = await adjust(context, fixtures.auth, records.beta.variant, 1, -2, `Verified zero fixture ${state.runId}`);
    ensure(betaAfter.stock === 0 && betaAfter.stockVersion === 2, "zero_fixture_remove_invalid");

    const unverified = await listInventory(context, fixtures.auth.staff.appToken, {
      q: records.source.variant.sku, stock: "all", limit: 10,
    }, "source_after_rogue_balance");
    const sourceItem = fixtureItem(unverified, records.source.variant, "source_after_rogue_balance");
    ensure(sourceItem.sourceOnly === true && sourceItem.stock === null && sourceItem.stockVersion === 3,
      "rogue_source_stock_exposed");

    await verifyQueries(context, fixtures.auth, state, records);
    await verifySorts(context, fixtures.auth, state, records);
    await verifySourceInitialization(context, fixtures.auth, state, records);
    await verifyHistory(context, fixtures.auth, state, records);
    await verifyOrdinaryInitialization(context, fixtures.auth, state);
    if (browserReview) {
      const ready = path.join(projectRoot, ".bootstrap", "inventory-browser-ready.json");
      const done = path.join(projectRoot, ".bootstrap", "inventory-browser-done");
      await unlink(done).catch(() => {});
      const browserFixture = await createProduct(context, state, fixtures.auth, "browser-source", true);
      await writeFile(ready, JSON.stringify({ sku: browserFixture.variant.sku, expectedStock: null, expectedVersion: 0, countToRecord: 0 }));
      console.log("Disposable Inventory browser fixture ready; waiting for review completion.");
      try {
        for (let attempt = 0; attempt < 600; attempt++) {
          if (await readFile(done).then(() => true).catch(() => false)) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } finally { await unlink(ready).catch(() => {}); await unlink(done).catch(() => {}); }
    }
    }
  } catch (error) {
    primaryFailure = error instanceof HarnessFailure ? error : new HarnessFailure("inventory_integration_failed");
  } finally {
    if (state.users.length) {
      try {
        await cleanup(context, state);
      } catch (error) {
        try { await checkpoint(state); } catch { /* Keep the exact fixture manifest recoverable when possible. */ }
        primaryFailure ??= error instanceof HarnessFailure ? error : new HarnessFailure("fixture_cleanup_failed");
      }
    }
  }
  if (primaryFailure) throw primaryFailure;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--cleanup", "--browser-review", "--history-only", "--history-browser"].includes(arg)) || args.size > 1) {
    console.error("Admin inventory integration harness stopped safely: invalid_command_line.");
    process.exitCode = 2;
    return;
  }
  let context;
  try {
    context = await preflight();
  } catch (error) {
    console.error(`Admin inventory integration preflight failed safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  try {
    if (args.has("--cleanup")) await cleanupStored(context);
    else await run(context, args.has("--browser-review"), args.has("--history-only") || args.has("--history-browser"), args.has("--history-browser"));
    console.log(args.has("--cleanup")
      ? "Verified Admin inventory fixtures removed."
      : "Admin inventory development integration checks passed.");
  } catch (error) {
    console.error(`Admin inventory integration harness failed safely: ${error instanceof HarnessFailure ? error.label : "integration_failed"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
