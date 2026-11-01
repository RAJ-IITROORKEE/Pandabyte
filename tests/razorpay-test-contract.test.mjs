import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Static guardrails supplement the real Clerk/InsForge integration tests; they do not execute SQL.
const sql = readFileSync(new URL("../migrations/20261028133002_razorpay-checkout-test.sql", import.meta.url), "utf8");
const keyedSql = readFileSync(new URL("../migrations/20261028140002_razorpay-test-key-scope.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../lib/checkout/razorpay-test.ts", import.meta.url), "utf8");
const deploymentGuards = readFileSync(new URL("../lib/checkout/test-deployment.ts", import.meta.url), "utf8");
const fixtureHarness = readFileSync(new URL("./razorpay-test-integration.mjs", import.meta.url), "utf8");
test("fixture cleanup retains nonpaid attempts that could still settle", () => {
  const validation = fixtureHarness.indexOf('check(attempt.state === "paid", "unreconciled_nonpaid_attempt_must_be_preserved")');
  const deletion = fixtureHarness.indexOf('table(context.admin, "razorpay_checkout_test_attempts").delete()');
  assert(validation > 0 && deletion > validation);
  assert.match(fixtureHarness, /select\("subject,request_key,order_id,state,provider_order_id,provider_payment_id"\)/);
});
function body(name, source = sql) {
  const start = source.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`));
  assert(start >= 0, `Missing function ${name}`);
  const open = source.indexOf("$fn$", start), close = source.indexOf("$fn$;", open + 4);
  assert(open > start && close > open, `Missing function body ${name}`);
  return source.slice(open + 4, close);
}

test("retired connection attempts cannot settle from later trusted events", () => {
  const settle = body("razorpay_test_settle", keyedSql);
  const reviewStop = settle.indexOf("IF t.state='review' THEN RETURN; END IF;");
  assert(reviewStop > 0 && reviewStop < settle.indexOf("INSERT INTO public.razorpay_checkout_test_settlements"));
  assert.match(settle, /allowed_key_id=t\.checkout_key/);
  assert.match(settle, /pandabyte_key_id'=t\.checkout_key/);
});

test("test checkout remains private, opt-in and separate from operational inventory", () => {
  assert.match(route, /^import "server-only";/);
  assert.match(route, /localRazorpayTestEnabled\(request, process\.env\)/);
  assert.match(deploymentGuards, /NODE_ENV === "development"/);
  assert.match(deploymentGuards, /PANDABYTE_RAZORPAY_TEST_ENABLED === "true"/);
  assert.match(deploymentGuards, /\["localhost", "127\.0\.0\.1", "\[::1\]"\]\.includes/);
  assert.match(route, /checkoutOwnerError\(request\)/);
  assert.match(route, /readCheckoutBody\(request\)/);
  for (const table of ["actors", "stock", "attempts", "closed_requests", "settlements"]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.razorpay_checkout_test_${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM) public\.inventory_balances/i);
  assert.doesNotMatch(sql, /INSERT INTO public\.razorpay_checkout_test_(?:actors|stock)\b/);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|UPDATE|DELETE|ALL)\b/);
});

test("existing attempts replay before the owner guard and only one new attempt can prepare", () => {
  const prepare = body("razorpay_test_prepare");
  const ownerLock = prepare.indexOf("'razorpay_test_owner:'||a");
  const keyLock = prepare.indexOf("'razorpay_test_order:'||a");
  const replay = prepare.indexOf("jsonb_build_object('createProvider',false)");
  const guard = prepare.indexOf("public.phase3_fail('attempt_pending')");
  const insert = prepare.indexOf("INSERT INTO public.admin_order_records");
  assert(ownerLock >= 0 && ownerLock < keyLock && keyLock < replay && replay < guard && guard < insert);
  assert.match(prepare, /x\.state IN \('creating','unknown','ready','verified','review'\)/);
  assert.match(prepare, /x\.state IN \('cancelled','failed'\)/);
  assert.match(prepare, /m\.environment='test' AND m\.receipt=x\.receipt/);
  assert.doesNotMatch(prepare, /DELETE FROM public\.customer_cart_items/);
  assert.doesNotMatch(body("razorpay_test_recover"), /SET state=|createProvider',true/);
});

test("managed insertion requires the owner, exact fixture amount and an unused creation slot", () => {
  const policy = body("razorpay_test_allow_insert");
  for (const gate of ["p_subject_id IS DISTINCT FROM a", "p_environment IS DISTINCT FROM 'test'", "p_currency IS DISTINCT FROM 'inr'", "p_status IS DISTINCT FROM 'initialized'", "p_order_id IS NOT NULL", "p_verified_payment_id IS NOT NULL", "p_raw IS DISTINCT FROM '{}'::jsonb", "total_paise=p_amount"]) assert(policy.includes(gate), gate);
  assert.match(policy, /WHERE subject=a AND receipt=p_receipt FOR UPDATE/);
  assert.match(policy, /t\.state<>'creating' OR t\.reservation<>'held'/);
  assert.match(policy, /pandabyte_attempt' IS DISTINCT FROM t\.order_id::text/);
  assert.match(policy, /pandabyte_nonce' IS DISTINCT FROM t\.nonce::text/);
  assert.match(policy, /RETURN NOT EXISTS\(SELECT 1 FROM payments\.razorpay_orders WHERE environment='test' AND receipt=t\.receipt\)/);
  assert.match(sql, /DROP POLICY IF EXISTS pandabyte_razorpay_test_probe_insert/);
});

test("only trusted captured events settle and consume the unchanged cart once", () => {
  const settle = body("razorpay_test_settle");
  for (const gate of ["e.provider<>'razorpay'", "e.environment<>'test'", "e.livemode", "e.processing_status<>'processed'", "pay->>'currency' IS DISTINCT FROM 'INR'", "o.total_paise<>(pay->>'amount')::numeric", "pay->>'status' IS DISTINCT FROM 'captured'", "pay->'captured' IS DISTINCT FROM 'true'::jsonb"]) assert(settle.includes(gate), gate);
  assert.match(settle, /m\.notes->>'pandabyte_attempt'=a\.order_id::text/);
  assert.match(settle, /m\.notes->>'pandabyte_nonce'=a\.nonce::text AND m\.order_id=pay->>'order_id'/);
  assert.match(settle, /provider_payment_id=pay->>'id' OR order_id=o\.id/);
  assert.match(settle, /IF cv=t\.expected_cart_version THEN/);
  assert.match(settle, /IF reacquire AND o\.snapshot->>'mode'='cart' THEN/);
  assert.match(sql, /provider_payment_id text PRIMARY KEY/);
  assert.match(sql, /order_id uuid NOT NULL UNIQUE REFERENCES public\.admin_order_records/);
  assert.doesNotMatch(body("razorpay_test_mark_verified"), /payment_state='paid'|state='paid'/);
  for (const name of ["razorpay_test_validate_request", "razorpay_test_attempt_json", "razorpay_test_release", "razorpay_test_settle", "razorpay_test_webhook_transition"]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(`));
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`));
  }
});
