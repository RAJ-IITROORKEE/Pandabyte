// Re-signs stored genuine payloads locally; this is not Razorpay-origin redelivery or original wire bytes.
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { preflight, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const fixtureFile = new URL("../.bootstrap/razorpay-checkout-fixtures.json", import.meta.url);
const eventsFile = new URL("../.bootstrap/razorpay-test/failures-webhook-events.json", import.meta.url);
const setupFile = new URL("../.bootstrap/razorpay-test/corrected-webhook-setup.json", import.meta.url);
const table = (client, name) => client.database.schema("public").from(name);
const requireCheck = (condition, label) => { if (!condition) throw new Error(label); };
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
async function rows(query, label) {
  const result = await query;
  requireCheck(!result.error && Array.isArray(result.data), label);
  return result.data.sort((a, b) => stable(a).localeCompare(stable(b)));
}
async function main() {
  requireCheck(process.argv.length === 3 && process.argv[2] === "--replay", "explicit_replay_required");
  const context = await preflight();
  requireCheck(["http://localhost:3040", "http://127.0.0.1:3040"].includes(context.appOrigin), "port_3040_required");
  const state = JSON.parse(await readFile(fixtureFile, "utf8"));
  requireCheck(state.purpose === "razorpay-checkout-test" && uuid(state.runId) && Array.isArray(state.users) && state.users.length === 2 && Array.isArray(state.requests), "invalid_journal");
  for (const user of state.users) { requireCheck(user.runId === state.runId, "wrong_fixture_run"); await verifyFixtureOwnership(context.clerk, user); }
  requireCheck(state.users[0].userId !== state.users[1].userId, "distinct_fixtures_required");
  const user = state.users[1];
  const latest = [...state.requests].reverse().find(entry => entry.subject === user.userId && entry.email === user.email && uuid(entry.id));
  requireCheck(latest && uuid(latest.key), "journaled_created_attempt_required");
  const attempts = await rows(table(context.admin, "razorpay_checkout_test_attempts").select("*").eq("subject", user.userId).eq("request_key", latest.key).eq("order_id", latest.id).eq("state", "paid"), "attempt_read_failed");
  requireCheck(attempts.length === 1, "one_paid_attempt_required");
  const attempt = attempts[0];
  requireCheck(uuid(attempt.order_id) && uuid(attempt.request_key) && /^order_[A-Za-z0-9]+$/.test(attempt.provider_order_id ?? "") && /^pay_[A-Za-z0-9]+$/.test(attempt.provider_payment_id ?? "") && state.requests.some(entry => entry.subject === user.userId && entry.email === user.email && entry.key === attempt.request_key && entry.id === attempt.order_id), "attempt_not_journaled");
  const orders = await rows(table(context.admin, "admin_order_records").select("*").eq("id", attempt.order_id), "order_read_failed");
  const order = orders[0];
  requireCheck(orders.length === 1 && order.reference === `TST-${attempt.order_id}` && order.customer_subject === user.userId && order.environment === "razorpay_test" && order.request_key === attempt.request_key && order.payment_state === "paid" && order.snapshot?.contact?.email === user.email && Number.isSafeInteger(order.total_paise) && order.total_paise > 0, "order_mismatch");
  const input = JSON.parse(await readFile(eventsFile, "utf8"));
  requireCheck(Array.isArray(input.rows) && [2, 3].includes(input.rows.length), "captured_events_required");
  const picked = {};
  for (const event of input.rows) {
    const payment = event.payload?.payload?.payment?.entity;
    requireCheck(["payment.failed", "payment.captured", "order.paid"].includes(event.event_type) && !picked[event.event_type] && event.provider === "razorpay" && event.environment === "test" && event.processing_status === "processed" && event.livemode === false && typeof event.provider_event_id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(event.provider_event_id) && event.payload?.event === event.event_type && payment?.order_id === attempt.provider_order_id, "event_mismatch");
    if (event.event_type !== "payment.failed") requireCheck(payment.id === attempt.provider_payment_id && payment.amount === order.total_paise && typeof payment.currency === "string" && payment.currency.toUpperCase() === "INR" && payment.status === "captured" && payment.captured === true, "captured_payment_mismatch");
    if (event.event_type === "order.paid") {
      const providerOrder = event.payload?.payload?.order?.entity;
      requireCheck(providerOrder?.id === attempt.provider_order_id && providerOrder.status === "paid" && providerOrder.amount === order.total_paise && typeof providerOrder.currency === "string" && providerOrder.currency.toUpperCase() === "INR", "paid_order_mismatch");
    }
    picked[event.event_type] = event;
  }
  requireCheck(picked["payment.captured"] && picked["order.paid"] && new Set(input.rows.map(event => event.provider_event_id)).size === input.rows.length, "event_ids_not_distinct");
  const setup = JSON.parse(await readFile(setupFile, "utf8"));
  requireCheck(setup.webhookUrl === `${context.baseUrl}/api/webhooks/razorpay/test` && typeof setup.webhookSecret === "string" && setup.webhookSecret.length > 0, "test_webhook_setup_mismatch");
  const fixtureAttempts = await rows(table(context.admin, "razorpay_checkout_test_attempts").select("order_id,request_key").eq("subject", user.userId), "fixture_attempts_read_failed");
  requireCheck(fixtureAttempts.length > 0 && fixtureAttempts.every(item => uuid(item.order_id) && state.requests.some(entry => entry.subject === user.userId && entry.email === user.email && entry.key === item.request_key && entry.id === item.order_id)), "fixture_attempt_not_journaled");
  const fixtureOrderIds = fixtureAttempts.map(item => item.order_id);
  const snapshot = async () => ({
    attempts: await rows(table(context.admin, "razorpay_checkout_test_attempts").select("*").eq("subject", user.userId).eq("request_key", attempt.request_key), "attempt_snapshot_failed"),
    orders: await rows(table(context.admin, "admin_order_records").select("*").eq("id", attempt.order_id), "order_snapshot_failed"),
    stock: await rows(table(context.admin, "razorpay_checkout_test_stock").select("*").eq("subject", user.userId), "stock_snapshot_failed"),
    cart: await rows(table(context.admin, "customer_carts").select("*").eq("user_id", user.userId), "cart_snapshot_failed"),
    cartItems: await rows(table(context.admin, "customer_cart_items").select("*").eq("user_id", user.userId), "cart_items_snapshot_failed"),
    settlements: await rows(table(context.admin, "razorpay_checkout_test_settlements").select("*").eq("order_id", attempt.order_id), "settlement_snapshot_failed"),
    audit: await rows(table(context.admin, "cms_audit_events").select("*").eq("entity_type", "order").eq("entity_id", attempt.order_id), "audit_snapshot_failed"),
    allAttempts: await rows(table(context.admin, "razorpay_checkout_test_attempts").select("*").eq("subject", user.userId), "all_attempts_snapshot_failed"),
    allOrders: await rows(table(context.admin, "admin_order_records").select("*").in("id", fixtureOrderIds), "all_orders_snapshot_failed"),
    allSettlements: await rows(table(context.admin, "razorpay_checkout_test_settlements").select("*").in("order_id", fixtureOrderIds), "all_settlements_snapshot_failed"),
    allAudit: await rows(table(context.admin, "cms_audit_events").select("*").eq("entity_type", "order").in("entity_id", fixtureOrderIds), "all_audit_snapshot_failed"),
  });
  const before = await snapshot();
  requireCheck(before.settlements.length === 1 && before.settlements[0].provider_payment_id === attempt.provider_payment_id && before.attempts.length === 1 && before.orders.length === 1, "paid_fixture_not_settled");
  async function send(event, valid = true) {
    const bytes = Buffer.from(JSON.stringify(event.payload));
    const signature = valid ? createHmac("sha256", setup.webhookSecret).update(bytes).digest("hex") : "0".repeat(64);
    const response = await fetch(setup.webhookUrl, { method: "POST", redirect: "error", headers: { "content-type": "application/json", "x-razorpay-event-id": event.provider_event_id, "x-razorpay-signature": signature }, body: bytes });
    requireCheck(response.status === (valid ? 200 : 400), "webhook_response_status");
    if (valid) { const result = await response.json(); requireCheck(result.received === true && result.handled === false, "replay_not_deduplicated"); }
  }
  await Promise.all([send(picked["payment.captured"]), send(picked["payment.captured"])]);
  await send(picked["order.paid"]);
  if (picked["payment.failed"]) await send(picked["payment.failed"]);
  await send(picked["payment.captured"], false);
  requireCheck(stable(await snapshot()) === stable(before), "application_state_changed_after_replay");
  console.log(`Re-signed stored test events: ${picked["payment.failed"] ? 4 : 3} duplicate replays and one invalid signature checked; fixture state unchanged.${picked["payment.failed"] ? "" : " Failed-event replay skipped; no genuine event was available."}`);
}
main().catch(error => { const label = /^[a-z_]{1,80}$/.test(error.message) ? error.message : "inspect_local_evidence"; console.error(`Razorpay fixture webhook replay stopped: ${label}`); process.exitCode = 1; });
