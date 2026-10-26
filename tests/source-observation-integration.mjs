import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@insforge/sdk";
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
const fixturePath = path.join(projectRoot, ".bootstrap", "source-observation-fixtures.json");
const fixtureCapabilities = ["catalog.edit", "content.publish", "orders.manage"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function removeFixtureCart(context, state) {
  if (!state.users.length) return;
  const { error } = await table(context.admin, "customer_carts").delete().in("user_id", state.users.map(({ userId }) => userId));
  ensure(!error, "fixture_cart_cleanup_failed");
}

async function cleanup(context, state) {
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  await removeFixtureCart(context, state);
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
  ensure(state && UUID.test(state.runId) && Array.isArray(state.users) && state.users.length === 2 &&
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
      reason: `source observation fixture ${state.runId}`,
    });
    ensure(!result.error, `fixture_capability_grant_${capability}`);
  }
  for (const capability of fixtureCapabilities) {
    const result = await rpc(auth.staff.database, "has_capability", { capability_name: capability });
    ensure(!result.error && result.data === true, `fixture_capability_missing_${capability}`);
  }
}

function productDocument(runId, suffix, extra = {}) {
  return {
    title: `Phase3 ${runId} ${suffix}`,
    slug: `so-${runId.slice(0, 8)}-${suffix}`,
    summary: `Disposable source-observation fixture ${runId}.`,
    blocks: [],
    seoTitle: `Phase3 ${suffix}`,
    seoDescription: "Development-only source observation fixture.",
    categoryIds: [],
    modelNumbers: [],
    variants: [{ sku: `SO-${runId.slice(0, 8)}-${suffix}`.toUpperCase(), label: "Fixture variant" }],
    specifications: [],
    compatibility: [],
    kitContents: [],
    resources: [],
    mediaIds: [],
    ...extra,
  };
}

async function createProduct(context, state, auth, suffix, extra = {}) {
  const document = productDocument(state.runId, suffix, extra);
  const response = await request(context, "/api/admin/products", auth.staff.appToken, "POST", { document });
  const body = await responseBody(response, 201, `create_${suffix}`);
  const record = body.record;
  ensure(record?.id && record.kind === "product" && record.document?.variants?.length === 1, `create_${suffix}_record_invalid`);
  const variant = record.document.variants[0];
  ensure(variant.id && variant.sku === document.variants[0].sku, `create_${suffix}_variant_invalid`);
  state.records.push({ id: record.id, module: "products", kind: "product", slug: record.slug });
  state.variants.push({ id: variant.id, productId: record.id, sku: variant.sku });
  await checkpoint(state);
  return { record, variant, document };
}

function publicProductQuery(sku, overrides = {}) {
  return {
    p_query: sku,
    p_category_ids: [],
    p_min_price_paise: null,
    p_max_price_paise: null,
    p_availability: "all",
    p_sort: "relevance",
    p_limit: 12,
    p_offset: 0,
    ...overrides,
  };
}

