import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createClient } from "@insforge/sdk";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { preflight, createFixtures, cleanFixtures, appRequest } from "./phase2-isolation.mjs";

const statePath = ".bootstrap/account-test-fixtures.json";
const flags = new Set(process.argv.slice(2));
assert([...flags].every((flag) => ["--keep-fixtures", "--cleanup"].includes(flag)));
assert(!(flags.has("--cleanup") && flags.has("--keep-fixtures")));
const context = await preflight();
let state = { runId: randomUUID(), users: [] };
const table = (client) => client.database.schema("public").from("customer_addresses");
const rpc = (client, name, args = {}) => client.database.schema("public").rpc(name, args);

function checkpoint() {
  mkdirSync(".bootstrap", { recursive: true });
  writeFileSync(statePath, JSON.stringify(state));
}

function isNotFound(error) {
  return isClerkAPIResponseError(error) && error.status === 404;
}

function assertFixtureRecord(fixture) {
  assert(
    fixture &&
      typeof fixture.userId === "string" && /^user_[A-Za-z0-9]+$/.test(fixture.userId) &&
      typeof fixture.sessionId === "string" && (fixture.sessionId === "" || /^sess_[A-Za-z0-9]+$/.test(fixture.sessionId)) &&
      typeof fixture.runId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fixture.runId) &&
      fixture.runId === state.runId &&
      ["customer", "staff"].includes(fixture.role) &&
      fixture.email === `${fixture.runId}.${fixture.role}+clerk_test@example.com`,
    "invalid_fixture_record",
  );
}

async function verifyCleanupOwnership(fixture) {
  assertFixtureRecord(fixture);
  let user;
  try {
    user = await context.clerk.users.getUser(fixture.userId);
  } catch (error) {
    if (fixture.cleanupVerified === true && isNotFound(error)) return false;
    if (isNotFound(error)) assert.fail("fixture_ownership_check_failed");
    throw error;
  }

  assert(
    user.privateMetadata?.purpose === "phase2-isolation" &&
      user.privateMetadata?.runId === fixture.runId &&
      user.emailAddresses.some((address) => address.emailAddress === fixture.email),
    "fixture_ownership_check_failed",
  );
  return true;
}

function contextWithIdempotentVerifiedUserDeletes() {
  const verifiedIds = new Set(state.users
    .filter((fixture) => fixture.cleanupVerified === true)
    .map((fixture) => fixture.userId));
  const clerk = {
    sessions: context.clerk.sessions,
    users: {
      async deleteUser(userId) {
        try {
          return await context.clerk.users.deleteUser(userId);
        } catch (error) {
          if (verifiedIds.has(userId) && isNotFound(error)) return null;
          throw error;
        }
      },
    },
  };
  return { ...context, clerk };
}

async function cleanup() {
  for (const fixture of state.users) {
    const exists = await verifyCleanupOwnership(fixture);
    if (exists && fixture.cleanupVerified !== true) {
      fixture.cleanupVerified = true;
      checkpoint();
    }
    const removed = await table(context.admin).delete().eq("user_id", fixture.userId);
    assert(!removed.error, "synthetic_address_cleanup");
    const remaining = await table(context.admin).select("id").eq("user_id", fixture.userId);
    assert(!remaining.error && remaining.data.length === 0, "address_cleanup_verified");
  }
  await cleanFixtures(contextWithIdempotentVerifiedUserDeletes(), state.users, state.runId);
  if (existsSync(statePath)) unlinkSync(statePath);
  console.log("Disposable account fixtures removed; owner account unchanged.");
}

