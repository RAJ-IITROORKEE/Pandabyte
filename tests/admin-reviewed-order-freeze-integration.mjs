// Disposable application-only fixtures; never invokes a provider or enrolls payment/stock actors.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { appRequest, cleanFixtures, createFixtures, preflight, safeJson, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const journal = new URL("../.bootstrap/admin-reviewed-order-freeze.json", import.meta.url);
const purpose = "admin-reviewed-order-freeze";
const table = (context, name) => context.admin.database.schema("public").from(name);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const check = (value, label) => assert.ok(value, label);
const shipping = { carrier: "Disposable fixture carrier", trackingNumber: "fixture-only", trackingUrl: "https://example.invalid/fixture" };

async function save(state, create = false) {
  await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
  await writeFile(journal, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600, ...(create ? { flag: "wx" } : {}) });
}
function validate(state) {
  check(state?.purpose === purpose && uuid(state.runId) && Array.isArray(state.users) && state.users.length <= 2 && Array.isArray(state.orders) && state.orders.length === 6, "invalid_fixture_journal");
  check(state.users.every(user => user.runId === state.runId), "fixture_run_mismatch");
  check(state.orders.every(order => uuid(order.id) && uuid(order.requestKey) && order.reference === `${order.scenario === "simulation" ? "SIM" : "TST"}-${order.id}`), "invalid_fixture_orders");
}
async function rows(context, name, column, values) {
  const result = await table(context, name).select("*").in(column, values);
  check(!result.error, `fixture_read_${name}`);
  return result.data;
}
async function cleanup(context, state) {
  validate(state);
  for (const user of state.users) await verifyFixtureOwnership(context.clerk, user);
  const ids = state.orders.map(order => order.id), subjects = state.users.map(user => user.userId);
  const orders = await rows(context, "admin_order_records", "id", ids);
  check(orders.every(order => state.orders.some(fixture => fixture.id === order.id && fixture.reference === order.reference && fixture.requestKey === order.request_key) && subjects.includes(order.customer_subject) && order.snapshot?.fixturePurpose === purpose && order.snapshot?.fixtureRun === state.runId), "cleanup_order_ownership_mismatch");
  const attempts = await rows(context, "razorpay_checkout_test_attempts", "order_id", ids);
  check(attempts.every(attempt => subjects.includes(attempt.subject) && attempt.provider_order_id === null && attempt.provider_payment_id === null && attempt.receipt === `PBRZ${attempt.order_id.replaceAll("-", "")}`), "cleanup_provider_history_must_be_preserved");
  check((await rows(context, "razorpay_checkout_test_settlements", "order_id", ids)).length === 0, "cleanup_settlement_must_be_preserved");
  const events = await rows(context, "cms_audit_events", "entity_id", ids);
  check(events.every(event => event.entity_type === "order" && subjects.includes(event.actor) && event.action === "order.update"), "cleanup_audit_ownership_mismatch");
  for (const [name, column] of [["cms_audit_events", "entity_id"], ["razorpay_checkout_test_attempts", "order_id"], ["admin_order_records", "id"]]) {
    const result = await table(context, name).delete().in(column, ids);
    check(!result.error, `cleanup_${name}_failed`);
    check((await rows(context, name, column, ids)).length === 0, `cleanup_${name}_remaining`);
  }
  if (subjects.length) {
    for (const name of ["staff_role_memberships", "staff_role_events"]) {
      const result = await table(context, name).delete().in("user_id", subjects);
      check(!result.error, `cleanup_${name}_failed`);
    }
    await cleanFixtures(context, state.users, state.runId);
  }
  await unlink(journal);
  console.log("Disposable freeze-test orders, attempts, audits and users removed; provider history untouched.");
}
async function mutation(context, token, fixture, version, status, expected) {
  const response = await appRequest(context.appOrigin, `/api/admin/orders/${fixture.reference}`, token, {
    method: "PATCH", headers: { origin: context.appOrigin, "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: version, status, shipping }),
  });
  assert.equal(response.status, expected, `mutation_${fixture.scenario}_${status}_status`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return safeJson(response, "mutation_json");
}
async function snapshot(context, id) {
  return JSON.stringify(await Promise.all([
    rows(context, "admin_order_records", "id", [id]), rows(context, "razorpay_checkout_test_attempts", "order_id", [id]), rows(context, "cms_audit_events", "entity_id", [id]),
  ]));
}
async function verify(context, state, auth) {
  for (const fixture of state.orders.filter(order => order.scenario.includes("review") || order.scenario === "connection_history")) {
    const before = await snapshot(context, fixture.id);
    for (const status of ["pending", "processing", "fulfilled", "cancelled"]) {
      const result = await mutation(context, auth.staff.appToken, fixture, 1, status, 409);
      assert.equal(result.error.code, "invalid_transition");
      assert.equal(await snapshot(context, fixture.id), before, "review_mutation_changed_order_attempt_or_audit");
    }
  }
  const paid = state.orders.find(order => order.scenario === "paid");
  for (const [version, status] of [[1, "processing"], [2, "processing"], [3, "fulfilled"]]) {
    const result = await mutation(context, auth.staff.appToken, paid, version, status, 200);
    assert.equal(result.status, status); assert.equal(result.version, version + 1); assert.equal(result.paymentState, "paid");
  }
  await mutation(context, auth.staff.appToken, paid, 1, "fulfilled", 409);
  await mutation(context, auth.staff.appToken, paid, 4, "processing", 409);
  const simulation = state.orders.find(order => order.scenario === "simulation");
  const processed = await mutation(context, auth.staff.appToken, simulation, 1, "processing", 200);
  assert.equal(processed.paymentState, "simulated");
  const cancelled = await mutation(context, auth.staff.appToken, simulation, 2, "cancelled", 200);
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.paymentState, "simulated");
  await mutation(context, auth.customer.appToken, paid, 4, "fulfilled", 403);
  await mutation(context, null, paid, 4, "fulfilled", 401);
  console.log("Freeze regression passed: reviewed same-status and transition edits denied without mutation; paid/simulation transitions, stale/terminal and access checks passed.");
}
async function main() {
  check(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === "--cleanup"), "invalid_arguments");
  const context = await preflight();
  if (process.argv[2] === "--cleanup") return cleanup(context, JSON.parse(await readFile(journal, "utf8")));
  const state = { purpose, runId: randomUUID(), users: [], orders: ["both_review", "payment_review", "attempt_review", "connection_history", "paid", "simulation"].map(scenario => {
    const id = randomUUID(); return { id, requestKey: randomUUID(), scenario, reference: `${scenario === "simulation" ? "SIM" : "TST"}-${id}` };
  }) };
  await save(state, true);
  try {
    const created = await createFixtures(context.clerk, state.runId, user => state.users.push(user));
    state.users = created.users; await save(state);
    const staff = state.users.find(user => user.role === "staff"), customer = state.users.find(user => user.role === "customer");
    const granted = await context.admin.database.schema("public").rpc("project_admin_set_staff_role", { p_user_id: staff.userId, p_role: "ADMIN", p_protected: false, p_reason: `Disposable freeze test ${state.runId}` });
    check(!granted.error, "fixture_role_failed");
    const orders = state.orders.map(order => ({ id: order.id, reference: order.reference, request_key: order.requestKey, request_hash: "a".repeat(64), status: "pending", total_paise: 100, customer_subject: customer.userId,
      environment: order.scenario === "simulation" ? "simulation" : "razorpay_test", payment_state: ["both_review", "payment_review"].includes(order.scenario) ? "review" : order.scenario === "simulation" ? "simulated" : "paid",
      snapshot: { fixturePurpose: purpose, fixtureRun: state.runId, ...(order.scenario === "connection_history" ? { paymentReview: { reason: "test_connection_changed" } } : {}) },
    }));
    const inserted = await table(context, "admin_order_records").insert(orders);
    check(!inserted.error, "fixture_orders_failed");
    const attempts = await table(context, "razorpay_checkout_test_attempts").insert(state.orders.filter(order => order.scenario !== "simulation").map(order => ({ subject: customer.userId, request_key: order.requestKey, order_id: order.id, receipt: `PBRZ${order.id.replaceAll("-", "")}`, nonce: randomUUID(), reservation: "consumed", state: ["both_review", "attempt_review"].includes(order.scenario) ? "review" : "paid" })));
    check(!attempts.error, "fixture_attempts_failed");
    await verify(context, state, created.auth);
  } finally {
    await save(state);
    await cleanup(context, state);
  }
}
main().catch(error => { console.error(`Freeze integration failed safely: ${/^[a-z0-9_]+$/i.test(error.message) ? error.message : "assertion_failed"}. Recover owned fixtures with --cleanup if the journal remains.`); process.exitCode = 1; });
