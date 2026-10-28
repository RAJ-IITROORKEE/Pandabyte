// Explicit commands: --seed, --test, --journal-browser, --cleanup. Never removes managed provider history.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { appRequest, cleanFixtures, createFixtures, createRuntimeClient, preflight, safeJson, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const journal = new URL("../.bootstrap/razorpay-checkout-fixtures.json", import.meta.url);
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args) => client.database.schema("public").rpc(name, args);
const check = (value, label) => assert.ok(value, label);
const validUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function save(state, create = false) {
  await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
  await writeFile(journal, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, ...(create ? { flag: "wx" } : {}) });
}
async function load(context) {
  const state = JSON.parse(await readFile(journal, "utf8"));
  check(state.purpose === "razorpay-checkout-test" && validUuid(state.runId) && typeof state.proof === "string" && /^[0-9a-f]{64}$/.test(state.proof) && Array.isArray(state.users) && state.users.length <= 2 && Array.isArray(state.requests), "invalid_journal");
  for (const user of state.users) { check(user.runId === state.runId, "wrong_fixture_run"); await verifyFixtureOwnership(context.clerk, user); }
  const subjects = state.users.map(user => user.userId);
  check(state.requests.every(entry => subjects.includes(entry.subject) && validUuid(entry.key) && typeof entry.email === "string" && (!entry.id || validUuid(entry.id))), "invalid_request_journal");
  return state;
}
async function request(context, route, token, method = "GET", value, owner) {
  return appRequest(context.appOrigin, route, token, { method, headers: { ...(owner ? { "x-account-owner": owner } : {}), ...(value === undefined ? {} : { origin: context.appOrigin, "content-type": "application/json" }) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
}
async function body(response, status, label) {
  assert.equal(response.status, status, `${label}_status`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  return safeJson(response, label);
}
async function seed(context) {
  const publicKey = process.env.RAZORPAY_TEST_KEY_ID;
  check(typeof publicKey === "string" && /^rzp_test_[A-Za-z0-9]+$/.test(publicKey), "test_key_required");
  const state = { purpose: "razorpay-checkout-test", runId: randomUUID(), proof: process.env.RAZORPAY_CHECKOUT_TEST_KEY || randomBytes(32).toString("hex"), users: [], requests: [], variants: [] };
  await save(state, true);
  try {
    const fixture = await createFixtures(context.clerk, state.runId, user => state.users.push(user));
    state.users = fixture.users;
    await save(state);
    const response = await request(context, "/api/catalog?limit=48", null);
    assert.equal(response.status, 200);
    const catalog = await safeJson(response, "catalog_json");
    state.variants = catalog.items.flatMap(item => item.variants.filter(v => v.cartEligible && Number.isSafeInteger(v.effectivePricePaise) && v.effectivePricePaise > 0)).slice(0, 2).map(v => ({ id: v.id, price: v.effectivePricePaise }));
    check(state.variants.length === 2 && state.variants.every(v => validUuid(v.id)), "two_published_variants_required");
    await save(state);
    const hash = createHash("sha256").update(state.proof).digest("hex");
    let result = await table(context.admin, "razorpay_checkout_test_actors").insert(state.users.map(u => ({ subject: u.userId, proof_hash: hash, allowed_key_id: publicKey, fictional_shipping_paise: 123, fictional_tax_paise: 45 })));
    check(!result.error, "actor_fixture_failed");
    result = await table(context.admin, "razorpay_checkout_test_stock").insert(state.users.flatMap(u => state.variants.map(v => ({ subject: u.userId, variant_id: v.id, quantity: 5 }))));
    check(!result.error, "stock_fixture_failed");
    console.log("Fixture seed complete; journal retained for test, browser, and explicit cleanup.");
  } catch (error) { await save(state); throw error; }
}
async function authFor(context, fixture) {
  const mint = async () => (await context.clerk.sessions.getToken(fixture.sessionId, "insforge")).jwt;
  return { token: async () => (await context.clerk.sessions.getToken(fixture.sessionId)).jwt, database: createRuntimeClient(context.baseUrl, await mint(), mint) };
}
async function test(context, state) {
  check(state.users.length === 2 && state.variants.length === 2 && state.requests.length === 0, "fresh_seed_required");
  check(process.env.RAZORPAY_CHECKOUT_TEST_KEY === state.proof, "server_proof_environment_mismatch");
  const publicKey = process.env.RAZORPAY_TEST_KEY_ID;
  check(typeof publicKey === "string" && /^rzp_test_[A-Za-z0-9]+$/.test(publicKey), "test_key_required");
  const [customer, other] = state.users, customerAuth = await authFor(context, customer), otherAuth = await authFor(context, other);
  const root = "/api/checkout/razorpay-test";
  assert.equal((await request(context, `${root}/capabilities`, null)).status, 401);
  assert.deepEqual(await body(await request(context, `${root}/capabilities`, customerAuth.token), 200, "capabilities"), { razorpayTestAvailable: true, fictionalShippingPaise: 123, fictionalTaxPaise: 45 });
  const wrongProof = await rpc(customerAuth.database, "razorpay_test_capabilities", { p_proof: "x".repeat(64), p_key: publicKey });
  check(!wrongProof.error && wrongProof.data.razorpayTestAvailable === false, "wrong_proof_allowed");
  const wrongKey = publicKey === "rzp_test_wrongfixture" ? "rzp_test_otherfixture" : "rzp_test_wrongfixture";
  const wrongCapability = await rpc(customerAuth.database, "razorpay_test_capabilities", { p_proof: state.proof, p_key: wrongKey });
  check(!wrongCapability.error && wrongCapability.data.razorpayTestAvailable === false, "wrong_key_capability_allowed");
  for (const name of ["razorpay_checkout_test_actors", "razorpay_checkout_test_stock", "razorpay_checkout_test_attempts", "razorpay_checkout_test_closed_requests"]) check((await table(customerAuth.database, name).select("*").limit(1)).error, "private_table_access_allowed");
  const address = { recipientName: "Fixture Customer", phone: "9999999999", line1: "Test Street", line2: "", city: "Test City", state: "Test State", postalCode: "123456", country: "India" };
  const input = { idempotencyKey: randomUUID(), mode: "buy-now", expectedCartVersion: null, expectedSubtotalPaise: state.variants[0].price, items: [{ variantId: state.variants[0].id, quantity: 1 }], contact: { email: customer.email, firstName: "Fixture", lastName: "Customer", phone: "9999999999" }, shipping: address, billing: address, business: "", gstin: "" };
  const wrongPrepare = await rpc(customerAuth.database, "razorpay_test_prepare", { p_request: input, p_proof: state.proof, p_key: wrongKey });
  check(wrongPrepare.error?.code === "P0001" && wrongPrepare.error?.details === "connection_changed", "wrong_key_prepare_allowed");
  const wrongRecover = await rpc(customerAuth.database, "razorpay_test_recover", { p_request_key: input.idempotencyKey, p_proof: state.proof, p_key: wrongKey });
  check(wrongRecover.error?.code === "P0001" && wrongRecover.error?.details === "connection_changed", "wrong_key_recover_allowed");
  for (const [name, args] of [["razorpay_test_capabilities_unscoped", { p_proof: state.proof }], ["razorpay_test_prepare_unscoped", { p_request: input, p_proof: state.proof }], ["razorpay_test_bind_unscoped", { p_request_key: input.idempotencyKey, p_provider_order_id: "order_fixture", p_key: publicKey }]]) {
    check((await rpc(customerAuth.database, name, args)).error, "unscoped_rpc_access_allowed");
  }
  const entry = { subject: customer.userId, email: customer.email, key: input.idempotencyKey };
  state.requests.push(entry); await save(state);
  assert.equal((await request(context, `${root}/prepare`, null, "POST", input)).status, 401);
  assert.equal((await request(context, `${root}/prepare`, customerAuth.token, "POST", input, other.userId)).status, 409);
  const first = await body(await request(context, `${root}/prepare`, customerAuth.token, "POST", input, customer.userId), 200, "prepare");
  check(first.state === "ready" && first.key === publicKey && /^order_[A-Za-z0-9]+$/.test(first.providerOrderId) && first.totalPaise === input.expectedSubtotalPaise + 168 && /^TST-[0-9a-f-]{36}$/i.test(first.reference), "managed_creation_not_ready");
  entry.id = first.reference.slice(4); await save(state);
  const repeated = await body(await request(context, `${root}/prepare`, customerAuth.token, "POST", input, customer.userId), 200, "replay");
  assert.deepEqual(repeated, first);
  assert.deepEqual(await body(await request(context, `${root}/recover`, customerAuth.token, "POST", { requestKey: input.idempotencyKey }, customer.userId), 200, "recover"), first);
  const attemptQuery = () => table(context.admin, "razorpay_checkout_test_attempts").select("order_id,provider_order_id,checkout_key,state").eq("subject", customer.userId).eq("request_key", input.idempotencyKey);
  const owned = await attemptQuery();
  check(!owned.error && owned.data.length === 1 && owned.data[0].provider_order_id === first.providerOrderId && owned.data[0].checkout_key === publicKey, "multiple_or_mismatched_attempts");
  const wrongBind = await rpc(customerAuth.database, "razorpay_test_bind", { p_request_key: input.idempotencyKey, p_provider_order_id: first.providerOrderId, p_key: wrongKey });
  check(wrongBind.error?.code === "P0001" && wrongBind.error?.details === "connection_changed", "wrong_key_bind_allowed");
  const afterWrongBind = await attemptQuery();
  check(!afterWrongBind.error, "wrong_key_bind_read_failed");
  assert.deepEqual(afterWrongBind.data, owned.data);
  const cross = await rpc(otherAuth.database, "razorpay_test_resolve", { p_provider_order_id: first.providerOrderId });
  check(!!cross.error, "cross_owner_resolve_allowed");
  const foreignVerify = await request(context, `${root}/verify`, otherAuth.token, "POST", { requestKey: input.idempotencyKey, orderId: first.providerOrderId, paymentId: "pay_fixture", signature: "a".repeat(64) }, other.userId);
  assert.equal(foreignVerify.status, 404);
  const cancelled = await body(await request(context, `${root}/cancel`, customerAuth.token, "POST", { requestKey: input.idempotencyKey }, customer.userId), 200, "cancel");
  assert.equal(cancelled.state, "cancelled");
  assert.equal((await body(await request(context, `${root}/cancel`, customerAuth.token, "POST", { requestKey: input.idempotencyKey }, customer.userId), 200, "cancel_repeat")).state, "cancelled");
  const retryKey = randomUUID(); state.requests.push({ subject: customer.userId, email: customer.email, key: retryKey }); await save(state);
  const retry = await body(await request(context, `${root}/prepare`, customerAuth.token, "POST", { ...input, idempotencyKey: retryKey }, customer.userId), 409, "cancel_retry");
  assert.equal(retry.error.code, "attempt_pending");
  const stock = await table(context.admin, "razorpay_checkout_test_stock").select("quantity").eq("subject", customer.userId).eq("variant_id", state.variants[0].id).single();
  check(!stock.error && stock.data.quantity === 5, "fixture_stock_not_released_once");
  const absent = randomUUID(); state.requests.push({ subject: customer.userId, email: customer.email, key: absent }); await save(state);
  assert.deepEqual(await body(await request(context, `${root}/recover`, customerAuth.token, "POST", { requestKey: absent }, customer.userId), 200, "absent"), { state: "not_created" });
  const closed = await body(await request(context, `${root}/prepare`, customerAuth.token, "POST", { ...input, idempotencyKey: absent }, customer.userId), 409, "closed");
  assert.equal(closed.error.code, "attempt_closed");
  console.log("Razorpay test integration passed; fixture journal retained.");
}
async function journalBrowser(context, state) {
  check(state.users.length === 2 && new Set(state.users.map(user => user.userId)).size === 2, "two_verified_fixtures_required");
  const subjects = state.users.map(user => user.userId);
  const attempts = await table(context.admin, "razorpay_checkout_test_attempts").select("subject,request_key,order_id").in("subject", subjects);
  const closed = await table(context.admin, "razorpay_checkout_test_closed_requests").select("subject,request_key").in("subject", subjects);
  check(!attempts.error && !closed.error, "browser_journal_read_failed");
  for (const attempt of attempts.data) {
    const user = state.users.find(item => item.userId === attempt.subject);
    check(user && validUuid(attempt.request_key) && validUuid(attempt.order_id), "browser_attempt_mismatch");
    const order = await table(context.admin, "admin_order_records").select("id,reference,customer_subject,environment,request_key,snapshot").eq("id", attempt.order_id).single();
    check(!order.error && order.data.reference === `TST-${attempt.order_id}` && order.data.customer_subject === user.userId && order.data.environment === "razorpay_test" && order.data.request_key === attempt.request_key && order.data.snapshot?.contact?.email === user.email, "browser_order_mismatch");
    const existing = state.requests.find(entry => entry.subject === user.userId && entry.key === attempt.request_key);
    if (existing) { check(existing.email === user.email && (!existing.id || existing.id === attempt.order_id), "browser_journal_conflict"); existing.id = attempt.order_id; }
    else state.requests.push({ subject: user.userId, email: user.email, key: attempt.request_key, id: attempt.order_id });
  }
  for (const row of closed.data) {
    const user = state.users.find(item => item.userId === row.subject);
    check(user && validUuid(row.request_key), "browser_closed_mismatch");
    if (!state.requests.some(entry => entry.subject === user.userId && entry.key === row.request_key)) state.requests.push({ subject: user.userId, email: user.email, key: row.request_key });
  }
  await save(state);
  console.log("Browser fixture attempts and closed keys journaled.");
}
async function cleanup(context, state) {
  const subjects = state.users.map(user => user.userId);
  if (subjects.length) {
    const attempts = await table(context.admin, "razorpay_checkout_test_attempts").select("subject,request_key,order_id,state,provider_order_id,provider_payment_id").in("subject", subjects);
    check(!attempts.error, "attempt_cleanup_read_failed");
    const closedRows = await table(context.admin, "razorpay_checkout_test_closed_requests").select("subject,request_key").in("subject", subjects);
    check(!closedRows.error && closedRows.data.every(row => state.requests.some(entry => entry.subject === row.subject && entry.key === row.request_key)), "cleanup_requires_journaled_closed_requests");
    for (const attempt of attempts.data) {
      const entry = state.requests.find(item => item.subject === attempt.subject && item.key === attempt.request_key);
      check(entry && entry.id === attempt.order_id && ["cancelled", "failed", "paid"].includes(attempt.state), "cleanup_requires_journaled_final_attempts");
      // An unlinked provider order can also appear after an uncertain creation outcome.
      check(attempt.state === "paid", "unreconciled_nonpaid_attempt_must_be_preserved");
      const order = await table(context.admin, "admin_order_records").select("id,reference,customer_subject,environment,request_key,snapshot").eq("id", attempt.order_id).single();
      check(!order.error && order.data.reference === `TST-${attempt.order_id}` && order.data.customer_subject === entry.subject && order.data.environment === "razorpay_test" && order.data.request_key === entry.key && order.data.snapshot?.contact?.email === entry.email, "order_cleanup_mismatch");
      const settlement = await table(context.admin, "razorpay_checkout_test_settlements").select("order_id,provider_payment_id,event_id").eq("order_id", attempt.order_id);
      check(!settlement.error && (attempt.state === "paid" ? settlement.data.length === 1 && settlement.data[0].provider_payment_id === attempt.provider_payment_id && /^pay_[A-Za-z0-9]+$/.test(attempt.provider_payment_id ?? "") && validUuid(settlement.data[0].event_id) : settlement.data.length === 0), "settlement_mismatch");
      const events = await table(context.admin, "cms_audit_events").select("id,actor,action").eq("entity_type", "order").eq("entity_id", attempt.order_id);
      check(!events.error && events.data.every(event => (event.actor === attempt.subject && ["order.razorpay_test_prepare", "order.razorpay_test_capture"].includes(event.action)) || (subjects.includes(event.actor) && event.action === "order.update")), "unexpected_order_audit");
    }
    for (const attempt of attempts.data) {
      let result = await table(context.admin, "cms_audit_events").delete().eq("entity_type", "order").eq("entity_id", attempt.order_id).in("actor", subjects).in("action", ["order.razorpay_test_prepare", "order.razorpay_test_capture", "order.update"]);
      check(!result.error, "audit_cleanup_failed");
      if (attempt.state === "paid") {
        result = await table(context.admin, "razorpay_checkout_test_settlements").delete().eq("order_id", attempt.order_id).eq("provider_payment_id", attempt.provider_payment_id).select("order_id");
        check(!result.error && result.data.length === 1, "settlement_cleanup_failed");
      }
      result = await table(context.admin, "razorpay_checkout_test_attempts").delete().eq("subject", attempt.subject).eq("request_key", attempt.request_key).eq("state", attempt.state).select("order_id");
      check(!result.error && result.data.length === 1 && result.data[0].order_id === attempt.order_id, "attempt_cleanup_failed");
      result = await table(context.admin, "admin_order_records").delete().eq("id", attempt.order_id).eq("customer_subject", attempt.subject).eq("environment", "razorpay_test").eq("request_key", attempt.request_key).select("id");
      check(!result.error && result.data.length === 1, "order_cleanup_failed");
    }
    for (const user of state.users) {
      const entries = state.requests.filter(entry => entry.subject === user.userId);
      if (entries.length) {
        const closed = await table(context.admin, "razorpay_checkout_test_closed_requests").delete().eq("subject", user.userId).in("request_key", entries.map(entry => entry.key));
        check(!closed.error, "closed_cleanup_failed");
      }
      const actor = await table(context.admin, "razorpay_checkout_test_actors").delete().eq("subject", user.userId);
      check(!actor.error, "actor_cleanup_failed");
      for (const name of ["customer_carts", "customer_favorites"]) {
        const result = await table(context.admin, name).delete().eq("user_id", user.userId);
        check(!result.error, "customer_fixture_cleanup_failed");
      }
    }
    await cleanFixtures(context, state.users, state.runId);
  }
  await unlink(journal);
  console.log("Fixture cleanup complete; managed provider history retained.");
}
async function main() {
  check(process.argv.length === 3 && ["--seed", "--test", "--journal-browser", "--cleanup"].includes(process.argv[2]), "use_one_explicit_command");
  const context = await preflight();
  check(["http://localhost:3040", "http://127.0.0.1:3040"].includes(context.appOrigin), "port_3040_required");
  if (process.argv[2] === "--seed") return seed(context);
  const state = await load(context);
  if (process.argv[2] === "--test") return test(context, state);
  if (process.argv[2] === "--journal-browser") return journalBrowser(context, state);
  return cleanup(context, state);
}
main().catch(error => { console.error(`Razorpay fixture harness stopped: ${error.message}`); process.exitCode = 1; });