const example = {
  label: "Test home", recipientName: "Test Customer", phone: "+919999999999",
  line1: "123 Synthetic Street", line2: "Test apartment", city: "Test City",
  state: "Test State", postalCode: "001234", country: "IN",
  isDefaultShipping: true, isDefaultBilling: true,
};
function sqlFields(value) {
  return {
    p_label: value.label, p_recipient_name: value.recipientName, p_phone: value.phone,
    p_line1: value.line1, p_line2: value.line2, p_city: value.city, p_state: value.state,
    p_postal_code: value.postalCode, p_country: value.country,
    p_is_default_shipping: value.isDefaultShipping, p_is_default_billing: value.isDefaultBilling,
  };
}
async function request(auth, method, suffix = "", json, headers = {}) {
  return appRequest(context.appOrigin, `/api/account/addresses${suffix}`, auth?.appToken, {
    method,
    headers: { origin: context.appOrigin, "content-type": "application/json", "x-account-owner": state.users.find(user => user.role === (auth === requestCustomer ? "customer" : "staff"))?.userId ?? "", ...headers },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
}
let requestCustomer;
async function result(response, status) {
  assert.equal(response.status, status, `HTTP ${status} expected, got ${response.status}`);
  assert.match(response.headers.get("cache-control"), /no-store/);
  return response.json();
}

async function verifyContactProfile(customer, other) {
  const profile = (auth, method, body, headers = {}) => appRequest(context.appOrigin, "/api/account/profile", auth.appToken, {
    method, headers: { origin: context.appOrigin, "content-type": "application/json", "x-account-owner": state.users.find(fixture => fixture.role === (auth === customer ? "customer" : "staff")).userId, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await result(await profile(customer, "PATCH", { phone: "rejected" }, { "x-account-owner": "" }), 409);
  await result(await profile(other, "PATCH", { phone: "rejected" }, { "x-account-owner": state.users[0].userId }), 409);
  await result(await profile(customer, "PATCH", { phone: "+12015550100" }), 200);
  const own = (await result(await profile(customer, "GET"), 200)).profile;
  assert.equal(own.phone, "+12015550100");
  assert.equal((await result(await profile(other, "GET"), 200)).profile, null);
  await result(await profile(customer, "PATCH", { phone: "+12015550100", phoneVerified: true }), 400);
  await result(await profile(customer, "PATCH", { phone: "x".repeat(49) }), 400);
  const cross = await other.database.database.schema("public").from("customer_profiles").update({ phone: "spoofed" }).eq("user_id", state.users[0].userId).select("phone");
  assert(!cross.error && cross.data.length === 0, "profile_phone_cross_update_denied");
  const changed = (await result(await profile(customer, "PATCH", { displayName: "Test store preference" }), 200)).profile;
  assert.equal(changed.phone, own.phone, "name_patch_preserves_phone");
  const cleared = (await result(await profile(customer, "PATCH", { phone: "" }), 200)).profile;
  assert.equal(cleared.phone, "");
  assert.equal(cleared.display_name, "Test store preference", "phone_patch_preserves_name");
  console.log("Private customer contact phone supports save/clear and owner isolation; verification fields rejected.");
}

try {
  if (flags.has("--cleanup")) {
    assert(existsSync(statePath), "fixture_file_required");
    state = JSON.parse(readFileSync(statePath, "utf8"));
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.runId) &&
        Array.isArray(state.users) && state.users.length > 0 && state.users.length <= 2 &&
        state.users.every((user) => user.runId === state.runId) &&
        new Set(state.users.map((user) => user.userId)).size === state.users.length,
      "invalid_fixture_file",
    );
    await cleanup();
  } else {
    assert(!existsSync(statePath), "clean_existing_account_fixtures_first");
    const fixtures = await createFixtures(context.clerk, state.runId, (user) => {
      state.users.push(user);
      checkpoint();
    });
    state.users = fixtures.users;
    checkpoint();
    const { customer, staff: other } = fixtures.auth;
    requestCustomer = customer;
    await verifyContactProfile(customer, other);
    await result(await request(null, "GET"), 401);
    await result(await request(null, "POST", "", example), 401);
    await result(await request(customer, "POST", "", example, { "x-account-owner": "" }), 409);
    await result(await request(customer, "POST", "", example, { "x-account-owner": state.users[1].userId }), 409);
    assert.deepEqual((await result(await request(customer, "GET"), 200)).addresses, []);
    await result(await request(customer, "POST", "", { ...example, userId: state.users[1].userId }), 400);
    await result(await request(customer, "POST", "", { ...example, phoneVerified: true }), 400);
    await result(await request(customer, "POST", "", example, { origin: "https://example.invalid" }), 403);
    await result(await request(customer, "POST", "", example, { "content-type": "text/plain" }), 415);
    const oversized = await request(customer, "POST", "", { ...example, line1: "x".repeat(20000) });
    assert.equal(oversized.status, 413);
    const first = (await result(await request(customer, "POST", "", example), 201)).address;
    assert.equal(first.version, 1);
    assert.equal(first.postalCode, "001234");
    assert.equal(first.isDefaultShipping, true);
    assert.equal(first.isDefaultBilling, true);
    assert(!("userId" in first) && !("user_id" in first));
    const cross = await result(await request(other, "GET"), 200);
    assert.equal(cross.addresses.length, 0);
    await result(await request(other, "PATCH", `/${first.id}`, { ...example, expectedVersion: 1 }), 404);
    await result(await request(other, "DELETE", `/${first.id}`, { expectedVersion: 1 }), 404);
    const second = (await result(await request(customer, "POST", "", {
      ...example, label: "Test billing", isDefaultShipping: false,
    }), 201)).address;
    let saved = (await result(await request(customer, "GET"), 200)).addresses;
    let currentFirst = saved.find((a) => a.id === first.id);
    assert.equal(currentFirst.isDefaultShipping, true);
    assert.equal(currentFirst.isDefaultBilling, false);
    assert(currentFirst.version > first.version, "default_switch_invalidates_stale_editor");
    assert.equal(second.isDefaultBilling, true);
    await result(await request(customer, "PATCH", `/${first.id}`, { ...example, expectedVersion: 1 }), 409);
    const simultaneous = await Promise.all([
      request(customer, "PATCH", `/${first.id}`, { ...example, label: "A", expectedVersion: currentFirst.version }),
      request(customer, "PATCH", `/${first.id}`, { ...example, label: "B", expectedVersion: currentFirst.version }),
    ]);
    assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 409]);
    saved = (await result(await request(customer, "GET"), 200)).addresses;
    assert.equal(saved.filter((a) => a.isDefaultShipping).length, 1);
    assert.equal(saved.filter((a) => a.isDefaultBilling).length, 1);
    assert.equal(saved.find((a) => a.isDefaultBilling).id, first.id);
    assert((await table(customer.database).insert([{ user_id: state.users[1].userId }])).error, "direct_insert_denied");
    assert((await table(customer.database).update({ user_id: state.users[1].userId }).eq("id", first.id)).error, "direct_owner_update_denied");
    assert((await table(customer.database).delete().eq("id", first.id)).error, "direct_delete_denied");
    const crossRows = await table(other.database).select("id").eq("id", first.id);
    assert(!crossRows.error && crossRows.data.length === 0, "rls_cross_read_denied");
    const anon = createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY });
    assert((await rpc(anon, "customer_list_addresses")).error, "anonymous_rpc_denied");
    assert((await table(anon).select("id")).error, "anonymous_table_denied");
    const invalidRpc = await rpc(customer.database, "customer_create_address", { ...sqlFields(example), p_country: "invalid" });
    assert(invalidRpc.error, "direct_rpc_validates_country");
    const crossRpc = await rpc(other.database, "customer_update_address", {
      ...sqlFields(example), p_id: first.id, p_expected_version: saved.find((a) => a.id === first.id).version,
    });
    assert(crossRpc.error, "direct_rpc_derives_owner");
    const fill = { ...example, isDefaultShipping: false, isDefaultBilling: false };
    for (let i = saved.length; i < 19; i++) {
      const created = await rpc(customer.database, "customer_create_address", sqlFields({ ...fill, label: `Limit ${i}` }));
      assert(!created.error, "within_address_limit");
    }
    const capRace = await Promise.all([0, 1].map(() => rpc(customer.database, "customer_create_address", sqlFields(fill))));
    assert.equal(capRace.filter((r) => !r.error).length, 1, "concurrent_cap_enforced");
    saved = (await result(await request(customer, "GET"), 200)).addresses;
    assert.equal(saved.length, 20);
    await result(await request(customer, "POST", "", fill), 409);
    const removable = saved.find((a) => a.id === second.id);
    await result(await request(customer, "DELETE", `/${second.id}`, { expectedVersion: removable.version - 1 }), 409);
    await result(await request(customer, "DELETE", `/${second.id}`, { expectedVersion: removable.version }), 200);
    assert.equal((await result(await request(customer, "GET"), 200)).addresses.length, 19);
    console.log("Account address API, ownership/RLS, defaults, stale edits, concurrent cap and validation passed.");
    if (!flags.has("--keep-fixtures")) await cleanup();
    else console.log("Disposable account fixtures retained for built-in browser checks.");
  }
} catch (error) {
  console.error("Account integration check failed:", error instanceof assert.AssertionError ? error.message : error.name);
  if (!flags.has("--cleanup") && !flags.has("--keep-fixtures") && state.users.length) {
    await cleanup().catch(() => console.error("Cleanup needs retry using --cleanup."));
  }
  process.exitCode = 1;
}
