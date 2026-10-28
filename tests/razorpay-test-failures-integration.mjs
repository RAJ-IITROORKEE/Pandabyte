// Checks existing disposable attempts only; this script never calls a provider API.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { appRequest, createRuntimeClient, preflight, safeJson, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const journal = new URL("../.bootstrap/razorpay-checkout-fixtures.json", import.meta.url);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args) => client.database.schema("public").rpc(name, args);
const check = (value, label) => assert.ok(value, label);

async function load(context) {
  const state = JSON.parse(await readFile(journal, "utf8"));
  check(state.purpose === "razorpay-checkout-test" && uuid(state.runId) && typeof state.proof === "string" && Array.isArray(state.users) && state.users.length === 2 && Array.isArray(state.requests), "invalid_journal");
  for (const user of state.users) { check(user.runId === state.runId, "wrong_fixture_run"); await verifyFixtureOwnership(context.clerk, user); }
  check(new Set(state.users.map(user => user.userId)).size === 2, "distinct_fixture_users_required");
  check(state.requests.every(entry => state.users.some(user => user.userId === entry.subject && user.email === entry.email) && uuid(entry.key) && (!entry.id || uuid(entry.id))), "invalid_journal_requests");
  return state;
}
async function request(context, fixture, route, value) {
  const token = async () => (await context.clerk.sessions.getToken(fixture.sessionId)).jwt;
  const response = await appRequest(context.appOrigin, route, token, { method: "POST", headers: { "x-account-owner": fixture.userId, origin: context.appOrigin, "content-type": "application/json" }, body: JSON.stringify(value) });
  assert.equal(response.status, 200, `${route}_status`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  return safeJson(response, "response_json");
}
async function main() {
  const command = process.argv[2];
  check(process.argv.length === 3 && ["--check-cancelled", "--check-failed", "--check-paid"].includes(command), "explicit_check_required");
  const context = await preflight();
  check(["http://localhost:3040", "http://127.0.0.1:3040"].includes(context.appOrigin), "port_3040_required");
  const state = await load(context);
  const expected = command.slice("--check-".length);
  const user = state.users[expected === "cancelled" ? 0 : 1];
  const publicKey = process.env.RAZORPAY_TEST_KEY_ID;
  check(typeof publicKey === "string" && /^rzp_test_[A-Za-z0-9]+$/.test(publicKey), "test_key_required");
  const latest = [...state.requests].reverse().find(entry => entry.subject === user.userId && entry.email === user.email && entry.id);
  check(latest, "journaled_created_attempt_required");
  const found = await table(context.admin, "razorpay_checkout_test_attempts").select("subject,request_key,order_id,state,reservation,provider_order_id,provider_payment_id,expected_cart_version,checkout_key,created_at").eq("subject", user.userId).eq("request_key", latest.key).eq("order_id", latest.id).eq("state", expected);
  check(!found.error && found.data.length === 1, "one_matching_fixture_attempt_required");
  const attempt = found.data[0];
  check(state.requests.some(entry => entry.subject === user.userId && entry.key === attempt.request_key && entry.id === attempt.order_id) && attempt.checkout_key === publicKey && /^order_[A-Za-z0-9]+$/.test(attempt.provider_order_id ?? ""), "journaled_owned_attempt_required");
  const order = await table(context.admin, "admin_order_records").select("id,reference,customer_subject,environment,request_key,payment_state,snapshot").eq("id", attempt.order_id).single();
  check(!order.error && order.data.reference === `TST-${attempt.order_id}` && order.data.customer_subject === user.userId && order.data.environment === "razorpay_test" && order.data.request_key === attempt.request_key && order.data.payment_state === expected && order.data.snapshot?.contact?.email === user.email, "fixture_order_mismatch");
  const snapshot = order.data.snapshot;
  check(Array.isArray(snapshot.requestItems) && snapshot.requestItems.length === 1 && snapshot.requestItems[0].quantity === 1 && uuid(snapshot.requestItems[0].variantId) && Number.isSafeInteger(snapshot.quote?.subtotalPaise), "single_fixture_item_required");
  const stock = async () => {
    const result = await table(context.admin, "razorpay_checkout_test_stock").select("quantity").eq("subject", user.userId).eq("variant_id", snapshot.requestItems[0].variantId).single();
    check(!result.error, "fixture_stock_read_failed");
    return result.data.quantity;
  };
  const settlements = async () => {
    const result = await table(context.admin, "razorpay_checkout_test_settlements").select("order_id,provider_payment_id,event_id").eq("order_id", attempt.order_id);
    check(!result.error, "settlement_read_failed");
    return result.data;
  };
  const paid = await table(context.admin, "razorpay_checkout_test_attempts").select("*").eq("subject", user.userId).eq("state", "paid");
  check(!paid.error, "paid_attempts_read_failed");
  let consumed = 0;
  const earlierPaid = [];
  for (const item of paid.data) {
    check(item.reservation === "consumed" && state.requests.some(entry => entry.subject === user.userId && entry.key === item.request_key && entry.id === item.order_id), "paid_attempt_not_journaled");
    const record = await table(context.admin, "admin_order_records").select("*").eq("id", item.order_id).single();
    check(!record.error && record.data.reference === `TST-${item.order_id}` && record.data.customer_subject === user.userId && record.data.environment === "razorpay_test" && record.data.request_key === item.request_key && record.data.snapshot?.contact?.email === user.email && Array.isArray(record.data.snapshot.requestItems), "paid_order_mismatch");
    for (const line of record.data.snapshot.requestItems) {
      check(uuid(line.variantId) && Number.isSafeInteger(line.quantity) && line.quantity > 0, "paid_item_mismatch");
      if (line.variantId === snapshot.requestItems[0].variantId) consumed += line.quantity;
    }
    const priorSettlement = await table(context.admin, "razorpay_checkout_test_settlements").select("*").eq("order_id", item.order_id);
    check(!priorSettlement.error && priorSettlement.data.length === 1, "prior_paid_settlement_mismatch");
    earlierPaid.push({ attempt: item, order: record.data, settlement: priorSettlement.data });
  }
  if (expected === "paid") {
    const rows = await settlements();
    check(attempt.reservation === "consumed" && await stock() === 5 - consumed && rows.length === 1 && rows[0].provider_payment_id === attempt.provider_payment_id && /^pay_[A-Za-z0-9]+$/.test(attempt.provider_payment_id ?? "") && uuid(rows[0].event_id), "paid_settlement_or_stock_mismatch");
    console.log("Paid fixture settlement and stock check passed.");
    return;
  }
  check(attempt.reservation === "released" && await stock() === 5 - consumed && (await settlements()).length === 0, "nonpaid_stock_or_settlement_mismatch");
  const root = "/api/checkout/razorpay-test";
  if (expected === "cancelled") {
    const cancellationSnapshot = async () => {
      const result = await Promise.all([
        table(context.admin, "razorpay_checkout_test_attempts").select("*").eq("subject", user.userId).eq("request_key", attempt.request_key),
        table(context.admin, "admin_order_records").select("*").eq("id", attempt.order_id),
        table(context.admin, "customer_carts").select("*").eq("user_id", user.userId),
        table(context.admin, "customer_cart_items").select("*").eq("user_id", user.userId).order("variant_id"),
      ]);
      check(result.every(row => !row.error), "cancel_snapshot_read_failed");
      return result.map(row => row.data);
    };
    const beforeCancel = await cancellationSnapshot();
    check(beforeCancel[0].length === 1 && beforeCancel[1].length === 1, "cancel_snapshot_mismatch");
    for (let i = 0; i < 2; i++) assert.equal((await request(context, user, `${root}/cancel`, { requestKey: attempt.request_key })).state, "cancelled");
    check(JSON.stringify(await cancellationSnapshot()) === JSON.stringify(beforeCancel), "repeat_cancel_changed_state");
  }
  for (let i = 0; i < 2; i++) {
    const recovered = await request(context, user, `${root}/recover`, { requestKey: attempt.request_key });
    check(recovered.state === expected && recovered.reference === order.data.reference && recovered.providerOrderId === attempt.provider_order_id, "unstable_recovery");
  }
  const mint = async () => (await context.clerk.sessions.getToken(user.sessionId, "insforge")).jwt;
  const database = createRuntimeClient(context.baseUrl, await mint(), mint);
  const input = { idempotencyKey: attempt.request_key, mode: snapshot.mode, expectedCartVersion: attempt.expected_cart_version, expectedSubtotalPaise: snapshot.quote.subtotalPaise, items: snapshot.requestItems, contact: snapshot.contact, shipping: snapshot.shipping, billing: snapshot.billing, business: snapshot.business, gstin: snapshot.gstin };
  const replay = await rpc(database, "razorpay_test_prepare", { p_request: input, p_proof: state.proof, p_key: publicKey });
  check(!replay.error && replay.data?.state === expected && replay.data?.createProvider === false && replay.data.reference === order.data.reference, "same_key_replay_failed");
  const newKey = randomUUID();
  state.requests.push({ subject: user.userId, email: user.email, key: newKey });
  await writeFile(journal, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const retry = await rpc(database, "razorpay_test_prepare", { p_request: { ...input, idempotencyKey: newKey }, p_proof: state.proof, p_key: publicKey });
  check(retry.error?.code === "P0001" && retry.error?.details === "attempt_pending", "new_key_retry_not_blocked");
  check(await stock() === 5 - consumed && (await settlements()).length === 0, "nonpaid_replay_mutated_stock_or_settlement");
  for (const prior of earlierPaid) {
    const currentAttempt = await table(context.admin, "razorpay_checkout_test_attempts").select("*").eq("subject", user.userId).eq("request_key", prior.attempt.request_key).single();
    const currentOrder = await table(context.admin, "admin_order_records").select("*").eq("id", prior.attempt.order_id).single();
    const currentSettlement = await table(context.admin, "razorpay_checkout_test_settlements").select("*").eq("order_id", prior.attempt.order_id);
    check(!currentAttempt.error && !currentOrder.error && !currentSettlement.error && JSON.stringify(currentAttempt.data) === JSON.stringify(prior.attempt) && JSON.stringify(currentOrder.data) === JSON.stringify(prior.order) && JSON.stringify(currentSettlement.data) === JSON.stringify(prior.settlement), "earlier_paid_order_changed");
  }
  console.log(`${expected} fixture replay, retry guard, stock and settlement checks passed.`);
}
main().catch(error => { console.error(`Razorpay fixture check stopped: ${error.message}`); process.exitCode = 1; });
