import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures, appRequest, safeJson } from "./phase2-isolation.mjs";

const journal = new URL("../.bootstrap/commerce-simulation-fixtures.json", import.meta.url);
const keyFile = new URL("../.bootstrap/commerce-simulation/key.txt", import.meta.url);
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args) => client.database.schema("public").rpc(name, args);
const check = (value, label) => assert.ok(value, label);
let pendingSave = Promise.resolve();
async function save(state, create = false) {
  pendingSave = pendingSave.then(async () => {
    await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
    await writeFile(journal, `${JSON.stringify(state, null, 2)}\n`, { ...(create ? { flag: "wx" } : {}) });
  });
  await pendingSave;
}
async function request(context, route, token, method = "GET", value, owner) {
  return appRequest(context.appOrigin, route, token, { method, headers: { ...(owner ? { "x-account-owner": owner } : {}), ...(value === undefined ? {} : { origin: context.appOrigin, "content-type": "application/json" }) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
}
async function body(response, status, label) {
  assert.equal(response.status, status, `${label}_status`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  return safeJson(response, `${label}_json`);
}
async function cleanup(context, state) {
  check(state.purpose === "commerce-simulation" && /^[0-9a-f-]{36}$/i.test(state.runId), "invalid_journal");
  check(Array.isArray(state.users) && state.users.length <= 2 && Array.isArray(state.requests), "invalid_journal");
  for (const user of state.users) await verifyFixtureOwnership(context.clerk, user);
  const ids = state.users.map(user => user.userId);
  if (state.requests.length) {
    check(state.requests.every(r => ids.includes(r.subject) && /^[0-9a-f-]{36}$/i.test(r.key) && typeof r.email === "string"), "invalid_request_journal");
    const rows = [];
    const keys = [...new Set(state.requests.map(r => r.key))];
    for (let i = 0; i < keys.length; i += 20) {
      const result = await table(context.admin, "admin_order_records").select("id,reference,customer_subject,environment,request_key,snapshot").in("request_key", keys.slice(i, i + 20));
      check(!result.error, "order_cleanup_read_failed");
      rows.push(...result.data);
    }
    for (const row of rows) {
      const request = state.requests.find(r => r.key === row.request_key && r.subject === row.customer_subject);
      check(request && row.environment === "simulation" && row.reference === `SIM-${row.id}` && row.snapshot?.contact?.email === request.email && (!request.id || request.id === row.id), "order_cleanup_mismatch");
      const existingEvents = await table(context.admin, "cms_audit_events").select("id,actor,action").eq("entity_type", "order").eq("entity_id", row.id);
      check(!existingEvents.error && existingEvents.data.every(event => ids.includes(event.actor) && ["order.simulate", "order.update"].includes(event.action)), "unexpected_order_events");
      const events = await table(context.admin, "cms_audit_events").delete().eq("entity_type", "order").eq("entity_id", row.id).in("actor", ids);
      check(!events.error, "order_events_cleanup_failed");
      const deleted = await table(context.admin, "admin_order_records").delete().eq("id", row.id).eq("reference", row.reference).eq("customer_subject", request.subject).eq("environment", "simulation").eq("request_key", request.key).select("id");
      check(!deleted.error && deleted.data.length === 1, "order_cleanup_failed");
    }
  }
  if (ids.length && state.requests.length) {
    for (const user of state.users) {
      const keys = state.requests.filter(r => r.subject === user.userId).map(r => r.key);
      if (!keys.length) continue;
      for (let i = 0; i < keys.length; i += 20) {
        const closed = await table(context.admin, "commerce_simulation_closed_requests").delete().eq("subject", user.userId).in("request_key", keys.slice(i, i + 20));
        check(!closed.error, "closed_requests_cleanup_failed");
      }
    }
  }
  if (ids.length) {
    for (const name of ["customer_carts", "customer_favorites", "commerce_simulation_actors"]) {
      const result = await table(context.admin, name).delete().in(name === "commerce_simulation_actors" ? "subject" : "user_id", ids);
      check(!result.error, `${name}_cleanup_failed`);
    }
    await cleanFixtures(context, state.users, state.runId);
  }
  await unlink(journal);
}
async function main() {
  const args = process.argv.slice(2);
  check(args.length === 0 || (args.length === 1 && args[0] === "--cleanup"), "invalid_arguments");
  const context = await preflight();
  check(context.appOrigin === "http://localhost:3040" || context.appOrigin === "http://127.0.0.1:3040", "port_3040_required");
  if (args[0] === "--cleanup") return cleanup(context, JSON.parse(await readFile(journal, "utf8")));
  const proof = (await readFile(keyFile, "utf8")).trim();
  check(proof.length >= 32 && proof.length <= 256, "invalid_simulation_key");
  const state = { purpose: "commerce-simulation", runId: randomUUID(), users: [], requests: [] };
  await save(state, true);
  try {
    const fixture = await createFixtures(context.clerk, state.runId, user => state.users.push(user));
    state.users = fixture.users;
    await save(state);
    const [customer, staff] = state.users;
    const { auth } = fixture;
    const catalogResponse = await request(context, "/api/catalog?limit=48", null);
    assert.equal(catalogResponse.status, 200);
    const catalog = await safeJson(catalogResponse, "catalog_json");
    const variants = catalog.items.map(item => item.variants.find(v => v.cartEligible && Number.isSafeInteger(v.effectivePricePaise))).filter(Boolean);
    check(variants.length >= 2, "two_published_variants_required");
    const [first, second] = variants;
    assert.equal((await request(context, "/api/checkout/capabilities", null)).status, 401);
    const unavailableCapability = await body(await request(context, "/api/checkout/capabilities", auth.customer.appToken), 200, "capability_unenrolled");
    assert.deepEqual(unavailableCapability, { simulationAvailable: false });
    const hash = createHash("sha256").update(proof).digest("hex");
    let result = await table(context.admin, "commerce_simulation_actors").insert(state.users.map(u => ({ subject: u.userId, proof_hash: hash, fictional_shipping_paise: 123, fictional_tax_paise: 45 })));
    check(!result.error, "actor_fixture_failed");
    result = await table(context.admin, "commerce_simulation_stock").insert(state.users.flatMap(u => [first, second].map(v => ({ subject: u.userId, variant_id: v.id, quantity: 5 }))));
    check(!result.error, "stock_fixture_failed");
    const capability = await body(await request(context, "/api/checkout/capabilities", auth.customer.appToken), 200, "capability_enrolled");
    assert.deepEqual(capability, { simulationAvailable: true, fictionalShippingPaise: 123, fictionalTaxPaise: 45 });
    const wrongCapability = await rpc(auth.customer.database, "customer_simulation_capabilities", { p_proof: "wrong-proof".repeat(4) });
    check(!wrongCapability.error && wrongCapability.data.simulationAvailable === false, "wrong_proof_capability_allowed");
    const address = { recipientName: "Fixture Customer", phone: "9999999999", line1: "Test Street", line2: "", city: "Test City", state: "Test State", postalCode: "123456", country: "India" };
    const make = (user, items, mode = "buy-now", version = null) => ({ idempotencyKey: randomUUID(), mode, expectedCartVersion: version, expectedSubtotalPaise: items.reduce((sum, item) => sum + variants.find(v => v.id === item.variantId).effectivePricePaise * item.quantity, 0), items, contact: { email: user.email, firstName: "Fixture", lastName: "Customer", phone: "9999999999" }, shipping: address, billing: address, business: "", gstin: "" });
    async function simulate(user, token, input) {
      if (!state.requests.some(r => r.key === input.idempotencyKey)) {
        state.requests.push({ key: input.idempotencyKey, subject: user.userId, email: user.email });
        await save(state);
      }
      const response = await request(context, "/api/checkout/simulate", token, "POST", input, user.userId);
      const data = await safeJson(response, "simulation_json");
      if (response.status === 200) {
        const entry = state.requests.find(r => r.key === input.idempotencyKey);
        check(/^SIM-[0-9a-f-]{36}$/i.test(data.reference), "invalid_order_reference");
        entry.id = data.reference.slice(4);
        await save(state);
      }
      return { response, data };
    }
    async function recover(user, token, key) {
      if (!state.requests.some(r => r.key === key && r.subject === user.userId)) {
        state.requests.push({ key, subject: user.userId, email: user.email });
        await save(state);
      }
      const response = await request(context, "/api/checkout/simulate/recover", token, "POST", { idempotencyKey: key }, user.userId);
      const data = await safeJson(response, "recovery_json");
      if (response.status === 200 && data.state === "created") {
        check(/^SIM-[0-9a-f-]{36}$/i.test(data.order.reference), "invalid_recovered_reference");
        state.requests.find(r => r.key === key && r.subject === user.userId).id = data.order.reference.slice(4);
        await save(state);
      }
      return { response, data };
    }
    const line = (variant, quantity) => ({ variantId: variant.id, quantity });
    const input = make(customer, [line(first, 2)]);
    const missingOwner = await request(context, "/api/checkout/simulate", auth.customer.appToken, "POST", input);
    assert.equal(missingOwner.status, 409);
    const wrongOwner = await request(context, "/api/checkout/simulate", auth.customer.appToken, "POST", input, staff.userId);
    assert.equal(wrongOwner.status, 409);
    const wrong = await rpc(auth.customer.database, "customer_simulate_checkout", { p_request: input, p_proof: "wrong-proof".repeat(4) });
    check(!!wrong.error, "wrong_proof_allowed");
    for (const name of ["commerce_simulation_actors", "commerce_simulation_stock", "commerce_simulation_closed_requests", "admin_order_records"]) {
      const denied = await table(auth.customer.database, name).select("*").limit(1);
      check(!!denied.error, `direct_${name}_allowed`);
    }
    const deniedClosedWrite = await table(auth.customer.database, "commerce_simulation_closed_requests").insert({ subject: customer.userId, request_key: randomUUID() });
    check(!!deniedClosedWrite.error, "direct_closed_write_allowed");
    const deniedCore = await rpc(auth.customer.database, "customer_simulate_checkout_unchecked", { p_request: input, p_proof: proof });
    check(!!deniedCore.error, "unchecked_core_allowed");
    let cart = await body(await request(context, "/api/cart", auth.customer.appToken), 200, "cart_read");
    cart = await body(await request(context, "/api/cart", auth.customer.appToken, "PUT", { expectedVersion: cart.version, items: [line(second, 2)] }), 200, "buy_now_cart_setup");
    const priceMismatch = await simulate(customer, auth.customer.appToken, { ...make(customer, [line(first, 1)]), expectedSubtotalPaise: first.effectivePricePaise + 1 });
    assert.equal(priceMismatch.response.status, 409);
    assert.equal(priceMismatch.data.error.code, "price_changed");
    const unchangedStock = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", first.id).single();
    check(!unchangedStock.error && unchangedStock.data.quantity === 5, "price_change_stock_mutated");
    const emptyOrders = await body(await request(context, "/api/account/orders", auth.customer.appToken), 200, "price_change_orders");
    assert.equal(emptyOrders.total, 0);
    assert.deepEqual(await body(await request(context, "/api/cart", auth.customer.appToken), 200, "price_change_cart"), cart);
    const quoted = await body(await request(context, "/api/cart/quote", null, "POST", { items: input.items }), 200, "quote");
    const firstOrder = await simulate(customer, auth.customer.appToken, input);
    assert.equal(firstOrder.response.status, 200);
    assert.equal(firstOrder.data.totalPaise, quoted.subtotalPaise + 168);
    assert.equal(firstOrder.data.environment, "simulation");
    assert.deepEqual(await body(await request(context, "/api/cart", auth.customer.appToken), 200, "buy_now_cart_unchanged"), cart);
    const customerList = await body(await request(context, "/api/account/orders", auth.customer.appToken), 200, "customer_order_list");
    assert.equal(customerList.total, 1);
    assert.equal(customerList.items[0].reference, firstOrder.data.reference);
    const otherList = await body(await request(context, "/api/account/orders", auth.staff.appToken), 200, "other_order_list");
    assert.equal(otherList.total, 0);
    const repeated = await simulate(customer, auth.customer.appToken, input);
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.data.reference, firstOrder.data.reference);
    const recoveryCart = await body(await request(context, "/api/cart", auth.customer.appToken), 200, "recovery_cart_before");
    for (let i = 0; i < 2; i++) {
      const recovered = await recover(customer, auth.customer.appToken, input.idempotencyKey);
      assert.equal(recovered.response.status, 200);
      assert.equal(recovered.data.state, "created");
      assert.equal(recovered.data.order.reference, firstOrder.data.reference);
    }
    assert.deepEqual(await body(await request(context, "/api/cart", auth.customer.appToken), 200, "recovery_cart_after"), recoveryCart);
    assert.equal((await body(await request(context, "/api/account/orders", auth.customer.appToken), 200, "recovery_order_count")).total, 1);
    const crossOwner = await recover(staff, auth.staff.appToken, input.idempotencyKey);
    assert.equal(crossOwner.response.status, 200);
    assert.deepEqual(crossOwner.data, { state: "not_created" });
    const closedInput = make(customer, [line(first, 1)]);
    const closed = await recover(customer, auth.customer.appToken, closedInput.idempotencyKey);
    assert.equal(closed.response.status, 200);
    assert.deepEqual(closed.data, { state: "not_created" });
    const late = await simulate(customer, auth.customer.appToken, closedInput);
    assert.equal(late.response.status, 409);
    assert.equal(late.data.error.code, "attempt_closed");
    assert.deepEqual(await body(await request(context, "/api/cart", auth.customer.appToken), 200, "closed_cart_after"), recoveryCart);
    assert.equal((await body(await request(context, "/api/account/orders", auth.customer.appToken), 200, "closed_order_count")).total, 1);
    const recoverRoute = "/api/checkout/simulate/recover";
    assert.equal((await request(context, recoverRoute, null, "POST", { idempotencyKey: randomUUID() })).status, 401);
    assert.equal((await request(context, recoverRoute, auth.customer.appToken, "POST", { idempotencyKey: randomUUID() })).status, 409);
    assert.equal((await request(context, recoverRoute, auth.customer.appToken, "POST", { idempotencyKey: randomUUID() }, staff.userId)).status, 409);
    assert.equal((await request(context, recoverRoute, auth.customer.appToken, "POST", { idempotencyKey: "invalid" }, customer.userId)).status, 400);
    const foreignOrigin = await appRequest(context.appOrigin, recoverRoute, auth.customer.appToken, { method: "POST", headers: { origin: "https://example.com", "content-type": "application/json", "x-account-owner": customer.userId }, body: JSON.stringify({ idempotencyKey: randomUUID() }) });
    assert.equal(foreignOrigin.status, 403);
    const wrongRecoveryProof = await rpc(auth.customer.database, "customer_recover_simulated_checkout", { p_request_key: randomUUID(), p_proof: "wrong-proof".repeat(4) });
    check(!!wrongRecoveryProof.error, "wrong_recovery_proof_allowed");
    const conflict = await simulate(customer, auth.customer.appToken, { ...input, items: [line(first, 1)] });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.data.error.code, "idempotency_conflict");
    const stock = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", first.id).single();
    check(!stock.error && stock.data.quantity === 3, "repeat_debited_stock");
    const raceInputs = [make(customer, [line(first, 2)]), make(customer, [line(first, 2)])];
    state.requests.push(...raceInputs.map(item => ({ key: item.idempotencyKey, subject: customer.userId, email: customer.email })));
    await save(state);
    const race = await Promise.all(raceInputs.map(item => request(context, "/api/checkout/simulate", auth.customer.appToken, "POST", item, customer.userId)));
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
    for (let i = 0; i < race.length; i++) {
      const data = await safeJson(race[i], "race_json");
      if (race[i].status === 200) {
        check(/^SIM-[0-9a-f-]{36}$/i.test(data.reference), "invalid_order_reference");
        state.requests.find(r => r.key === raceInputs[i].idempotencyKey).id = data.reference.slice(4);
      } else assert.equal(data.error.code, "item_unavailable");
    }
    await save(state);
    const unavailable = await simulate(customer, auth.customer.appToken, make(customer, [line(first, 2)]));
    assert.equal(unavailable.response.status, 409);
    assert.equal(unavailable.data.error.code, "item_unavailable");
    const other = await request(context, `/api/account/orders/${firstOrder.data.reference}`, auth.staff.appToken);
    assert.equal(other.status, 404);
    assert.equal((await request(context, `/api/admin/orders/${firstOrder.data.reference}`, auth.staff.appToken)).status, 403);
    cart = await body(await request(context, "/api/cart", auth.customer.appToken, "PUT", { expectedVersion: cart.version, items: [line(first, 1), line(second, 2)] }), 200, "cart_replace");
    const stale = await simulate(customer, auth.customer.appToken, make(customer, [line(second, 1)], "cart", cart.version - 1));
    assert.equal(stale.response.status, 409);
    const cartOrder = await simulate(customer, auth.customer.appToken, make(customer, [line(second, 1)], "cart", cart.version));
    assert.equal(cartOrder.response.status, 200);
    const remaining = await body(await request(context, "/api/cart", auth.customer.appToken), 200, "cart_after");
    assert.equal(remaining.version, cart.version + 1);
    assert.deepEqual(remaining.items.slice().sort((a, b) => a.variantId.localeCompare(b.variantId)), [line(first, 1), line(second, 1)].sort((a, b) => a.variantId.localeCompare(b.variantId)));
    const raceInput = make(customer, [line(second, 1)]);
    state.requests.push({ key: raceInput.idempotencyKey, subject: customer.userId, email: customer.email });
    await save(state);
    const beforeRecoveryRaceStock = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", second.id).single();
    check(!beforeRecoveryRaceStock.error, "recovery_race_stock_read_failed");
    const [racedCreate, racedRecovery] = await Promise.all([
      simulate(customer, auth.customer.appToken, raceInput),
      recover(customer, auth.customer.appToken, raceInput.idempotencyKey),
    ]);
    assert.equal(racedRecovery.response.status, 200);
    if (racedRecovery.data.state === "created") {
      assert.equal(racedCreate.response.status, 200);
      assert.equal(racedRecovery.data.order.reference, racedCreate.data.reference);
    } else {
      assert.deepEqual(racedRecovery.data, { state: "not_created" });
      assert.equal(racedCreate.response.status, 409);
      assert.equal(racedCreate.data.error.code, "attempt_closed");
    }
    const raceOrders = await table(context.admin, "admin_order_records").select("id").eq("customer_subject", customer.userId).eq("request_key", raceInput.idempotencyKey);
    const afterRecoveryRaceStock = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", second.id).single();
    check(!raceOrders.error && !afterRecoveryRaceStock.error, "recovery_race_read_failed");
    assert.equal(raceOrders.data.length, racedRecovery.data.state === "created" ? 1 : 0);
    assert.equal(afterRecoveryRaceStock.data.quantity, beforeRecoveryRaceStock.data.quantity - raceOrders.data.length);
    assert.deepEqual(await body(await request(context, "/api/cart", auth.customer.appToken), 200, "race_cart_after"), remaining);
    const favoriteProducts = catalog.items.filter(item => item.variants.some(v => [first.id, second.id].includes(v.id)));
    check(favoriteProducts.length >= 2, "two_favorite_products_required");
    const [productA, productB] = favoriteProducts;
    assert.equal((await request(context, "/api/account/favorites", null)).status, 401);
    assert.deepEqual(await body(await request(context, "/api/account/favorites", auth.customer.appToken, "GET", undefined, staff.userId), 409, "favorite_wrong_owner_get"), { error: { code: "account_changed" } });
    assert.deepEqual(await body(await request(context, "/api/account/favorites", auth.customer.appToken, "PUT", { expectedVersion: 0, productIds: [productA.id] }, staff.userId), 409, "favorite_wrong_owner_put"), { error: { code: "account_changed" } });
    assert.deepEqual(await body(await request(context, "/api/account/favorites", auth.customer.appToken), 409, "favorite_missing_owner"), { error: { code: "account_changed" } });
    const favA = await body(await request(context, "/api/account/favorites", auth.customer.appToken, "PUT", { expectedVersion: 0, productIds: [productA.id] }, customer.userId), 200, "favorite_customer");
    assert.deepEqual(favA, { version: 1, items: [{ productId: productA.id, title: productA.title, slug: productA.slug }] });
    const favB = await body(await request(context, "/api/account/favorites", auth.staff.appToken, "PUT", { expectedVersion: 0, productIds: [productB.id] }, staff.userId), 200, "favorite_other");
    assert.deepEqual(favB, { version: 1, items: [{ productId: productB.id, title: productB.title, slug: productB.slug }] });
    assert.equal((await request(context, "/api/account/favorites", auth.customer.appToken, "PUT", { expectedVersion: 0, productIds: [productB.id] }, customer.userId)).status, 409);
    assert.deepEqual(await body(await request(context, "/api/account/favorites", auth.customer.appToken, "GET", undefined, customer.userId), 200, "favorite_customer_read"), favA);
    assert.deepEqual(await body(await request(context, "/api/account/favorites", auth.staff.appToken, "GET", undefined, staff.userId), 200, "favorite_other_read"), favB);
    const crossFavorites = await table(auth.customer.database, "customer_favorite_items").select("user_id,product_id").eq("user_id", staff.userId);
    check(!crossFavorites.error && crossFavorites.data.length === 0, "favorites_rls_leaked");
    const deniedFavoriteWrite = await table(auth.customer.database, "customer_favorite_items").insert({ user_id: staff.userId, product_id: productA.id });
    check(!!deniedFavoriteWrite.error, "favorites_direct_write_allowed");
    result = await rpc(context.admin, "set_staff_capability", { target_user_id: staff.userId, capability_name: "staff.manage", enabled: true, reason: `Disposable simulation ${state.runId}` });
    check(!result.error, "staff_grant_failed");
    const update = await body(await request(context, `/api/admin/orders/${firstOrder.data.reference}`, auth.staff.appToken, "PATCH", { expectedVersion: firstOrder.data.version, status: "processing", shipping: { carrier: "Test", trackingNumber: "TEST", trackingUrl: "" } }), 200, "fulfillment");
    assert.equal(update.status, "processing");
    const shipping = { carrier: "Test", trackingNumber: "TEST", trackingUrl: "" };
    const staleAdmin = await request(context, `/api/admin/orders/${firstOrder.data.reference}`, auth.staff.appToken, "PATCH", { expectedVersion: firstOrder.data.version, status: "fulfilled", shipping });
    assert.equal(staleAdmin.status, 409);
    const invalidTransition = await request(context, `/api/admin/orders/${firstOrder.data.reference}`, auth.staff.appToken, "PATCH", { expectedVersion: update.version, status: "pending", shipping });
    assert.equal(invalidTransition.status, 409);
    const visible = await body(await request(context, `/api/account/orders/${firstOrder.data.reference}`, auth.customer.appToken), 200, "customer_order");
    assert.equal(visible.status, "processing");
    const beforeCancel = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", first.id).single();
    check(!beforeCancel.error, "cancel_stock_read_failed");
    const cancelled = await body(await request(context, `/api/admin/orders/${firstOrder.data.reference}`, auth.staff.appToken, "PATCH", { expectedVersion: update.version, status: "cancelled", shipping }), 200, "cancel_order");
    const released = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", first.id).single();
    check(!released.error && released.data.quantity === beforeCancel.data.quantity + 2, "cancel_stock_not_restored");
    await body(await request(context, `/api/admin/orders/${firstOrder.data.reference}`, auth.staff.appToken, "PATCH", { expectedVersion: cancelled.version, status: "cancelled", shipping }), 200, "repeat_cancel");
    const afterRepeat = await table(context.admin, "commerce_simulation_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", first.id).single();
    check(!afterRepeat.error && afterRepeat.data.quantity === released.data.quantity, "cancel_stock_restored_twice");
    const existingClosed = await table(context.admin, "commerce_simulation_closed_requests").select("request_key").eq("subject", customer.userId);
    check(!existingClosed.error && existingClosed.data.length < 99, "closed_limit_fixture_read_failed");
    const seedKeys = Array.from({ length: 99 - existingClosed.data.length }, () => randomUUID());
    state.requests.push(...seedKeys.map(key => ({ key, subject: customer.userId, email: customer.email })));
    await save(state);
    result = await table(context.admin, "commerce_simulation_closed_requests").insert(seedKeys.map(key => ({ subject: customer.userId, request_key: key })));
    check(!result.error, "closed_limit_fixture_failed");
    const limitRace = await Promise.all([recover(customer, auth.customer.appToken, randomUUID()), recover(customer, auth.customer.appToken, randomUUID())]);
    assert.deepEqual(limitRace.map(item => item.response.status).sort(), [200, 409]);
    assert.deepEqual(limitRace.find(item => item.response.status === 200).data, { state: "not_created" });
    assert.equal(limitRace.find(item => item.response.status === 409).data.error.code, "recovery_limit");
    const atLimit = await table(context.admin, "commerce_simulation_closed_requests").select("request_key").eq("subject", customer.userId);
    check(!atLimit.error && atLimit.data.length === 100, "closed_limit_exceeded");
    const repeatAtLimit = await recover(customer, auth.customer.appToken, closedInput.idempotencyKey);
    assert.equal(repeatAtLimit.response.status, 200);
    assert.deepEqual(repeatAtLimit.data, { state: "not_created" });
    result = await table(context.admin, "commerce_simulation_actors").delete().eq("subject", customer.userId);
    check(!result.error, "actor_removal_failed");
    const existingWithoutActor = await recover(customer, auth.customer.appToken, input.idempotencyKey);
    assert.equal(existingWithoutActor.response.status, 200);
    assert.equal(existingWithoutActor.data.order.reference, firstOrder.data.reference);
    const closedWithoutActor = await recover(customer, auth.customer.appToken, closedInput.idempotencyKey);
    assert.equal(closedWithoutActor.response.status, 200);
    assert.deepEqual(closedWithoutActor.data, { state: "not_created" });
    const absentWithoutActor = await recover(customer, auth.customer.appToken, randomUUID());
    assert.equal(absentWithoutActor.response.status, 403);
    console.log("Simulation integration passed.");
  } finally {
    await save(state);
    await cleanup(context, state);
  }
}
main().catch(error => { console.error(`Simulation integration failed: ${error.message}`); process.exitCode = 1; });
