import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createClient } from "@insforge/sdk";
import {
  appRequest,
  cleanFixtures,
  createFixtures,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";

const fixturePath = new URL("../.bootstrap/admin-orders-integration.json", import.meta.url);
const statuses = ["pending", "processing", "fulfilled", "cancelled"];
const orderCount = 12;
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args) => client.database.schema("public").rpc(name, args);
const requireOk = (condition, label) => assert.ok(condition, label);

function referencesFor(runId) {
  return Array.from({ length: orderCount }, (_, index) => `TEST-${runId}-${String(index + 1).padStart(2, "0")}`);
}

async function saveState(state, create = false) {
  await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    ...(create ? { flag: "wx" } : {}),
  });
}

async function readState() {
  const state = JSON.parse(await readFile(fixturePath, "utf8"));
  requireOk(state?.purpose === "admin-orders-integration", "fixture_purpose_invalid");
  requireOk(/^[0-9a-f-]{36}$/i.test(state.runId), "fixture_run_id_invalid");
  requireOk(Array.isArray(state.users) && state.users.length === 2, "fixture_users_invalid");
  requireOk(Array.isArray(state.orders) && state.orders.length === orderCount, "fixture_orders_invalid");
  assert.deepEqual(state.orders.map(({ reference }) => reference), referencesFor(state.runId));
  return state;
}

