import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appRequest,
  cleanFixtures,
  createFixtures,
  ensure,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";
import { ensureOwnedCleanup } from "./phase3-publishing.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "admin-product-integration-fixtures.json");
const previewPath = path.join(projectRoot, ".bootstrap", "admin-products", "preview.json");

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.name = "HarnessFailure";
    this.label = label;
  }
}

function safeFailureLabel(error) {
  if (typeof error?.label === "string" && /^[a-z0-9_]{1,180}$/.test(error.label)) return error.label;
  const name = typeof error?.name === "string" ? error.name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40) || "error" : "error";
  const location = typeof error?.stack === "string" ? error.stack.match(/admin-product-integration\.mjs:(\d+):(\d+)/) : null;
  return location ? `admin_product_integration_${name}_at_${location[1]}` : "admin_product_integration_failed";
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

async function body(response, expectedStatus, label) {
  ensure(response.status === expectedStatus, `${label}_status_${response.status}`);
  return safeJson(response, `${label}_json`);
}

function checkProductStats(stats, label) {
  ensure(stats && Number.isSafeInteger(stats.totalProducts) && stats.totalProducts >= 0 && Number.isSafeInteger(stats.unpricedProducts) &&
    stats.unpricedProducts >= 0 && stats.unpricedProducts <= stats.totalProducts && Array.isArray(stats.categories) && stats.categories.length <= 500,
  `${label}_shape_invalid`);
  ensure(stats.categories.every((category) => category && typeof category.id === "string" && typeof category.title === "string" &&
    Number.isSafeInteger(category.count) && category.count >= 0 && category.count <= stats.totalProducts), `${label}_categories_invalid`);
  if (stats.prices === null) ensure(stats.unpricedProducts === stats.totalProducts, `${label}_empty_prices_invalid`);
  else ensure(stats.prices && Number.isSafeInteger(stats.prices.minPaise) && Number.isSafeInteger(stats.prices.avgPaise) &&
    Number.isSafeInteger(stats.prices.maxPaise) && Number.isSafeInteger(stats.prices.pricedProducts) && stats.prices.pricedProducts > 0 &&
    stats.prices.pricedProducts + stats.unpricedProducts === stats.totalProducts && stats.prices.minPaise >= 0 &&
    stats.prices.minPaise <= stats.prices.avgPaise && stats.prices.avgPaise <= stats.prices.maxPaise && stats.prices.maxPaise <= 10_000_000_000,
  `${label}_prices_invalid`);
  return stats;
}

function commonDocument(runId, suffix) {
  return {
    title: `Phase3 ${runId} ${suffix}`,
    slug: `p3-${runId.slice(0, 8)}-${suffix}`,
    summary: `Disposable product fixture ${runId}.`,
    blocks: [],
    seoTitle: "",
    seoDescription: "",
    categoryIds: [],
    modelNumbers: [],
    variants: [{ sku: `P3-${runId.slice(0, 8)}-${suffix}`.toUpperCase(), label: "Default" }],
    specifications: [],
    compatibility: [],
    kitContents: [],
    resources: [],
    mediaIds: [],
    tags: ["fixture", "products"],
  };
}

async function postProduct(context, token, document, prices) {
  return request(context, "/api/admin/products", token, "POST", { document, ...(prices ? { prices } : {}) });
}

async function grantCatalogCapability(context, fixtures) {
  const staff = fixtures.auth.staff;
  for (const capability of ["catalog.edit", "content.publish", "media.manage"]) {
    const result = await rpc(staff.database, "has_capability", { capability_name: capability });
    ensure(!result.error && result.data === false, `fixture_pregranted_${capability}`);
  }
  const granted = await rpc(context.admin, "set_staff_capability", {
    target_user_id: fixtures.users.find(({ role }) => role === "staff").userId,
    capability_name: "catalog.edit",
    enabled: true,
    reason: `admin product editor fixture ${fixtures.users[0].runId}`,
  });
  ensure(!granted.error, "fixture_catalog_capability_grant_failed");
  const verified = await rpc(staff.database, "has_capability", { capability_name: "catalog.edit" });
  ensure(!verified.error && verified.data === true, "fixture_catalog_capability_missing");
}

