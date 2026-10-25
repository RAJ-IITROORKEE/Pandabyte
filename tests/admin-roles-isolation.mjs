import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { createClient } from "@insforge/sdk";
import { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures, appRequest, safeJson } from "./phase2-isolation.mjs";

const fixturePath = new URL("../.bootstrap/admin-role-fixtures.json", import.meta.url);
const table = (c, n) => c.database.schema("public").from(n);
const rpc = (c, n, a = {}) => c.database.schema("public").rpc(n, a);
const ensure = (c, label) => { if (!c) throw new Error(label); };
const allCaps = ["catalog.edit", "content.edit", "content.publish", "orders.manage", "staff.manage", "media.manage", "inquiries.manage"].sort();
const expectedCaps = {
  ADMIN: allCaps, EDITOR: ["content.edit", "content.publish", "media.manage"].sort(),
  CATALOG: ["catalog.edit", "media.manage", "orders.manage"].sort(), SUPPORT: ["inquiries.manage"], CUSTOMER: [],
};
async function save(state) {
  await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(state, null, 2));
}
async function request(c, route, token, value) {
  return appRequest(c.appOrigin, route, token, value === undefined ? {} : {
    method: "POST", headers: { origin: c.appOrigin, "content-type": "application/json" }, body: JSON.stringify(value),
  });
}
async function json(r, status, label) {
  ensure(r.status === status, `${label}_http_${r.status}`);
  ensure(r.headers.get("cache-control")?.includes("no-store"), `${label}_cache`);
  return safeJson(r, `${label}_json`);
}
async function cleanup(c, state) {
  for (const u of state.users) await verifyFixtureOwnership(c.clerk, u);
  const ids = state.users.map((u) => u.userId);
  if (ids.length) {
    const members = await table(c.admin, "staff_role_memberships").delete().in("user_id", ids);
    ensure(!members.error, "cleanup_memberships_failed");
    for (const column of ["user_id", "actor"]) {
      const events = await table(c.admin, "staff_role_events").delete().in(column, ids);
      ensure(!events.error, "cleanup_role_events_failed");
    }
    await cleanFixtures(c, state.users, state.runId);
  }
  await unlink(fixturePath).catch((e) => { if (e.code !== "ENOENT") throw e; });
}
async function run(c, state, auth) {
  const actor = state.users.find((u) => u.role === "staff");
  const target = state.users.find((u) => u.role === "customer");
  const owner = JSON.parse(await readFile(new URL("../.bootstrap/owner-admin-subject.json", import.meta.url)));
  const ownerBefore = await table(c.admin, "staff_role_memberships").select("user_id,role,version,protected").eq("user_id", owner.userId);
  ensure(!ownerBefore.error && ownerBefore.data.length === 1 && ownerBefore.data[0].role === "ADMIN" && ownerBefore.data[0].protected, "owner_admin_missing");
  const anon = createClient({ baseUrl: c.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY });
  await json(await request(c, "/api/admin/roles", null), 401, "anon_list");
  await json(await request(c, "/api/admin/roles", auth.customer.appToken), 403, "customer_list");
  await c.clerk.users.updateUserMetadata(target.userId, { unsafeMetadata: { role: "ADMIN", capabilities: allCaps } });
  const forged = await rpc(auth.customer.database, "staff_list_roles");
  ensure(!!forged.error, "metadata_granted_admin");
  const boot = await rpc(c.admin, "project_admin_set_staff_role", { p_user_id: actor.userId, p_role: "ADMIN", p_protected: false, p_reason: `Disposable role tests ${state.runId}` });
  ensure(!boot.error && boot.data.role === "ADMIN", "fixture_admin_bootstrap_failed");
  const directory = await json(await request(c, "/api/admin/roles?limit=10&offset=0", auth.staff.appToken), 200, "admin_list");
  const actorRow = directory.items.find((item) => item.userId === actor.userId);
  ensure(actorRow?.identity?.email?.toLowerCase() === actor.email.toLowerCase(), "role_identity_must_match_verified_clerk_subject");
  ensure(directory.items.every((item) => item.identity && Object.keys(item.identity).sort().join(",") === "email,name"), "role_identity_projection_invalid");
  for (const query of ["limit=51", "limit=1&limit=2", "offset=5001", "other=x"]) {
    await json(await request(c, `/api/admin/roles?${query}`, auth.staff.appToken), 400, "invalid_list_query");
  }
  const validBody = { email: target.email, targetUserId: null, role: "EDITOR", expectedVersion: 0, reason: "Boundary checks" };
  const crossOrigin = await appRequest(c.appOrigin, "/api/admin/roles", auth.staff.appToken, { method: "POST", headers: { origin: "https://example.invalid", "content-type": "application/json" }, body: JSON.stringify(validBody) });
  await json(crossOrigin, 403, "cross_origin");
  const wrongType = await appRequest(c.appOrigin, "/api/admin/roles", auth.staff.appToken, { method: "POST", headers: { origin: c.appOrigin, "content-type": "text/plain" }, body: JSON.stringify(validBody) });
  await json(wrongType, 415, "wrong_content_type");
  const oversized = await appRequest(c.appOrigin, "/api/admin/roles", auth.staff.appToken, { method: "POST", headers: { origin: c.appOrigin, "content-type": "application/json" }, body: " ".repeat(4097) });
  await json(oversized, 413, "oversized_request");
  const roleChange = async (role, version, status = 200, extra = {}) => json(await request(c, "/api/admin/roles", auth.staff.appToken, {
    email: target.email, role, expectedVersion: version, targetUserId: version ? target.userId : null,
    reason: `Disposable role change ${state.runId}`, ...extra,
  }), status, "role_change");
  const verifyCaps = async (role) => {
    const rows = await table(auth.customer.database, "staff_capabilities").select("capability").eq("user_id", target.userId).limit(10);
    ensure(!rows.error, "effective_cap_read_failed");
    assert.deepEqual(rows.data.map((r) => r.capability).sort(), expectedCaps[role]);
    for (const capability of allCaps) {
      const result = await rpc(auth.customer.database, "has_capability", { capability_name: capability });
      ensure(!result.error && result.data === expectedCaps[role].includes(capability), "effective_cap_rpc_mismatch");
    }
  };
  let changed = await roleChange("EDITOR", 0);
  let member = changed.membership;
  ensure(member?.userId === target.userId && member.version === 1, "assignment_failed");
  await verifyCaps("EDITOR");
  await json(await request(c, "/api/admin/pages?limit=1", auth.customer.appToken), 200, "editor_pages");
  await json(await request(c, "/api/admin/pricing?limit=1", auth.customer.appToken), 403, "editor_catalog_denied");
  await json(await request(c, "/api/admin/roles", auth.customer.appToken), 403, "editor_roles_denied");
  const visible = await table(auth.customer.database, "staff_role_memberships").select("user_id,role").limit(100);
  ensure(!visible.error && visible.data.length === 1 && visible.data[0].user_id === target.userId, "role_membership_rls_leak");
  for (const client of [anon, auth.customer.database]) {
    for (const name of ["staff_apply_role", "project_admin_set_staff_role"]) {
      const args = { p_user_id: target.userId, p_role: "ADMIN", p_protected: false, p_reason: "Forged role" };
      if (name === "staff_apply_role") args.p_actor = actor.userId;
      ensure(!!(await rpc(client, name, args)).error, "private_role_helper_allowed");
    }
    const eventRead = await table(client, "staff_role_events").select("*").limit(1);
    ensure(!!eventRead.error, "role_audit_read_allowed");
  }
  const escalated = await rpc(auth.customer.database, "staff_set_role", { p_user_id: target.userId, p_role: "ADMIN", p_expected_version: member.version, p_reason: "Escalation attempt" });
  ensure(!!escalated.error, "self_escalation_allowed");
  for (const name of ["staff_role_memberships", "staff_capabilities"]) {
    const results = await Promise.all([
      table(auth.customer.database, name).insert([{ user_id: target.userId, ...(name === "staff_capabilities" ? { capability: "staff.manage", granted_by: target.userId } : { role: "ADMIN", assigned_by: target.userId }) }]),
      table(auth.customer.database, name).update(name === "staff_capabilities" ? { granted_by: target.userId } : { role: "ADMIN" }).eq("user_id", target.userId),
      table(auth.customer.database, name).delete().eq("user_id", target.userId),
    ]);
    ensure(results.every((r) => !!r.error), "direct_role_dml_allowed");
  }
  const manual = await rpc(c.admin, "set_staff_capability", { target_user_id: target.userId, capability_name: "staff.manage", enabled: true, reason: "Do not mix manual grants" });
  ensure(!!manual.error && manual.error.details === "role_managed", "manual_role_capability_override");
  await roleChange("SUPPORT", 0, 409);
  await roleChange("SUPPORT", member.version, 400, { protected: true });
  await roleChange("SUPPORT", member.version, 404, { targetUserId: actor.userId });
  const self = await json(await request(c, "/api/admin/roles", auth.staff.appToken, { email: actor.email, targetUserId: actor.userId, role: "CUSTOMER", expectedVersion: boot.data.version, reason: "Self demotion denied" }), 409, "self_change");
  ensure(self.error.code === "self_change", "self_change_error");
  const protectedOwner = await json(await request(c, "/api/admin/roles", auth.staff.appToken, { email: owner.email, targetUserId: owner.userId, role: "CUSTOMER", expectedVersion: ownerBefore.data[0].version, reason: "Protected owner test must reject" }), 409, "protected_owner");
  ensure(protectedOwner.error.code === "protected_admin", "protected_owner_error");
  await roleChange("SUPPORT", member.version, 404, { email: `${state.runId}@not-registered.invalid` });
  const raceBody = (role) => ({ email: target.email, targetUserId: target.userId, role, expectedVersion: member.version, reason: "Concurrent role change test" });
  const race = await Promise.all([request(c, "/api/admin/roles", auth.staff.appToken, raceBody("SUPPORT")), request(c, "/api/admin/roles", auth.staff.appToken, raceBody("CATALOG"))]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const winner = await safeJson(race.find((r) => r.status === 200), "race_json");
  member = winner.membership;
  await verifyCaps(member.role);
  changed = await roleChange("SUPPORT", member.version);
  member = changed.membership;
  await verifyCaps("SUPPORT");
  await json(await request(c, "/api/admin/inquiries?limit=1", auth.customer.appToken), 200, "support_inquiries");
  await json(await request(c, "/api/admin/pages?limit=1", auth.customer.appToken), 403, "support_pages_denied");
  changed = await roleChange("CATALOG", member.version);
  member = changed.membership;
  await verifyCaps("CATALOG");
  await json(await request(c, "/api/admin/pricing?limit=1", auth.customer.appToken), 200, "catalog_pricing");
  await json(await request(c, "/api/admin/inventory?limit=1", auth.customer.appToken), 200, "catalog_inventory");
  await json(await request(c, "/api/admin/inquiries?limit=1", auth.customer.appToken), 403, "catalog_inquiries_denied");
  changed = await roleChange("CUSTOMER", member.version);
  await verifyCaps("CUSTOMER");
  await json(await request(c, "/api/admin/access", auth.customer.appToken), 403, "revoked_admin_access");
  const events = await table(c.admin, "staff_role_events").select("actor,role,reason").eq("user_id", target.userId).limit(20);
  ensure(!events.error && events.data.length >= 4 && events.data.every((e) => e.actor === actor.userId && e.reason), "audit_missing");
  const ownerAfter = await table(c.admin, "staff_role_memberships").select("user_id,role,version,protected").eq("user_id", owner.userId);
  assert.deepEqual(ownerAfter.data, ownerBefore.data, "owner_role_changed");
  console.log("Role isolation passed: real capability effects, owner protection, self/metadata escalation denial, RLS/direct-DML, versions and audit.");
}
async function main() {
  const args = new Set(process.argv.slice(2));
  ensure([...args].every((a) => ["--cleanup", "--keep-fixtures"].includes(a)) && args.size < 2, "invalid_arguments");
  const c = await preflight();
  if (args.has("--cleanup")) { await cleanup(c, JSON.parse(await readFile(fixturePath, "utf8"))); console.log("Role fixtures removed."); return; }
  try { await readFile(fixturePath); throw new Error("existing_role_fixtures_use_cleanup"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  const state = { runId: randomUUID(), users: [] };
  try {
    const fixtures = await createFixtures(c.clerk, state.runId, (u) => state.users.push(u));
    state.users = fixtures.users;
    await save(state);
    await run(c, state, fixtures.auth);
  } finally {
    if (args.has("--keep-fixtures") && state.users.length === 2) { await save(state); console.log("Role fixtures retained for browser tests."); }
    else await cleanup(c, state);
  }
}
main().catch((e) => { console.error(`Role verification failed: ${/^[A-Za-z0-9_]+$/.test(e.message) ? e.message : "assertion_failed"}.`); process.exitCode = 1; });