function orderRows(runId) {
  return referencesFor(runId).map((reference, index) => {
    const createdAt = new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString();
    return {
      id: randomUUID(),
      reference,
      status: statuses[index % statuses.length],
      total_paise: (index + 1) * 1_000,
      currency: "INR",
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
}

async function jsonResponse(response, expectedStatus, label) {
  assert.equal(response.status, expectedStatus, `${label}_http_${response.status}`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i, `${label}_cache`);
  return safeJson(response, `${label}_json`);
}

async function getOrders(context, token, query, expectedStatus = 200, label = "orders") {
  const response = await appRequest(context.appOrigin, `/api/admin/orders?${query}`, token);
  return jsonResponse(response, expectedStatus, label);
}

async function assignCatalogRole(context, auth, customer, runId) {
  const response = await appRequest(context.appOrigin, "/api/admin/roles", auth.staff.appToken, {
    method: "POST",
    headers: { origin: context.appOrigin, "content-type": "application/json" },
    body: JSON.stringify({
      email: customer.email,
      targetUserId: null,
      role: "CATALOG",
      expectedVersion: 0,
      reason: `Disposable Orders integration ${runId}`,
    }),
  });
  const body = await jsonResponse(response, 200, "catalog_role_assignment");
  assert.equal(body.membership?.userId, customer.userId, "catalog_role_target_mismatch");
  assert.equal(body.membership?.role, "CATALOG", "catalog_role_assignment_mismatch");
}

async function cleanup(context, state, removeJournal = false) {
  requireOk(state?.purpose === "admin-orders-integration", "cleanup_fixture_purpose_invalid");
  requireOk(/^[0-9a-f-]{36}$/i.test(state.runId), "cleanup_run_id_invalid");
  requireOk(Array.isArray(state.users) && state.users.length <= 2, "cleanup_users_invalid");
  requireOk(Array.isArray(state.orders) && state.orders.length === orderCount, "cleanup_orders_invalid");
  assert.deepEqual(state.orders.map(({ reference }) => reference), referencesFor(state.runId));

  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  const references = referencesFor(state.runId);
  const ids = state.orders.map(({ id }) => id);
  requireOk(ids.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)), "cleanup_order_ids_invalid");

  const current = await table(context.admin, "admin_order_records")
    .select("id,reference")
    .in("reference", references);
  requireOk(!current.error, "cleanup_order_read_failed");
  requireOk(current.data.every((row) => references.includes(row.reference)), "cleanup_order_reference_mismatch");
  for (const row of current.data) {
    const fixture = state.orders.find((order) => order.reference === row.reference);
    requireOk(fixture?.id === row.id, "cleanup_order_id_mismatch");
  }

  if (current.data.length) {
    const deleted = await table(context.admin, "admin_order_records")
      .delete()
      .in("id", current.data.map((row) => row.id))
      .in("reference", current.data.map((row) => row.reference))
      .select("id,reference");
    requireOk(!deleted.error && deleted.data.length === current.data.length, "cleanup_order_delete_failed");
  }
  const remainingOrders = await table(context.admin, "admin_order_records")
    .select("id,reference")
    .in("reference", references);
  requireOk(!remainingOrders.error && remainingOrders.data.length === 0, "cleanup_orders_remain");

  const userIds = state.users.map(({ userId }) => userId);
  if (userIds.length) {
    const memberships = await table(context.admin, "staff_role_memberships").delete().in("user_id", userIds);
    requireOk(!memberships.error, "cleanup_role_memberships_failed");
    for (const column of ["user_id", "actor"]) {
      const events = await table(context.admin, "staff_role_events").delete().in(column, userIds);
      requireOk(!events.error, "cleanup_role_events_failed");
    }
    await cleanFixtures(context, state.users, state.runId);
    const remainingMemberships = await table(context.admin, "staff_role_memberships").select("user_id").in("user_id", userIds);
    requireOk(!remainingMemberships.error && remainingMemberships.data.length === 0, "cleanup_role_memberships_remain");
    const remainingCapabilities = await table(context.admin, "staff_capabilities").select("user_id").in("user_id", userIds);
    requireOk(!remainingCapabilities.error && remainingCapabilities.data.length === 0, "cleanup_capabilities_remain");
    const deletedUsers = await context.clerk.users.getUserList({ userId: userIds, limit: 10 });
    requireOk(!deletedUsers.data.some(({ id }) => userIds.includes(id)), "cleanup_clerk_users_remain");
  }
  if (removeJournal) {
    const journal = JSON.parse(await readFile(fixturePath, "utf8"));
    requireOk(journal?.purpose === state.purpose && journal?.runId === state.runId, "cleanup_journal_owner_mismatch");
    await unlink(fixturePath);
  }
}

async function verify(context, state, auth) {
  const admin = state.users.find(({ role }) => role === "staff");
  const customer = state.users.find(({ role }) => role === "customer");
  requireOk(admin && customer, "fixture_roles_missing");
  const runTag = `TEST-${state.runId}`;
  const search = new URLSearchParams({ q: runTag, status: "all", sort: "created_desc", limit: "20", offset: "0" });

  const adminCapability = await rpc(auth.staff.database, "has_capability", { capability_name: "staff.manage" });
  assert.equal(adminCapability.error, null, "fixture_admin_capability_check_failed");
  assert.equal(adminCapability.data, true, "fixture_admin_role_missing");
  const customerBefore = await getOrders(context, auth.customer.appToken, "limit=10", 403, "customer_orders_denied");
  assert.equal(customerBefore.error.code, "forbidden");

  await assignCatalogRole(context, auth, customer, state.runId);
  for (const [capability, expected] of [["catalog.edit", true], ["orders.manage", true], ["staff.manage", false]]) {
    const result = await rpc(auth.customer.database, "has_capability", { capability_name: capability });
    assert.equal(result.error, null, `catalog_capability_check_failed_${capability}`);
    assert.equal(result.data, expected, `catalog_capability_wrong_${capability}`);
  }

  const pricing = await appRequest(context.appOrigin, "/api/admin/pricing?limit=1", auth.customer.appToken);
  assert.equal(pricing.status, 200, "catalog_role_lost_catalog_access");
  const catalogOrders = await getOrders(context, auth.customer.appToken, "limit=10", 403, "catalog_orders_denied");
  assert.equal(catalogOrders.error.code, "forbidden");
  const anonymousOrders = await getOrders(context, null, "limit=10", 401, "anonymous_orders_denied");
  assert.equal(anonymousOrders.error.code, "unauthorized");

  const list = await getOrders(context, auth.staff.appToken, search.toString(), 200, "admin_orders_list");
  assert.equal(list.total, orderCount, "search_total_mismatch");
  assert.deepEqual(list.items.map(({ reference }) => reference), [...state.orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ reference }) => reference));
  for (const item of list.items) {
    assert.deepEqual(Object.keys(item).sort(), ["createdAt", "currency", "reference", "status", "totalPaise", "updatedAt"]);
    assert.equal(item.currency, "INR");
  }

  for (const [name, invalidQuery] of [
    ["oversized_whitespace", new URLSearchParams({ q: " ".repeat(121) }).toString()],
    ["c1_control", new URLSearchParams({ q: "\u0085" }).toString()],
  ]) {
    const invalid = await getOrders(context, auth.staff.appToken, invalidQuery, 400, `invalid_search_${name}`);
    assert.equal(invalid.error.code, "validation_error", `invalid_search_${name}_error_code`);
  }

  const processing = new URLSearchParams({ q: runTag, status: "processing", limit: "20" });
  const filtered = await getOrders(context, auth.staff.appToken, processing.toString(), 200, "status_filter");
  assert.equal(filtered.total, 3, "status_filter_total_mismatch");
  assert.ok(filtered.items.every(({ status }) => status === "processing"), "status_filter_leaked_other_statuses");

  for (const [sort, compare] of [
    ["created_asc", (a, b) => a.created_at.localeCompare(b.created_at)],
    ["created_desc", (a, b) => b.created_at.localeCompare(a.created_at)],
    ["total_asc", (a, b) => a.total_paise - b.total_paise],
    ["total_desc", (a, b) => b.total_paise - a.total_paise],
  ]) {
    const result = await getOrders(context, auth.staff.appToken,
      new URLSearchParams({ q: runTag, sort, limit: "20" }).toString(), 200, `sort_${sort}`);
    assert.deepEqual(result.items.map(({ reference }) => reference), [...state.orders].sort(compare).map(({ reference }) => reference), `sort_${sort}_order_mismatch`);
  }

  const pageOne = await getOrders(context, auth.staff.appToken,
    new URLSearchParams({ q: runTag, sort: "created_asc", limit: "10", offset: "0" }).toString(), 200, "page_one");
  const pageTwo = await getOrders(context, auth.staff.appToken,
    new URLSearchParams({ q: runTag, sort: "created_asc", limit: "10", offset: "10" }).toString(), 200, "page_two");
  assert.equal(pageOne.total, orderCount);
  assert.equal(pageOne.items.length, 10);
  assert.equal(pageTwo.items.length, 2);
  assert.equal(pageTwo.offset, 10);
  assert.equal(new Set([...pageOne.items, ...pageTwo.items].map(({ reference }) => reference)).size, orderCount, "pagination_duplicates_or_missing_rows");

  const directRpc = await rpc(auth.staff.database, "admin_list_orders", {
    p_query: runTag, p_status: "all", p_sort: "created_desc", p_limit: 20, p_offset: 0,
  });
  assert.equal(directRpc.error, null, "admin_direct_order_rpc_failed");
  assert.equal(directRpc.data.total, orderCount, "admin_direct_order_rpc_total_mismatch");
  assert.deepEqual(directRpc.data.items.map(({ reference }) => reference), list.items.map(({ reference }) => reference));

  for (const [name, client] of [
    ["anonymous", createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY })],
    ["catalog", auth.customer.database],
  ]) {
    const denied = await rpc(client, "admin_list_orders", {
      p_query: runTag, p_status: "all", p_sort: "created_desc", p_limit: 20, p_offset: 0,
    });
    requireOk(Boolean(denied.error), `${name}_direct_order_rpc_allowed`);
  }

  for (const [name, client] of [
    ["anonymous", createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY })],
    ["catalog", auth.customer.database],
    ["admin", auth.staff.database],
  ]) {
    const denied = await table(client, "admin_order_records").select("id,reference").in("reference", referencesFor(state.runId));
    requireOk(Boolean(denied.error), `${name}_direct_order_table_read_allowed`);
  }
}

