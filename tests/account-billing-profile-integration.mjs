// Disposable development identities only; never creates orders or contacts a payment/email provider.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { createClient } from "@insforge/sdk";
import { appRequest, cleanFixtures, createFixtures, preflight, safeJson } from "./phase2-isolation.mjs";

const purpose = "account-billing-profile-integration";
const journal = new URL("../.bootstrap/account-billing-profile-integration.json", import.meta.url);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args = {}) => client.database.schema("public").rpc(name, args);
const check = (condition, label) => assert.ok(condition, label);
const empty = { version: 0, businessName: "", contactEmail: "", gstin: "" };
const input = { expectedVersion: 0, businessName: " Example Workshop ", contactEmail: " billing@example.com ", gstin: "27abcde1234f1z5" };
const saved = { version: 1, businessName: "Example Workshop", contactEmail: "billing@example.com", gstin: "27ABCDE1234F1Z5" };

async function saveState(state, create = false) {
  await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
  await writeFile(journal, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600, ...(create ? { flag: "wx" } : {}) });
}

function validateState(state) {
  check(state?.purpose === purpose && uuid(state.runId) && Array.isArray(state.users) && state.users.length <= 2, "invalid_billing_fixture_journal");
  check(new Set(state.users.map(user => user.userId)).size === state.users.length, "duplicate_fixture_identity");
  for (const user of state.users) {
    check(user.runId === state.runId && ["customer", "staff"].includes(user.role)
      && /^user_[A-Za-z0-9]+$/.test(user.userId) && (user.sessionId === "" || /^sess_[A-Za-z0-9]+$/.test(user.sessionId))
      && user.email === `${state.runId}.${user.role}+clerk_test@example.com`, "invalid_billing_fixture_identity");
  }
}

function notFound(error) { return isClerkAPIResponseError(error) && error.status === 404; }

async function verifyCleanupOwner(context, fixture) {
  let user;
  try { user = await context.clerk.users.getUser(fixture.userId); }
  catch (error) {
    if (fixture.cleanupVerified === true && notFound(error)) return;
    throw new Error("billing_fixture_ownership_unverified");
  }
  check(user.privateMetadata?.purpose === "phase2-isolation" && user.privateMetadata?.runId === fixture.runId
    && user.emailAddresses.some(email => email.emailAddress === fixture.email), "billing_fixture_ownership_mismatch");
}

async function cleanup(context, state) {
  validateState(state);
  // Verify every identity before any privileged deletion, including retry after partial cleanup.
  for (const fixture of state.users) await verifyCleanupOwner(context, fixture);
  for (const fixture of state.users) fixture.cleanupVerified = true;
  await saveState(state);
  for (const fixture of state.users) {
    for (const name of ["customer_billing_profiles", "customer_addresses"]) {
      const removed = await table(context.admin, name).delete().eq("user_id", fixture.userId);
      check(!removed.error, `cleanup_${name}_failed`);
      const remaining = await table(context.admin, name).select("user_id").eq("user_id", fixture.userId).limit(1);
      check(!remaining.error && Array.isArray(remaining.data) && remaining.data.length === 0, `cleanup_${name}_remaining`);
    }
  }
  const retryClerk = {
    sessions: context.clerk.sessions,
    users: { async deleteUser(id) {
      check(state.users.some(fixture => fixture.userId === id && fixture.cleanupVerified === true), "cleanup_identity_not_verified");
      try { return await context.clerk.users.deleteUser(id); }
      catch (error) { if (!notFound(error)) throw error; }
    } },
  };
  await cleanFixtures({ ...context, clerk: retryClerk }, state.users, state.runId);
  await unlink(journal);
  console.log("Disposable billing, address, profile and identity fixtures cleaned; owner data untouched.");
}

async function responseBody(response, status, label) {
  assert.equal(response.status, status, `${label}_status`);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/, `${label}_cache`);
  return safeJson(response, `${label}_json`);
}