async function verifySourceObservation(context, state, auth, anon) {
  const note = `private-source-review-${state.runId}`;
  const sourceObservation = {
    priceText: "Price ₹999.00",
    capturedAt: new Date().toISOString(),
    sourceUrl: "https://example.invalid/source-observation-fixture",
  };
  const normal = await createProduct(context, state, auth, "normal-unpriced");
  if (!process.argv.includes("--inventory-draft-only")) {
    const normalPublish = await request(context, `/api/admin/products/${normal.record.id}/publish`, auth.staff.appToken, "POST", {
      expectedVersion: normal.record.version,
    });
    await responseBody(normalPublish, 409, "normal_unpriced_publish");
    ensure((await request(context, `/api/published/products/${normal.record.slug}`, null)).status === 404, "normal_unpriced_product_became_public");
  }

  const source = await createProduct(context, state, auth, "source-observation", {
    sourceObservation,
    sourceReview: [note],
  });
  if (process.argv.includes("--inventory-draft-only")) {
    for (const [fixture, expected] of [[normal, false], [source, true]]) {
      const response = await request(context, `/api/admin/inventory?q=${encodeURIComponent(fixture.variant.sku)}&limit=10`, auth.staff.appToken);
      const body = await responseBody(response, 200, "draft_inventory");
      const item = body.items?.find((entry) => entry.id === fixture.variant.id);
      ensure(item?.sourceOnly === expected && (!expected || (item.stock === null && item.stockVersion === null)), "draft_inventory_source_state_invalid");
    }
    return;
  }
  const savedResponse = await request(context, `/api/admin/products/${source.record.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion: source.record.version,
    document: { ...source.record.document, summary: `Saved source fixture ${state.runId}.` },
  });
  const savedBody = await responseBody(savedResponse, 200, "source_observation_save");
  ensure(savedBody.record?.document?.sourceReview?.[0] === note, "staff_source_review_not_saved");
  const staleResponse = await request(context, `/api/admin/products/${source.record.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion: source.record.version,
    document: savedBody.record.document,
  });
  await responseBody(staleResponse, 409, "stale_source_observation_save");

  const publishResponse = await request(context, `/api/admin/products/${source.record.id}/publish`, auth.staff.appToken, "POST", {
    expectedVersion: savedBody.record.version,
  });
  const publishedBody = await responseBody(publishResponse, 200, "source_observation_publish");
  const published = publishedBody.record;
  ensure(published?.publishedRevisionId, "source_observation_revision_missing");

  const catalogResponse = await request(context, `/api/catalog?q=${encodeURIComponent(source.variant.sku)}&limit=48`, null);
  const catalog = await responseBody(catalogResponse, 200, "source_observation_catalog");
  const listed = catalog.items?.find((item) => item.id === published.id);
  ensure(listed && listed.document?.sourceObservation?.priceText === sourceObservation.priceText, "source_observation_missing_from_catalog");
  const listedVariant = listed.variants?.[0];
  ensure(listedVariant?.regularPricePaise === null && listedVariant.effectivePricePaise === null &&
    listedVariant.availability === "unavailable" && listedVariant.purchasable === false, "source_observation_catalog_variant_not_masked");
  ensure(!("sourceReview" in listed.document) && !JSON.stringify(listed).includes(note), "source_review_leaked_to_catalog");

  const inventoryResponse = await request(context, `/api/admin/inventory?q=${encodeURIComponent(source.variant.sku)}&limit=10`, auth.staff.appToken);
  const inventoryBody = await responseBody(inventoryResponse, 200, "source_observation_inventory");
  const inventoryVariant = inventoryBody.items?.find((item) => item.id === source.variant.id);
  ensure(inventoryVariant?.sourceOnly === true && inventoryVariant.stock === null && inventoryVariant.stockVersion === null,
    "source_observation_inventory_stock_not_masked");

  const detailResponse = await request(context, `/api/published/products/${source.record.slug}`, null);
  const detailBody = await responseBody(detailResponse, 200, "source_observation_detail");
  const detail = detailBody.record;
  ensure(detail?.document?.sourceObservation?.priceText === sourceObservation.priceText &&
    detail.document.sourceObservation.capturedAt === sourceObservation.capturedAt &&
    detail.document.sourceObservation.sourceUrl === sourceObservation.sourceUrl, "source_observation_detail_fields_missing");
  ensure(!("sourceReview" in detail.document) && !JSON.stringify(detailBody).includes(note), "source_review_leaked_to_detail");
  const publicVariant = detail.variants?.[0];
  ensure(publicVariant?.regularPricePaise === null && publicVariant.effectivePricePaise === null &&
    publicVariant.isOnSale === false && publicVariant.availability === "unavailable" && publicVariant.purchasable === false,
  "source_observation_variant_not_masked");

  const priceUpdate = await request(context, `/api/admin/pricing/${source.variant.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion: 0,
    regularPaise: 99_900,
    salePaise: null,
    saleFrom: null,
    saleUntil: null,
    reason: "Source observation must stay unpriced",
  });
  await responseBody(priceUpdate, 409, "source_observation_price_write");
  const stockUpdate = await request(context, `/api/admin/inventory/${source.variant.id}`, auth.staff.appToken, "PATCH", {
    expectedVersion: 0,
    delta: 1,
    requestId: randomUUID(),
    reason: "Source observation must stay unavailable",
  });
  await responseBody(stockUpdate, 409, "source_observation_stock_write");

  const initialQuoteResponse = await request(context, "/api/cart/quote", null, "POST", {
    items: [{ variantId: source.variant.id, quantity: 1 }],
  });
  const initialQuote = await responseBody(initialQuoteResponse, 200, "source_observation_quote");
  ensure(initialQuote.lines?.[0]?.issue === "not_available" && initialQuote.lines[0].lineTotalPaise === null &&
    initialQuote.subtotalPaise === null && !initialQuote.readyForCheckout, "source_observation_initial_quote_ready");

  // Simulate an out-of-band price and stock row to ensure read paths still enforce the document mode.
  const roguePrice = await table(context.admin, "catalog_variants").update({ regular_paise: 99_900 }).eq("id", source.variant.id).select("id");
  ensure(!roguePrice.error && roguePrice.data?.some((row) => row.id === source.variant.id), "rogue_price_fixture_failed");
  const rogueStock = await table(context.admin, "inventory_balances").update({ available_quantity: 1 }).eq("variant_id", source.variant.id).select("variant_id");
  ensure(!rogueStock.error && rogueStock.data?.some((row) => row.variant_id === source.variant.id), "rogue_stock_fixture_failed");

  const detailAfterRogueResponse = await request(context, `/api/published/products/${source.record.slug}`, null);
  const detailAfterRogue = (await responseBody(detailAfterRogueResponse, 200, "source_observation_rogue_detail")).record;
  const roguePublicVariant = detailAfterRogue.variants?.[0];
  ensure(roguePublicVariant?.regularPricePaise === null && roguePublicVariant.effectivePricePaise === null &&
    roguePublicVariant.isOnSale === false && roguePublicVariant.availability === "unavailable", "rogue_price_leaked_to_detail");

  const quoteResponse = await request(context, "/api/cart/quote", null, "POST", {
    items: [{ variantId: source.variant.id, quantity: 1 }],
  });
  const quote = await responseBody(quoteResponse, 200, "source_observation_rogue_quote");
  ensure(quote.lines?.[0]?.issue === "not_available" && quote.lines[0].lineTotalPaise === null &&
    quote.lines[0].variant === null && quote.subtotalPaise === null && !quote.readyForCheckout,
  "rogue_price_made_source_observation_cartable");
  const replaceCart = await request(context, "/api/cart", auth.customer.appToken, "PUT", {
    expectedVersion: 0,
    items: [{ variantId: source.variant.id, quantity: 1 }],
  });
  await responseBody(replaceCart, 409, "source_observation_cart_replace");

  const priceFiltered = await rpc(anon, "published_list_products", publicProductQuery(source.variant.sku, { p_min_price_paise: 1 }));
  ensure(!priceFiltered.error && !priceFiltered.data.items.some((item) => item.id === published.id), "source_observation_price_filter_match");
  for (const availability of ["available", "unavailable"]) {
    const filtered = await rpc(anon, "published_list_products", publicProductQuery(source.variant.sku, { p_availability: availability }));
    ensure(!filtered.error && !filtered.data.items.some((item) => item.id === published.id), `source_observation_${availability}_filter_match`);
  }

  const adminAfterPublish = await request(context, `/api/admin/products/${source.record.id}`, auth.staff.appToken);
  const adminBody = await responseBody(adminAfterPublish, 200, "source_observation_admin_read");
  ensure(adminBody.record?.document?.sourceReview?.[0] === note, "staff_source_review_not_private_and_editable");

  const unpublish = await request(context, `/api/admin/products/${source.record.id}/unpublish`, auth.staff.appToken, "POST", {
    expectedVersion: published.version,
  });
  const unpublishBody = await responseBody(unpublish, 200, "source_observation_unpublish");
  ensure(unpublishBody.record?.publishedRevisionId === null, "source_observation_unpublish_failed");
  ensure((await request(context, `/api/published/products/${source.record.slug}`, null)).status === 404, "unpublished_source_observation_detail_public");
  const withdrawnList = await request(context, `/api/catalog?q=${encodeURIComponent(source.variant.sku)}&limit=48`, null);
  const withdrawn = await responseBody(withdrawnList, 200, "source_observation_withdrawn_catalog");
  ensure(!withdrawn.items?.some((item) => item.id === published.id), "unpublished_source_observation_still_listed");
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
    const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
    ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
    const anon = createClient({ baseUrl: context.baseUrl, anonKey, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
    await verifySourceObservation(context, state, fixtures.auth, anon);
  } catch (error) {
    primaryFailure = error instanceof HarnessFailure ? error : new HarnessFailure("source_observation_verification_failed");
  } finally {
    if (state.users.length) {
      try {
        await cleanup(context, state);
      } catch (error) {
        try { await checkpoint(state); } catch { /* Keep the fixture manifest recoverable when possible. */ }
        primaryFailure ??= error instanceof HarnessFailure ? error : new HarnessFailure("fixture_cleanup_failed");
      }
    }
  }
  if (primaryFailure) throw primaryFailure;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--cleanup", "--inventory-draft-only"].includes(arg)) || args.size > 1) {
    console.error("Source observation integration harness stopped safely: invalid_command_line.");
    process.exitCode = 2;
    return;
  }
  let context;
  try {
    context = await preflight();
  } catch (error) {
    console.error(`Source observation integration preflight failed safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  try {
    if (args.has("--cleanup")) await cleanupStored(context);
    else await run(context);
    console.log(args.has("--cleanup")
      ? "Verified source observation fixtures removed."
      : "Source observation development integration checks passed.");
  } catch (error) {
    console.error(`Source observation integration harness failed safely: ${error instanceof HarnessFailure ? error.label : "integration_failed"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
