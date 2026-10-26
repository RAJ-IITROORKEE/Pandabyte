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
  const options = { method, headers };
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
        priceText: "Price ₹999.00",
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
  ensure(sourceItem.sourceOnly === true && sourceItem.stock === null && sourceItem.stockVersion === null,
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
  ensure(sourceItem.sourceOnly === true && sourceItem.stock === null && sourceItem.stockVersion === null,
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

async function run(context) {
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
    const rogueBalance = await table(context.admin, "inventory_balances").update({ available_quantity: 7 })
      .eq("variant_id", records.source.variant.id).select("variant_id");
    ensure(!rogueBalance.error && rogueBalance.data?.some(({ variant_id }) => variant_id === records.source.variant.id),
      "source_rogue_balance_fixture_failed");

    const anonymousList = await request(context, inventoryUrl({ q: state.runId }), null);
    await responseBody(anonymousList, 401, "anonymous_inventory_list");
    const customerList = await request(context, inventoryUrl({ q: state.runId }), fixtures.auth.customer.appToken);
    await responseBody(customerList, 403, "customer_inventory_list");
    const customerWrite = await request(context, `/api/admin/inventory/${records.alpha.variant.id}`,
      fixtures.auth.customer.appToken, "PATCH", {
        expectedVersion: 0, delta: 1, requestId: randomUUID(), reason: "Customer fixture must be denied",
      });
    await responseBody(customerWrite, 403, "customer_inventory_adjustment");

    const alphaAfter = await adjust(context, fixtures.auth, records.alpha.variant, 0, 5, `Verified stock fixture ${state.runId}`);
    ensure(alphaAfter.stock === 5 && alphaAfter.stockVersion === 1, "known_stock_adjustment_invalid");
    const betaFirst = await adjust(context, fixtures.auth, records.beta.variant, 0, 2, `Verified zero fixture ${state.runId}`);
    ensure(betaFirst.stock === 2 && betaFirst.stockVersion === 1, "zero_fixture_add_invalid");
    const betaAfter = await adjust(context, fixtures.auth, records.beta.variant, 1, -2, `Verified zero fixture ${state.runId}`);
    ensure(betaAfter.stock === 0 && betaAfter.stockVersion === 2, "zero_fixture_remove_invalid");

    const unverified = await listInventory(context, fixtures.auth.staff.appToken, {
      q: records.source.variant.sku, stock: "all", limit: 10,
    }, "source_after_rogue_balance");
    const sourceItem = fixtureItem(unverified, records.source.variant, "source_after_rogue_balance");
    ensure(sourceItem.sourceOnly === true && sourceItem.stock === null && sourceItem.stockVersion === null,
      "rogue_source_stock_exposed");

    await verifyQueries(context, fixtures.auth, state, records);
    await verifySorts(context, fixtures.auth, state, records);
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
  if ([...args].some((arg) => arg !== "--cleanup") || args.size > 1) {
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
    else await run(context);
    console.log(args.has("--cleanup")
      ? "Verified Admin inventory fixtures removed."
      : "Admin inventory development integration checks passed.");
  } catch (error) {
    console.error(`Admin inventory integration harness failed safely: ${error instanceof HarnessFailure ? error.label : "integration_failed"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