async function waitForBrowserReview(runTag) {
  console.log(`Browser review ready for ${runTag}: 12 disposable rows; search q=${runTag}. Press Enter to continue (10 minute timeout).`);
  process.stdin.resume();
  let timer;
  await Promise.race([
    new Promise((resolve) => process.stdin.once("data", resolve)),
    new Promise((resolve) => { timer = setTimeout(resolve, 10 * 60 * 1000); }),
  ]);
  clearTimeout(timer);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  assert.ok([...args].every((arg) => arg === "--cleanup" || arg === "--hold-for-browser"), "invalid_arguments");
  assert.ok(!(args.has("--cleanup") && args.has("--hold-for-browser")), "invalid_arguments");
  const context = await preflight();

  if (args.has("--cleanup")) {
    const state = await readState();
    await cleanup(context, state, true);
    console.log("Orders integration fixtures cleaned up.");
    return;
  }

  assert.ok(process.env.INSFORGE_ANON_KEY, "insforge_anon_key_required");
  try {
    await readFile(fixturePath);
    throw new Error("existing_orders_fixtures_use_cleanup");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const runId = randomUUID();
  const state = {
    purpose: "admin-orders-integration",
    runId,
    users: [],
    orders: orderRows(runId).map(({ id, reference, status, total_paise, created_at }) => ({
      id, reference, status, total_paise, created_at,
    })),
  };
  let success = false;
  let journalOwned = false;
  try {
    const readiness = await appRequest(context.appOrigin, "/api/admin/orders", null);
    await jsonResponse(readiness, 401, "local_orders_route_readiness");
    const schemaReadiness = await table(context.admin, "admin_order_records").select("id").limit(0);
    requireOk(!schemaReadiness.error, "orders_table_unavailable");

    const created = await createFixtures(context.clerk, runId, (fixture) => state.users.push(fixture));
    state.users = created.users;
    await saveState(state, true);
    journalOwned = true;

    const staff = state.users.find(({ role }) => role === "staff");
    const customer = state.users.find(({ role }) => role === "customer");
    const bootstrap = await rpc(context.admin, "project_admin_set_staff_role", {
      p_user_id: staff.userId,
      p_role: "ADMIN",
      p_protected: false,
      p_reason: `Disposable Orders integration ${runId}`,
    });
    requireOk(!bootstrap.error && bootstrap.data?.role === "ADMIN", "fixture_admin_bootstrap_failed");

    const records = table(context.admin, "admin_order_records");
    const alreadyPresent = await records.select("id,reference").in("reference", state.orders.map(({ reference }) => reference));
    requireOk(!alreadyPresent.error && alreadyPresent.data.length === 0, "fixture_order_reference_collision_or_schema_unavailable");
    await saveState(state);
    const inserted = await records.insert(orderRowsWithIds(state.orders)).select("id,reference");
    requireOk(!inserted.error && inserted.data.length === orderCount, "fixture_orders_insert_failed");
    assert.deepEqual(inserted.data.map(({ id, reference }) => ({ id, reference })).sort((a, b) => a.reference.localeCompare(b.reference)),
      state.orders.map(({ id, reference }) => ({ id, reference })).sort((a, b) => a.reference.localeCompare(b.reference)));
    await saveState(state);
    console.log(`Order rows inserted: 12; browser search q=TEST-${runId}.`);
    if (args.has("--hold-for-browser")) await waitForBrowserReview(`TEST-${runId}`);

    await verify(context, state, created.auth);
    success = true;
    console.log("Orders integration passed: ADMIN/CATALOG boundary, API search/status/sorts/pages, no-store, guarded RPC and table access.");
  } finally {
    if (state.users.length) {
      try {
        await cleanup(context, state, journalOwned);
        console.log("Disposable Orders users, roles, and rows cleaned up.");
      } catch (error) {
        console.error(`Fixture cleanup stopped safely: ${/^[A-Za-z0-9_]+$/.test(error.message) ? error.message : "cleanup_failed"}. State remains in .bootstrap for retry.`);
        if (success) process.exitCode = 1;
      }
    }
  }
}

function orderRowsWithIds(orders) {
  return orders.map(({ id, reference, status, total_paise, created_at }) => ({
    id, reference, status, total_paise, currency: "INR", created_at, updated_at: created_at,
  }));
}

main().catch((error) => {
  const label = typeof error?.message === "string" ? error.message.split(/\r?\n/u, 1)[0] : "assertion_failed";
  console.error(`Orders integration failed safely: ${/^[A-Za-z0-9_]+$/.test(label) ? label : "assertion_failed"}.`);
  process.exitCode = 1;
});