async function request(context, auth, userId, method = "GET", body, headers = {}) {
  return appRequest(context.appOrigin, "/api/account/billing-profile", auth?.appToken, {
    method, headers: { origin: context.appOrigin, "content-type": "application/json", "x-account-owner": userId ?? "", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function unrelatedSnapshot(context, subject) {
  const output = {};
  for (const [name, column, fields, order] of [
    ["customer_profiles", "user_id", "user_id,display_name,phone,created_at", "user_id"],
    ["customer_addresses", "user_id", "*", "id"],
    ["admin_order_records", "customer_subject", "id,reference,status,total_paise,snapshot,version", "id"],
  ]) {
    const result = await table(context.admin, name).select(fields).eq(column, subject).order(order).limit(50);
    check(!result.error && Array.isArray(result.data) && result.data.length < 50, `snapshot_${name}_failed`);
    output[name] = result.data;
  }
  return output;
}

async function verify(context, state, auth) {
  const ownerId = state.users.find(user => user.role === "customer").userId;
  const otherId = state.users.find(user => user.role === "staff").userId;
  const owner = auth.customer, other = auth.staff;
  // Seed unrelated records belonging solely to this disposable customer.
  const profile = await appRequest(context.appOrigin, "/api/account/profile", owner.appToken, {
    method: "PATCH", headers: { origin: context.appOrigin, "content-type": "application/json", "x-account-owner": ownerId },
    body: JSON.stringify({ displayName: "Disposable billing test", phone: "+12015550100" }),
  });
  await responseBody(profile, 200, "fixture_profile");
  const address = await rpc(owner.database, "customer_create_address", {
    p_label: "Disposable billing", p_recipient_name: "Example Customer", p_phone: "+12015550100",
    p_line1: "Example Street", p_line2: "", p_city: "Example City", p_state: "Example State", p_postal_code: "001234", p_country: "IN",
    p_is_default_shipping: true, p_is_default_billing: true,
  });
  check(!address.error, "fixture_address_failed");
  const before = await unrelatedSnapshot(context, ownerId);
  assert.equal(before.customer_addresses.length, 1, "fixture_address_required");
  assert.equal(before.admin_order_records.length, 0, "fixture_must_have_no_orders");

  await responseBody(await request(context, null, ownerId), 401, "signed_out_read");
  await responseBody(await request(context, null, ownerId, "PUT", input), 401, "signed_out_write");
  const fresh = await responseBody(await request(context, owner, ownerId), 200, "initial_read");
  assert.deepEqual(fresh, { billingProfile: empty });
  await responseBody(await request(context, owner, otherId, "PUT", input), 409, "account_switch_guard");
  await responseBody(await request(context, owner, ownerId, "PUT", input, { origin: "https://example.invalid" }), 403, "origin_guard");
  await responseBody(await request(context, owner, ownerId, "PUT", input, { "content-type": "text/plain" }), 415, "content_type_guard");
  await responseBody(await request(context, owner, ownerId, "PUT", { ...input, userId: otherId }), 400, "identity_field_guard");
  await responseBody(await request(context, owner, ownerId, "PUT", { ...input, verified: true }), 400, "verification_field_guard");
  await responseBody(await request(context, owner, ownerId, "PUT", { ...input, role: "ADMIN" }), 400, "role_field_guard");
  await responseBody(await request(context, owner, ownerId, "PUT", { ...input, businessName: "x".repeat(5000) }), 413, "body_bound");

  assert.deepEqual(await responseBody(await request(context, owner, ownerId, "PUT", input), 200, "create_profile"), { billingProfile: saved });
  assert.deepEqual(await responseBody(await request(context, owner, ownerId), 200, "read_saved"), { billingProfile: saved });
  assert.deepEqual(await responseBody(await request(context, other, otherId), 200, "other_empty"), { billingProfile: empty });
  await responseBody(await request(context, other, ownerId), 409, "cross_api_read_guard");
  await responseBody(await request(context, other, ownerId, "PUT", { ...input, expectedVersion: 1 }), 409, "cross_api_write_guard");

  const crossRead = await table(other.database, "customer_billing_profiles").select("user_id,business_name").eq("user_id", ownerId);
  check(!crossRead.error && crossRead.data.length === 0, "rls_cross_read_denied");
  const ownRead = await table(owner.database, "customer_billing_profiles").select("user_id,business_name").eq("user_id", ownerId);
  check(!ownRead.error && ownRead.data.length === 1 && ownRead.data[0].business_name === saved.businessName, "rls_own_read");
  for (const mutation of [
    () => table(owner.database, "customer_billing_profiles").insert([{ user_id: otherId }]),
    () => table(owner.database, "customer_billing_profiles").update({ business_name: "Direct write" }).eq("user_id", ownerId),
    () => table(other.database, "customer_billing_profiles").update({ business_name: "Cross write" }).eq("user_id", ownerId),
    () => table(owner.database, "customer_billing_profiles").delete().eq("user_id", ownerId),
  ]) check((await mutation()).error, "direct_table_mutation_denied");

  const anon = createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY });
  check((await table(anon, "customer_billing_profiles").select("user_id").eq("user_id", ownerId)).error, "anonymous_table_denied");
  check((await rpc(anon, "customer_get_billing_profile")).error, "anonymous_read_rpc_denied");
  const args = { p_expected_version: 0, p_business_name: "Other Workshop", p_contact_email: "", p_gstin: "" };
  check((await rpc(anon, "customer_save_billing_profile", args)).error, "anonymous_write_rpc_denied");
  const ownOther = await rpc(other.database, "customer_save_billing_profile", args);
  check(!ownOther.error && ownOther.data.businessName === "Other Workshop", "rpc_derived_owner_write");
  assert.deepEqual((await responseBody(await request(context, owner, ownerId), 200, "owner_unchanged")).billingProfile, saved);
  check((await rpc(owner.database, "customer_save_billing_profile", { ...args, p_expected_version: 1, p_contact_email: "invalid" })).error, "rpc_email_validation");
  check((await rpc(owner.database, "customer_save_billing_profile", { ...args, p_expected_version: 1, p_gstin: "invalid" })).error, "rpc_gstin_validation");
  const stale = await responseBody(await request(context, owner, ownerId, "PUT", input), 409, "stale_version");
  assert.equal(stale.error.code, "conflict");
  const simultaneous = await Promise.all(["First edit", "Second edit"].map(businessName => request(context, owner, ownerId, "PUT", { ...input, expectedVersion: 1, businessName })));
  assert.deepEqual(simultaneous.map(response => response.status).sort(), [200, 409], "one_concurrent_writer");
  for (const response of simultaneous) await responseBody(response, response.status, "concurrent_write");
  const latest = (await responseBody(await request(context, owner, ownerId), 200, "concurrent_read")).billingProfile;
  assert.equal(latest.version, 2);
  check(["First edit", "Second edit"].includes(latest.businessName), "concurrent_value_confirmed");
  const cleared = await responseBody(await request(context, owner, ownerId, "PUT", { expectedVersion: latest.version, businessName: "", contactEmail: "", gstin: "" }), 200, "clear_profile");
  assert.deepEqual(cleared.billingProfile, { ...empty, version: 3 });
  assert.deepEqual(await unrelatedSnapshot(context, ownerId), before, "billing_changed_unrelated_profile_address_or_order");
  console.log("Billing API/SDK ownership, permissions, validation, concurrency, save/clear and unrelated-record preservation passed.");
}

const flags = new Set(process.argv.slice(2));
check([...flags].every(flag => flag === "--cleanup"), "invalid_billing_integration_arguments");
let context, state;
try {
  context = await preflight();
  if (flags.has("--cleanup")) {
    state = JSON.parse(await readFile(journal, "utf8"));
    await cleanup(context, state);
  } else {
    const createdState = { purpose, runId: randomUUID(), users: [] };
    await saveState(createdState, true);
    state = createdState;
    const fixtures = await createFixtures(context.clerk, state.runId, fixture => {
      state.users.push(fixture);
      writeFileSync(journal, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    });
    state.users = fixtures.users;
    await saveState(state);
    await verify(context, state, fixtures.auth);
    await cleanup(context, state);
  }
} catch (error) {
  console.error("Billing integration failed:", error instanceof assert.AssertionError ? error.message : error?.label ?? error?.name ?? "Error");
  if (context && state && !flags.has("--cleanup")) {
    try { await cleanup(context, state); }
    catch { console.error("Disposable billing fixture cleanup needs retry with --cleanup."); }
  }
  process.exitCode = 1;
}
