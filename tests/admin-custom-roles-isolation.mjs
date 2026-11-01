import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import sharp from "sharp";
import { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures, appRequest } from "./phase2-isolation.mjs";

const stateFile = new URL("../.bootstrap/custom-role-fixtures.json", import.meta.url);
const rpc = (c, name, args = {}) => c.database.schema("public").rpc(name, args);
const table = (c, name) => c.database.schema("public").from(name);
const c = await preflight();
let state;
const save = async () => { await mkdir(new URL("../.bootstrap/", import.meta.url), { recursive: true }); await writeFile(stateFile, JSON.stringify(state)); };
async function remove(name, column, values) {
  if (!values.length) return;
  const result = await table(c.admin, name).delete().in(column, values);
  assert.equal(result.error, null, `cleanup_${name}`);
}
async function cleanup() {
  const activeUsers = [];
  for (const user of state.users) {
    try { await verifyFixtureOwnership(c.clerk, user); activeUsers.push(user); }
    catch (error) {
      if (!state.deletionIntents?.includes(user.userId)) throw error;
      let missing = false;
      try { await c.clerk.users.getUser(user.userId); } catch (e) { missing = e.status === 404; }
      assert.equal(missing, true, "only confirmed fixture deletions may skip identity cleanup");
    }
  }
  const ids = state.users.map((u) => u.userId);
  if (state.mediaKeys?.length) {
    for (const key of state.mediaKeys) {
      assert.match(key, /^assets\/[0-9a-f-]{36}\.webp$/);
      const result = await c.admin.storage.from("editorial-media").remove(key);
      assert.ok(!result.error || result.error.statusCode === 404, "cleanup_fixture_media");
    }
  }
  if (state.records.length) {
    const variants = await table(c.admin, "catalog_variants").select("id").in("product_id", state.records);
    assert.equal(variants.error, null);
    const variantIds = variants.data.map((v) => v.id);
    await remove("variant_price_events", "variant_id", variantIds);
    await remove("inventory_balances", "variant_id", variantIds);
    await remove("catalog_variants", "id", variantIds);
  }
  await remove("cms_audit_events", "entity_id", state.records);
  await remove("cms_audit_events", "actor", ids);
  await remove("cms_records", "id", state.records);
  await remove("staff_role_memberships", "user_id", ids);
  await remove("staff_role_events", "user_id", ids);
  await remove("staff_user_removals", "user_id", ids);
  await remove("staff_capability_events", "user_id", ids);
  await remove("staff_role_definition_events", "role_key", state.roles);
  await remove("staff_role_definitions", "key", state.roles);
  await cleanFixtures(c, activeUsers, state.runId);
  await unlink(stateFile);
}
if (process.argv.includes("--cleanup")) {
  state = JSON.parse(await readFile(stateFile));
  await cleanup(); console.log("Disposable custom-role fixtures cleaned.");
} else {
  try { await readFile(stateFile); throw new Error("Existing disposable fixtures require --cleanup first."); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  state = { runId: randomUUID(), users: [], roles: [], records: [], mediaKeys: [], deletionIntents: [] };
  let passed = false;
  try {
    const fixture = await createFixtures(c.clerk, state.runId, (user) => state.users.push(user));
    await save();
    const actor = state.users.find((u) => u.role === "staff"), target = state.users.find((u) => u.role === "customer");
    const actorDb = fixture.auth.staff.database, targetDb = fixture.auth.customer.database;
    const ownerBefore = await table(c.admin, "staff_role_memberships").select("user_id,role,version,protected").eq("protected", true);
    assert.equal(ownerBefore.error, null);
    const boot = await rpc(c.admin, "project_admin_set_staff_role", { p_user_id: actor.userId, p_role: "ADMIN", p_protected: false, p_reason: `Disposable access review ${state.runId}` });
    assert.equal(boot.error, null);
    const api = async (path, as = "staff", body, expected = 200, method = "POST") => {
      const response = await appRequest(c.appOrigin, path, as ? fixture.auth[as].appToken : null,
        body === undefined ? {} : { method, headers: { origin: c.appOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      assert.equal(response.status, expected, `${path}:${data.error?.code ?? "response"}`);
      assert.ok(response.headers.get("cache-control")?.includes("no-store"));
      return data;
    };
    const denied = async (client, name, args = {}) => {
      const result = await rpc(client, name, args); assert.ok(result.error, `${name} must deny`);
      assert.ok(["forbidden", "unauthenticated"].includes(result.error.details), `${name}:wrong_error`);
    };
    await api("/api/admin/users", null, undefined, 401);
    await api("/api/admin/users", "customer", undefined, 403);
    const catalog = await api("/api/admin/role-definitions"); assert.equal(catalog.items.length, 5);
    const directory = await api(`/api/admin/users?query=${encodeURIComponent(target.email)}`);
    assert.equal(directory.items.length, 1); assert.equal(directory.items[0].orderCount, 0); assert.equal(directory.items[0].verified, true);
    assert.equal(directory.items[0].version, 0); assert.equal(directory.items[0].role, "CUSTOMER");
    const input = { key: null, name: `Disposable access ${state.runId.slice(0, 8)}`, description: "Temporary verification role", permissions: ["blog.read"], expectedVersion: 0, reason: "Disposable verification" };
    await api("/api/admin/role-definitions", "staff", { ...input, permissions: ["users.update"] }, 400);
    const created = await api("/api/admin/role-definitions", "staff", input); const role = created.role; state.roles.push(role.key); await save();
    await api("/api/admin/role-definitions", "staff", input, 409);
    const assign = { email: target.email, targetUserId: target.userId, role: role.key, expectedVersion: 0, reason: "Disposable verification" };
    let membership = (await api("/api/admin/roles", "staff", assign)).membership;
    assert.equal(membership.role, role.key);
    await api("/api/admin/roles", "staff", assign, 409);
    const blog = await rpc(targetDb, "admin_list_records", { p_kind: "blog", p_query: "", p_limit: 10, p_offset: 0 }); assert.equal(blog.error, null);
    await denied(targetDb, "admin_list_records", { p_kind: "page", p_query: "", p_limit: 10, p_offset: 0 });
    await denied(targetDb, "admin_save_record", { p_id: null, p_kind: "blog", p_expected_version: null, p_document: {} });
    await denied(targetDb, "admin_list_media", { p_query: "", p_limit: 10, p_offset: 0 });
    assert.equal((await rpc(targetDb, "media_storage_allowed", { p_key: `assets/${randomUUID()}.docx`, p_operation: "write" })).data, false);
    const secondInput = { ...input, key: role.key, expectedVersion: role.version, permissions: ["orders.read"] };
    let updated = (await api("/api/admin/role-definitions", "staff", secondInput)).role;
    await api("/api/admin/role-definitions", "staff", secondInput, 409);
    await denied(targetDb, "admin_list_records", { p_kind: "blog", p_query: "", p_limit: 10, p_offset: 0 });
    assert.equal((await rpc(targetDb, "has_capability", { capability_name: "staff.manage" })).data, true);
    assert.equal((await rpc(targetDb, "staff_can_manage_roles")).data, false);
    await api("/api/admin/users", "customer", undefined, 403);
    await api("/api/admin/roles", "customer", { ...assign, role: "ADMIN" }, 403);
    await denied(targetDb, "staff_list_roles");
    await denied(targetDb, "staff_user_summaries", { p_user_ids: [actor.userId] });
    const rows = await table(targetDb, "staff_role_memberships").select("user_id"); assert.equal(rows.error, null); assert.deepEqual(rows.data.map((r) => r.user_id), [target.userId]);
    const orders = await rpc(targetDb, "admin_list_orders", { p_query: "", p_status: "all", p_sort: "created_desc", p_limit: 10, p_offset: 0 }); assert.equal(orders.error, null);
    await denied(targetDb, "admin_update_checkout_order", { p_reference: "does-not-exist", p_expected_version: 1, p_status: "processing", p_shipping: {} });
    // Create-only content may save a new draft, but may not update that draft afterward.
    updated = (await api("/api/admin/role-definitions", "staff", { ...input, key: role.key, expectedVersion: updated.version, permissions: ["blog.read", "blog.create"] })).role;
    const document = { title: "Disposable access check", slug: `access-${state.runId}`, summary: "Disposable draft", seoTitle: "Disposable draft", seoDescription: "Disposable draft", blocks: [], author: "Test", tags: [], mediaIds: [] };
    const saved = await rpc(targetDb, "admin_save_record", { p_id: null, p_kind: "blog", p_expected_version: null, p_document: document });
    assert.equal(saved.error, null, "create-only blog draft"); state.records.push(saved.data.record.id); await save();
    await denied(targetDb, "admin_save_record", { p_id: saved.data.record.id, p_kind: "blog", p_expected_version: saved.data.record.version, p_document: document });
    await denied(targetDb, "admin_transition_record", { p_id: saved.data.record.id, p_expected_version: saved.data.record.version, p_action: "publish", p_revision_id: null });
    updated = (await api("/api/admin/role-definitions", "staff", { ...input, key: role.key, expectedVersion: updated.version, permissions: ["products.read", "products.create"] })).role;
    const sku = `AR-${state.runId.slice(0, 8)}`;
    const product = { title: "Disposable product access check", slug: `access-product-${state.runId}`, summary: "Disposable draft", seoTitle: "Disposable draft", seoDescription: "Disposable draft", blocks: [], categoryIds: [], modelNumbers: [], variants: [{ sku, label: "Fixture" }], specifications: [], compatibility: [], kitContents: [], resources: [], mediaIds: [] };
    const result = await rpc(targetDb, "admin_save_product_with_prices", { p_id: null, p_expected_version: null, p_document: product,
      p_prices: [{ sku, expectedPriceVersion: 0, regularPricePaise: 10000, actualPricePaise: 10000, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Disposable access test" }] });
    assert.equal(result.error, null, "create-only product with initial pricing"); state.records.push(result.data.record.id); await save();
    const variant = await table(c.admin, "catalog_variants").select("id,price_version").eq("product_id", result.data.record.id);
    assert.equal(variant.error, null);
    for (const args of [
      { p_variant_id: variant.data[0].id, p_expected_version: variant.data[0].price_version, p_regular_paise: 11000, p_sale_paise: null, p_sale_from: null, p_sale_until: null, p_reason: "Denied price edit" },
      { p_variant_id: variant.data[0].id, p_expected_version: variant.data[0].price_version, p_regular_paise: 11000, p_actual_paise: 11000, p_sale_paise: null, p_sale_from: null, p_sale_until: null, p_reason: "Denied price edit" },
    ]) await denied(targetDb, "admin_set_variant_price", args);
    const internalPrice = await rpc(targetDb, "staff_internal_set_variant_price", { p_variant_id: variant.data[0].id, p_expected_version: variant.data[0].price_version, p_regular_paise: 11000, p_actual_paise: 11000, p_sale_paise: null, p_sale_from: null, p_sale_until: null, p_reason: "Denied internal helper" });
    assert.ok(internalPrice.error, "internal price helper cannot be called by runtime users");
    await api("/api/admin/role-definitions", "staff", { ...input, key: role.key, expectedVersion: updated.version, permissions: ["media.read", "media.create"] });
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#008040" } }).webp().toBuffer();
    const actorKey = `assets/${randomUUID()}.webp`, ownKey = `assets/${randomUUID()}.webp`;
    state.mediaKeys.push(actorKey, ownKey); await save();
    const upload = (client, key) => client.storage.from("editorial-media").upload(key, new File([bytes], "access.webp", { type: "image/webp" }));
    assert.equal((await upload(actorDb, actorKey)).error, null);
    assert.equal((await upload(targetDb, ownKey)).error, null);
    const deniedRemove = await targetDb.storage.from("editorial-media").remove(actorKey);
    assert.ok(deniedRemove.error, "custom creator cannot delete another uploader's unregistered object");
    assert.equal((await c.admin.storage.from("editorial-media").download(actorKey)).error, null);
    assert.equal((await targetDb.storage.from("editorial-media").remove(ownKey)).error, null);
    await api("/api/admin/roles", "staff", { email: actor.email, targetUserId: actor.userId, role: "CUSTOMER", expectedVersion: boot.data.version, reason: "Must reject self change" }, 409);
    const ownerAfter = await table(c.admin, "staff_role_memberships").select("user_id,role,version,protected").eq("protected", true);
    assert.deepEqual(ownerAfter.data, ownerBefore.data);
    const orderHistoryBefore = await table(c.admin, "admin_order_records").select("id,version,status,total_paise").order("id").limit(1000);
    assert.equal(orderHistoryBefore.error, null);
    const removePath = `/api/admin/users/${target.userId}`, removal = { expectedVersion: 0, reason: "Disposable removal verification" };
    await api(removePath, null, removal, 401, "DELETE");
    await api(removePath, "customer", removal, 403, "DELETE");
    await api(`/api/admin/users/${actor.userId}`, "staff", { ...removal, expectedVersion: boot.data.version }, 409, "DELETE");
    await api(`/api/admin/users/${ownerBefore.data[0].user_id}`, "staff", { ...removal, expectedVersion: ownerBefore.data[0].version }, 409, "DELETE");
    await api(removePath, "staff", removal, 409, "DELETE");
    const summary = await rpc(actorDb, "staff_user_summaries", { p_user_ids: [target.userId] }); assert.equal(summary.error, null);
    await verifyFixtureOwnership(c.clerk, target); state.deletionIntents.push(target.userId); await save();
    const removed = await api(removePath, "staff", { ...removal, expectedVersion: summary.data.items[0].version }, 200, "DELETE");
    assert.equal(removed.removed, true);
    let missing = false; try { await c.clerk.users.getUser(target.userId); } catch (e) { missing = e.status === 404; } assert.equal(missing, true);
    assert.equal((await api(removePath, "staff", removal, 200, "DELETE")).removed, true);
    const orderHistoryAfter = await table(c.admin, "admin_order_records").select("id,version,status,total_paise").order("id").limit(1000);
    assert.deepEqual(orderHistoryAfter.data, orderHistoryBefore.data);
    assert.deepEqual((await table(c.admin, "staff_role_memberships").select("user_id,role,version,protected").eq("protected", true)).data, ownerBefore.data);
    console.log("Custom roles, permission isolation, own-upload cleanup, verified-user removal/idempotency, retained order history and protected owner checks passed.");
    passed = true;
  } finally {
    await save();
    if (!process.argv.includes("--keep-fixtures") || !passed) await cleanup();
  }
}
