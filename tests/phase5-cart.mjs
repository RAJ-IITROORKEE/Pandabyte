import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { createClient } from "@insforge/sdk";
import { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures, appRequest, safeJson } from "./phase2-isolation.mjs";
import { ensureOwnedCleanup } from "./phase3-publishing.mjs";

const fixturePath = new URL("../.bootstrap/phase5-cart-fixtures.json", import.meta.url);
const capabilities = ["catalog.edit", "content.publish", "orders.manage"];
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args = {}) => client.database.schema("public").rpc(name, args);
const check = (condition, label) => { if (!condition) throw new Error(label); };
async function save(state) {
  await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(state, null, 2)}\n`);
}
async function request(context, route, token, method = "GET", json) {
  return appRequest(context.appOrigin, route, token, { method, ...(json === undefined ? {} : {
    headers: { origin: context.appOrigin, "content-type": "application/json" }, body: JSON.stringify(json),
  }) });
}
async function body(response, status, label) {
  check(response.status === status, `${label}_status_${response.status}`);
  check(response.headers.get("cache-control")?.includes("no-store"), `${label}_cacheable`);
  return safeJson(response, `${label}_json`);
}
async function cleanup(context, state) {
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  if (state.users.length) {
    const removed = await table(context.admin, "customer_carts").delete().in("user_id", state.users.map((u) => u.userId));
    check(!removed.error, "cart_cleanup_failed");
  }
  if (state.staffUserId) await ensureOwnedCleanup(context, state);
  else if (state.users.length) await cleanFixtures(context, state.users, state.runId);
  await unlink(fixturePath).catch((e) => { if (e.code !== "ENOENT") throw e; });
}
async function product(context, state, auth, suffix, publish = true) {
  const document = {
    title: `Phase3 ${state.runId} ${suffix}`, slug: `p5-${state.runId.slice(0, 8)}-${suffix}`,
    summary: "Disposable cart verification fixture.", blocks: [{ type: "paragraph", text: "Development verification only." }],
    seoTitle: "Cart test fixture", seoDescription: "Disposable cart test product.",
    categoryIds: [], variants: [{ sku: `P5-${state.runId.slice(0, 8)}-${suffix}`, label: "Published variant" }],
    specifications: [], compatibility: [], kitContents: [], resources: [], mediaIds: [], modelNumbers: [],
  };
  let result = await safeJson(await request(context, "/api/admin/products", auth.staff.appToken, "POST", { document }), "product_create_json");
  check(result.record?.id, "product_create_failed");
  let record = result.record;
  state.records.push({ id: record.id, module: "products", kind: "product", slug: record.slug });
  const variant = record.document.variants[0];
  state.variants.push({ id: variant.id, productId: record.id, sku: variant.sku });
  await save(state);
  for (const [area, patch] of [
    ["pricing", { expectedVersion: 0, regularPaise: 100_000, salePaise: 80_000,
      saleFrom: new Date(Date.now() - 3_600_000).toISOString(), saleUntil: new Date(Date.now() + 86_400_000).toISOString(), reason: "Disposable cart sale" }],
    ["inventory", { expectedVersion: 0, delta: 5, requestId: randomUUID(), reason: "Disposable cart stock" }],
  ]) {
    const r = await request(context, `/api/admin/${area}/${variant.id}`, auth.staff.appToken, "PATCH", patch);
    check(r.status === 200, `${area}_fixture_failed`);
  }
  if (publish) {
    for (const action of ["publish"]) {
      result = await safeJson(await request(context, `/api/admin/products/${record.id}/${action}`, auth.staff.appToken, "POST", { expectedVersion: record.version }), "publish_json");
      check(result.record?.id === record.id, `fixture_${action}_failed`);
      record = result.record;
    }
  }
  return { record, variant };
}
async function verify(context, state, auth) {
  const anon = createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY });
  const { record, variant } = await product(context, state, auth, "published");
  const draft = await product(context, state, auth, "draft", false);
  state.browser = { productSlug: record.slug, variantId: variant.id, draftId: draft.variant.id };
  await save(state);
  const items = [{ variantId: variant.id, quantity: 2 }];
  const quote = async (lines) => body(await request(context, "/api/cart/quote", null, "POST", { items: lines }), 200, "quote");
  let quoted = await quote(items);
  check(quoted.subtotalPaise === 160_000 && quoted.readyForCheckout && quoted.lines[0].variant.isOnSale, "sale_quote_failed");
  check(quoted.lines[0].title === record.document.title && quoted.lines[0].variant.sku === variant.sku, "published_identity_failed");
  check(!JSON.stringify(quoted).includes("available_quantity"), "raw_stock_leak");
  const highQuantity = await quote([{ variantId: variant.id, quantity: 99 }]);
  check(highQuantity.lines[0].issue === null && highQuantity.subtotalPaise === 7_920_000 && highQuantity.readyForCheckout, "quote_disclosed_stock_threshold");
  for (const [version, delta] of [[1, -5], [2, 5]]) {
    const changed = await request(context, `/api/admin/inventory/${variant.id}`, auth.staff.appToken, "PATCH", {
      expectedVersion: version, delta, requestId: randomUUID(), reason: "Cart binary availability test",
    });
    check(changed.status === 200, "binary_stock_adjustment_failed");
    const current = await quote(items);
    check(current.readyForCheckout === (delta > 0) && current.lines[0].issue === (delta > 0 ? null : "quantity_unavailable") && current.subtotalPaise === 160_000, "binary_stock_quote_failed");
  }
  for (const id of [draft.variant.id, randomUUID()]) {
    const missing = await quote([{ variantId: id, quantity: 1 }]);
    const line = missing.lines[0];
    check(line.issue === "not_available" && line.title === null && line.slug === null && line.variant === null && missing.subtotalPaise === null, "draft_or_unknown_leak");
  }
  for (const invalid of [[...items, ...items], [{ ...items[0], price: 1 }], [{ ...items[0], quantity: 0 }], Array.from({ length: 51 }, () => ({ variantId: randomUUID(), quantity: 1 }))]) {
    await body(await request(context, "/api/cart/quote", null, "POST", { items: invalid }), 400, "invalid_quote");
    const denied = await rpc(anon, "published_quote_cart", { p_items: invalid });
    check(!!denied.error, "direct_quote_validation_bypass");
  }
  const oversizedRpc = await rpc(anon, "published_quote_cart", { p_items: [{ variantId: "x".repeat(9000), quantity: 1 }] });
  check(!!oversizedRpc.error && oversizedRpc.error.details === "invalid_input", "direct_quote_payload_bound_failed");
  await body(await request(context, "/api/cart", null), 401, "anon_cart");
  for (const [name, args] of [["customer_get_cart", {}], ["customer_replace_cart", { p_expected_version: 0, p_items: [] }]]) {
    const denied = await rpc(anon, name, args);
    check(!!denied.error, "anonymous_private_rpc_allowed");
  }
  for (const name of ["customer_carts", "customer_cart_items"]) {
    const read = await table(anon, name).select("*").limit(1);
    check(!!read.error, "anonymous_table_access");
  }
  const get = async (who = "customer") => body(await request(context, "/api/cart", auth[who].appToken), 200, "get_cart");
  const put = async (expectedVersion, lines, status = 200, who = "customer") => body(await request(context, "/api/cart", auth[who].appToken, "PUT", { expectedVersion, items: lines }), status, "put_cart");
  let cart = await get();
  check(cart.version === 0 && cart.items.length === 0, "new_cart_not_empty");
  let raw = await table(context.admin, "customer_carts").select("user_id").eq("user_id", state.users.find((u) => u.role === "customer").userId);
  check(!raw.error && raw.data.length === 0, "get_mutated_cart");
  await put(0, [{ variantId: draft.variant.id, quantity: 1 }], 409);
  cart = await put(0, items);
  check(cart.version === 1 && cart.quote.subtotalPaise === 160_000, "initial_replace_failed");
  await put(0, [], 409);
  const race = await Promise.all([request(context, "/api/cart", auth.customer.appToken, "PUT", { expectedVersion: 1, items: [{ variantId: variant.id, quantity: 3 }] }), request(context, "/api/cart", auth.customer.appToken, "PUT", { expectedVersion: 1, items: [{ variantId: variant.id, quantity: 4 }] })]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409], "concurrent_replace_must_have_one_winner");
  cart = await get();
  check(cart.version === 2 && [3, 4].includes(cart.items[0].quantity), "concurrent_cart_incoherent");
  const staffCart = await get("staff");
  check(staffCart.version === 0 && staffCart.items.length === 0, "staff_inherited_customer_cart");
  for (const name of ["customer_carts", "customer_cart_items"]) {
    const own = await table(auth.customer.database, name).select("*").limit(10);
    check(!own.error && own.data.length === 1, "owner_rls_read_failed");
    const other = await table(auth.staff.database, name).select("*").limit(10);
    check(!other.error && other.data.length === 0, "cross_user_or_staff_read");
    const writes = await Promise.all([
      table(auth.customer.database, name).delete().eq("user_id", state.users[0].userId),
      table(auth.customer.database, name).update(name === "customer_carts" ? { version: 99 } : { quantity: 99 }).eq("user_id", state.users[0].userId),
      table(auth.customer.database, name).insert([{ user_id: state.users[1].userId, ...(name === "customer_cart_items" ? { variant_id: variant.id, quantity: 1 } : {}) }]),
    ]);
    check(writes.every((r) => !!r.error), "direct_cart_dml_allowed");
  }
  const forged = await request(context, "/api/cart", auth.customer.appToken, "PUT", { expectedVersion: cart.version, items, userId: state.staffUserId });
  await body(forged, 400, "forged_owner");
  const crossOrigin = await appRequest(context.appOrigin, "/api/cart", auth.customer.appToken, { method: "PUT", headers: { origin: "https://example.invalid", "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: cart.version, items }) });
  await body(crossOrigin, 403, "cross_origin");
  const large = await appRequest(context.appOrigin, "/api/cart/quote", null, { method: "POST", headers: { origin: context.appOrigin, "content-type": "application/json" }, body: " ".repeat(9000) });
  await body(large, 413, "oversize");

  // Draft label changes must not appear in a public cart until published.
  const draftDoc = { ...record.document, title: `Phase3 ${state.runId} private-draft`, variants: record.document.variants.map((v) => ({ ...v, label: "PRIVATE DRAFT LABEL" })) };
  const edited = await request(context, `/api/admin/products/${record.id}`, auth.staff.appToken, "PATCH", { expectedVersion: record.version, document: draftDoc });
  const editBody = await safeJson(edited, "draft_edit_json");
  check(edited.status === 200 && editBody.record, "draft_edit_failed");
  quoted = await quote(items);
  check(quoted.lines[0].title === record.document.title && quoted.lines[0].variant.label === "Published variant", "private_draft_quote_leak");
  const repriced = await request(context, `/api/admin/pricing/${variant.id}`, auth.staff.appToken, "PATCH", { expectedVersion: 1, regularPaise: 120_000, salePaise: null, saleFrom: null, saleUntil: null, reason: "Cart repricing test" });
  check(repriced.status === 200, "repricing_failed");
  quoted = await quote(items);
  check(quoted.subtotalPaise === 240_000 && !quoted.lines[0].variant.isOnSale, "stale_price_quote");
  const unpublish = await request(context, `/api/admin/products/${record.id}/unpublish`, auth.staff.appToken, "POST", { expectedVersion: editBody.record.version });
  check(unpublish.status === 200, "unpublish_failed");
  const unpublishedBody = await safeJson(unpublish, "unpublish_json");
  cart = await get();
  check(cart.quote.lines[0].issue === "not_available" && cart.quote.lines[0].title === null && !cart.quote.readyForCheckout, "unpublished_saved_cart_leak");
  cart = await put(cart.version, cart.items);
  check(cart.quote.lines[0].issue === "not_available", "retaining_unavailable_line_failed");
  await put(cart.version, []);
  // Restore fixture publication/current price for browser journeys only.
  let restored = unpublishedBody.record;
  for (const action of ["publish"]) {
    const r = await request(context, `/api/admin/products/${record.id}/${action}`, auth.staff.appToken, "POST", { expectedVersion: restored.version });
    const json = await safeJson(r, "restore_json");
    check(r.status === 200 && json.record, "restore_publication_failed");
    restored = json.record;
  }
  state.browser.productSlug = restored.slug;
  await save(state);
  console.log("Cart API/RLS checks passed: current pricing, publication isolation, bounds, ownership, direct-DML denial, one-winner concurrency and unavailable-line recovery.");
}
async function main() {
  const args = new Set(process.argv.slice(2));
  check([...args].every((a) => ["--keep-fixtures", "--cleanup"].includes(a)) && args.size < 2, "invalid_arguments");
  const context = await preflight();
  if (args.has("--cleanup")) {
    await cleanup(context, JSON.parse(await readFile(fixturePath, "utf8")));
    console.log("Verified disposable cart fixtures removed.");
    return;
  }
  try { await readFile(fixturePath); throw new Error("existing_fixtures_use_cleanup"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [] };
  try {
    const fixtures = await createFixtures(context.clerk, state.runId, (u) => state.users.push(u));
    state.users = fixtures.users;
    state.staffUserId = state.users.find((u) => u.role === "staff").userId;
    await save(state);
    for (const cap of capabilities) {
      const r = await rpc(context.admin, "set_staff_capability", { target_user_id: state.staffUserId, capability_name: cap, enabled: true, reason: `phase5 cart fixture ${state.runId}` });
      check(!r.error, "fixture_grant_failed");
    }
    await verify(context, state, fixtures.auth);
  } finally {
    if (args.has("--keep-fixtures") && state.users.length === 2) { await save(state); console.log("Disposable cart fixtures retained for built-in-browser checks."); }
    else await cleanup(context, state);
  }
}
main().catch((e) => { console.error(`Cart verification failed: ${/^[a-zA-Z0-9_]+$/.test(e.message) ? e.message : "assertion_failed"}.`); process.exitCode = 1; });