async function verify(context, state, fixtures) {
  const staffToken = fixtures.auth.staff.appToken;
  const customerToken = fixtures.auth.customer.appToken;
  const base = commonDocument(state.runId, "priced");
  base.variants.push({ sku: `P3-${state.runId.slice(0, 8)}-SECOND`.toUpperCase(), label: "Second" });

  ensure((await request(context, "/api/admin/products/table", customerToken)).status === 403, "customer_product_table_access_allowed");
  const initialTable = await body(await request(context, "/api/admin/products/table?limit=10", staffToken), 200, "initial_product_table");
  const initialStats = checkProductStats(initialTable.stats, "initial_product_stats");
  ensure((await request(context, "/api/admin/products/table?q=x&q=y", staffToken)).status === 400, "duplicate_table_query_accepted");
  ensure((await request(context, "/api/admin/products/table?debug=1", staffToken)).status === 400, "unknown_table_query_accepted");

  const createdResponse = await postProduct(context, staffToken, base, [
    { sku: base.variants[0].sku, expectedPriceVersion: 0, regularPricePaise: 15000, actualPricePaise: 13000, salePricePaise: 12000, saleStartsAt: "2099-01-01T00:00:00Z", saleEndsAt: "2099-02-01T00:00:00Z", reason: "Fixture initial price" },
    { sku: base.variants[1].sku, expectedPriceVersion: 0, regularPricePaise: 17000, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Fixture initial price" },
  ]);
  const createdBody = await body(createdResponse, 201, "product_create_with_prices");
  const product = createdBody.record;
  ensure(product?.id && product.version === 1 && product.document?.variants?.length === 2, "priced_product_create_shape_invalid");
  state.previewProductId = product.id;
  state.records.push({ id: product.id, module: "products", kind: "product", slug: product.slug });
  await checkpoint(state);

  const priceResponse = await request(context, `/api/admin/products/${product.id}/pricing`, staffToken);
  const priceBody = await body(priceResponse, 200, "product_scoped_prices");
  ensure(priceBody.sourceObservation === false && priceBody.items?.length === 2, "product_price_scope_invalid");
  const lowest = priceBody.items.find(({ sku }) => sku === base.variants[0].sku);
  ensure(lowest?.regularPaise === 15000 && lowest.actualPaise === 13000 && lowest.salePaise === 12000 && lowest.priceVersion === 1, "product_variant_price_missing");
  ensure(priceBody.items.every((item) => item.productId === product.id && item.stock === null && item.stockVersion === null), "product_price_read_exposed_stock_or_other_product");
  state.variants.push(...priceBody.items.map(({ id, productId, sku }) => ({ id, productId, sku })));
  await checkpoint(state);
  ensure((await request(context, `/api/admin/products/${product.id}/pricing`, customerToken)).status === 403, "customer_product_prices_access_allowed");

  const tableQuery = `q=${encodeURIComponent(base.variants[0].sku)}&status=draft&sort=price_asc&limit=10&offset=0`;
  const tableResponse = await request(context, `/api/admin/products/table?${tableQuery}`, staffToken);
  const tableBody = await body(tableResponse, 200, "product_table_list");
  const row = tableBody.items?.find(({ id }) => id === product.id);
  ensure(row?.status === "draft" && row.price?.regularPricePaise === 15000 && row.price?.effectivePricePaise === 13000 && row.price.from === true, "product_table_projection_invalid");
  const firstProductStats = checkProductStats(tableBody.stats, "first_product_stats");
  ensure(firstProductStats.totalProducts === initialStats.totalProducts + 1 && firstProductStats.unpricedProducts === initialStats.unpricedProducts &&
    firstProductStats.prices?.pricedProducts === (initialStats.prices?.pricedProducts ?? 0) + 1, "product_table_stats_not_global_or_updated");
  ensure(tableBody.categoryOptions && Array.isArray(tableBody.categoryOptions), "product_table_categories_missing");

  const rollbackDoc = commonDocument(state.runId, "atomic-rollback");
  const failedSave = await postProduct(context, staffToken, rollbackDoc, [
    { sku: rollbackDoc.variants[0].sku, expectedPriceVersion: 9, regularPricePaise: 19000, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Fixture stale price" },
  ]);
  ensure(failedSave.status === 409, "atomic_price_version_conflict_not_reported");
  const rollbackList = await body(await request(context, `/api/admin/products/table?q=${encodeURIComponent(rollbackDoc.title)}`, staffToken), 200, "atomic_rollback_list");
  ensure(!rollbackList.items?.some(({ slug }) => slug === rollbackDoc.slug), "atomic_price_failure_left_product_record");

  const source = commonDocument(state.runId, "source-only");
  source.sourceObservation = { priceText: "₹123 observed", capturedAt: new Date().toISOString(), sourceUrl: "https://pandabyte.in/fixture-source" };
  const sourceBody = await body(await postProduct(context, staffToken, source), 201, "source_observation_create");
  state.records.push({ id: sourceBody.record.id, module: "products", kind: "product", slug: sourceBody.record.slug });
  await checkpoint(state);
  const sourcePriceBody = await body(await request(context, `/api/admin/products/${sourceBody.record.id}/pricing`, staffToken), 200, "source_observation_price_read");
  ensure(sourcePriceBody.sourceObservation === true && sourcePriceBody.items?.every(({ regularPaise, actualPaise, salePaise }) => regularPaise === null && actualPaise === null && salePaise === null), "source_observation_initial_prices_not_empty");
  const sourceVariantId = sourceBody.record.document.variants[0].id;
  const sourceUpdateDocument = { ...source, variants: sourceBody.record.document.variants };
  state.variants.push({ id: sourceVariantId, productId: sourceBody.record.id, sku: source.variants[0].sku });

  const staffUserId = fixtures.users.find(({ role }) => role === "staff").userId;
  const publishGrant = await rpc(context.admin, "set_staff_capability", {
    target_user_id: staffUserId,
    capability_name: "content.publish",
    enabled: true,
    reason: `Unpriced source publish guard fixture ${state.runId}`,
  });
  ensure(!publishGrant.error, "source_publish_fixture_capability_grant_failed");
  try {
    const capability = await rpc(fixtures.auth.staff.database, "has_capability", { capability_name: "content.publish" });
    ensure(!capability.error && capability.data === true, "source_publish_fixture_capability_missing");
    const publishAttempt = await request(context, `/api/admin/products/${sourceBody.record.id}/publish`, staffToken, "POST", {
      expectedVersion: sourceBody.record.version,
    });
    ensure(publishAttempt.status === 409, "unpriced_source_product_published");
    const stillUnpublished = await body(await request(context, `/api/admin/products/${sourceBody.record.id}`, staffToken), 200, "source_after_unpriced_publish");
    ensure(stillUnpublished.record.version === sourceBody.record.version && stillUnpublished.record.publishedRevisionId === null,
      "unpriced_source_publish_changed_record");
  } finally {
    const revoke = await rpc(context.admin, "set_staff_capability", {
      target_user_id: staffUserId,
      capability_name: "content.publish",
      enabled: false,
      reason: `Revoke unpriced source publish guard fixture ${state.runId}`,
    });
    ensure(!revoke.error, "source_publish_fixture_capability_revoke_failed");
    const revoked = await rpc(fixtures.auth.staff.database, "has_capability", { capability_name: "content.publish" });
    ensure(!revoked.error && revoked.data === false, "source_publish_fixture_capability_not_revoked");
  }

  const invalidSourcePair = await request(context, `/api/admin/products/${sourceBody.record.id}`, staffToken, "PATCH", {
    expectedVersion: sourceBody.record.version,
    document: sourceUpdateDocument,
    prices: [{ sku: source.variants[0].sku, expectedPriceVersion: 0, regularPricePaise: 2, actualPricePaise: 3, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Invalid source pair" }],
  });
  ensure(invalidSourcePair.status === 400, "source_actual_above_list_accepted");
  const unchangedSource = await body(await request(context, `/api/admin/products/${sourceBody.record.id}`, staffToken), 200, "source_after_invalid_pair");
  ensure(unchangedSource.record.version === sourceBody.record.version, "invalid_source_pair_changed_document");

  const sourceUpdateResponse = await request(context, `/api/admin/products/${sourceBody.record.id}`, staffToken, "PATCH", {
    expectedVersion: sourceBody.record.version,
    document: sourceUpdateDocument,
    prices: [{ sku: source.variants[0].sku, expectedPriceVersion: 0, regularPricePaise: 2, actualPricePaise: 1, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Source price pair fixture" }],
  });
  const sourceUpdate = await body(sourceUpdateResponse, 200, "source_actual_price_save");
  const sourcePrices = await body(await request(context, `/api/admin/products/${sourceBody.record.id}/pricing`, staffToken), 200, "source_actual_price_read");
  ensure(sourcePrices.sourceObservation === true && sourcePrices.items?.length === 1 && sourcePrices.items[0].regularPaise === 2 &&
    sourcePrices.items[0].actualPaise === 1 && sourcePrices.items[0].salePaise === null && sourcePrices.items[0].stock === null &&
    sourcePrices.items[0].stockVersion === null, "source_actual_price_pair_not_admin_visible");

  const sourceTable = await body(await request(context, `/api/admin/products/table?q=${encodeURIComponent(source.variants[0].sku)}&limit=10`, staffToken), 200, "source_price_table");
  const sourceRow = sourceTable.items?.find(({ id }) => id === sourceBody.record.id);
  const finalStats = checkProductStats(sourceTable.stats, "source_product_stats");
  ensure(sourceTable.total === 1 && sourceRow?.sourceObservation === true && sourceRow.price?.regularPricePaise === 2 &&
    sourceRow.price?.effectivePricePaise === 1 && finalStats.totalProducts === initialStats.totalProducts + 2 &&
    finalStats.unpricedProducts === initialStats.unpricedProducts && finalStats.prices?.pricedProducts === (initialStats.prices?.pricedProducts ?? 0) + 2 &&
    (finalStats.prices?.minPaise ?? 0) <= 1, "source_price_table_or_global_stats_invalid");

  const staleSourceSave = await request(context, `/api/admin/products/${sourceBody.record.id}`, staffToken, "PATCH", {
    expectedVersion: sourceUpdate.record.version,
    document: { ...sourceUpdateDocument, summary: "This stale price save must roll back." },
    prices: [{ sku: source.variants[0].sku, expectedPriceVersion: 0, regularPricePaise: 4, actualPricePaise: 3, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Stale source price fixture" }],
  });
  ensure(staleSourceSave.status === 409, "stale_source_price_save_not_conflicted");
  const sourceAfterConflict = await body(await request(context, `/api/admin/products/${sourceBody.record.id}`, staffToken), 200, "source_after_stale_pair");
  ensure(sourceAfterConflict.record.version === sourceUpdate.record.version && sourceAfterConflict.record.document.summary === source.summary, "stale_source_price_save_changed_document");

  const sourcePriceWrite = await request(context, `/api/admin/pricing/${sourceVariantId}`, staffToken, "PATCH", {
    expectedVersion: 0, regularPaise: 12300, salePaise: null, saleFrom: null, saleUntil: null, reason: "Use paired Admin source price editing",
  });
  ensure(sourcePriceWrite.status === 409, "legacy_source_price_write_bypassed_admin_pair");

  const richInvalid = commonDocument(state.runId, "invalid-rich-content");
  richInvalid.richContent = { type: "doc", content: [{ type: "script", text: "alert(1)" }] };
  ensure((await postProduct(context, staffToken, richInvalid)).status === 400, "invalid_rich_content_accepted");

  const missingMedia = commonDocument(state.runId, "missing-rich-media");
  missingMedia.richContent = { type: "doc", content: [{ type: "image", attrs: { mediaId: randomUUID(), alt: "Missing fixture image" } }] };
  const mediaRefResponse = await postProduct(context, staffToken, missingMedia);
  ensure([400, 409].includes(mediaRefResponse.status), "missing_rich_media_reference_accepted");

  const tooManyImages = commonDocument(state.runId, "six-gallery-images");
  tooManyImages.mediaIds = Array.from({ length: 6 }, () => randomUUID());
  ensure((await postProduct(context, staffToken, tooManyImages)).status === 400, "six_product_gallery_images_accepted");
}

async function checkpoint(state) {
  await mkdir(path.dirname(fixturePath), { recursive: true });
  const safe = {
    runId: state.runId,
    users: state.users.map(({ userId, email, sessionId, role, runId }) => ({ userId, email, sessionId, role, runId })),
    staffUserId: state.staffUserId,
    records: state.records,
    variants: state.variants,
    previewProductId: state.previewProductId,
    media: [],
    storageKeys: [],
    inquiries: [],
  };
  await writeFile(fixturePath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
}

async function writePreviewMarker(state) {
  ensure(state.previewProductId && /^[0-9a-f-]{36}$/i.test(state.previewProductId), "preview_product_missing");
  await mkdir(path.dirname(previewPath), { recursive: true });
  await writeFile(previewPath, `${JSON.stringify({ runId: state.runId, productId: state.previewProductId }, null, 2)}\n`, "utf8");
}

async function removePreviewMarker(runId, productId) {
  let marker;
  try { marker = JSON.parse(await readFile(previewPath, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return;
    throw new HarnessFailure("preview_marker_unavailable");
  }
  ensure(marker?.runId === runId && marker?.productId === productId, "preview_marker_mismatch");
  await unlink(previewPath);
}

async function cleanup(context, state) {
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  if (state.users.length === 2) await ensureOwnedCleanup(context, state);
  else if (state.users.length) await cleanFixtures(context, state.users, state.runId);
  if (state.previewProductId) await removePreviewMarker(state.runId, state.previewProductId);
  await unlink(fixturePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
}

async function cleanupStored(context) {
  let state;
  try { state = JSON.parse(await readFile(fixturePath, "utf8")); }
  catch { throw new HarnessFailure("fixture_file_unavailable"); }
  ensure(state && /^[0-9a-f-]{36}$/i.test(state.runId) && Array.isArray(state.users) && state.users.length === 2 &&
    Array.isArray(state.records) && Array.isArray(state.variants), "invalid_fixture_file");
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
  await ensureOwnedCleanup(context, state);
  if (state.previewProductId) await removePreviewMarker(state.runId, state.previewProductId);
  await unlink(fixturePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== "--cleanup" && arg !== "--keep-fixtures") || args.size > 1 || (args.has("--cleanup") && args.has("--keep-fixtures"))) {
    console.error("Admin product integration stopped safely: invalid_command_line.");
    process.exitCode = 2;
    return;
  }
  let context;
  try { context = await preflight(); }
  catch (error) {
    console.error(`Admin product integration preflight stopped safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  if (args.has("--cleanup")) {
    try { await cleanupStored(context); console.log("Verified disposable product fixtures removed."); }
    catch (error) {
      console.error(`Admin product cleanup stopped safely: ${error instanceof HarnessFailure ? error.label : "cleanup_failed"}.`);
      process.exitCode = 1;
    }
    return;
  }

  try {
    await readFile(fixturePath, "utf8");
    console.error("Admin product integration stopped safely: fixture_file_already_exists_use_cleanup.");
    process.exitCode = 2;
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Admin product integration stopped safely: fixture_file_unavailable.");
      process.exitCode = 2;
      return;
    }
  }
  try {
    await readFile(previewPath, "utf8");
    console.error("Admin product integration stopped safely: preview_marker_already_exists_use_cleanup.");
    process.exitCode = 2;
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Admin product integration stopped safely: preview_marker_unavailable.");
      process.exitCode = 2;
      return;
    }
  }

  const keepFixtures = args.has("--keep-fixtures");
  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [], previewProductId: "" };
  let failure = null;
  try {
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => state.users.push(fixture));
    state.users = fixtures.users;
    state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
    ensure(state.users.length === 2 && state.staffUserId, "fixture_users_invalid");
    await grantCatalogCapability(context, fixtures);
    await checkpoint(state);
    await verify(context, state, fixtures);
    if (keepFixtures) {
      await checkpoint(state);
      await writePreviewMarker(state);
    }
    console.log("Admin product table, pricing, source-observation, media-reference, and permission checks passed without publication.");
  } catch (error) {
    failure = error instanceof HarnessFailure ? error : new HarnessFailure(safeFailureLabel(error));
  } finally {
    if (state.users.length && !keepFixtures) {
      try { await cleanup(context, state); }
      catch (error) {
        try { await checkpoint(state); } catch { /* Retain only the original fixture-cleanup failure. */ }
        failure ??= error instanceof HarnessFailure ? error : new HarnessFailure("fixture_cleanup_failed");
      }
    }
  }
  if (failure) {
    console.error(`Admin product integration failed safely: ${failure.label}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
