import assert from "node:assert/strict";
import test from "node:test";
import { searchAdminNavigation, visibleNavigationGroups } from "./admin-navigation.ts";

test("admin page search uses the visible navigation capability set", () => {
  const capabilities = ["catalog.edit", "content.edit"];
  assert.deepEqual(searchAdminNavigation("pricing", capabilities).map(({ href }) => href), []);
  assert.deepEqual(searchAdminNavigation("users", capabilities), []);
  assert.deepEqual(visibleNavigationGroups(capabilities).map(({ label }) => label), ["Products & catalog", "Site content"]);
  assert.deepEqual(searchAdminNavigation("coming soon", capabilities).map(({ label }) => label), []);
  assert.deepEqual(searchAdminNavigation("chat", capabilities).map(({ href }) => href), []);
});

test("orders and inventory navigation follow their separate permissions", () => {
  const urls = (caps) => visibleNavigationGroups(caps).flatMap(({ items }) => items.map(({ href }) => href));
  assert.equal(urls(["orders.manage"]).includes("/admin/inventory"), true);
  assert.equal(urls(["orders.manage"]).includes("/admin/orders"), false);
  assert.deepEqual(searchAdminNavigation("orders", ["orders.manage"]), []);
  assert.equal(urls(["staff.manage"]).includes("/admin/orders"), true);
  assert.equal(urls(["staff.manage"]).includes("/admin/inventory"), false);
  assert.deepEqual(searchAdminNavigation("orders", ["staff.manage"]).map(({ href }) => href), ["/admin/orders"]);
});

test("custom roles only expose their readable sections", () => {
  const capabilities = ["__custom_role__", "products.read", "orders.read"];
  const urls = visibleNavigationGroups(capabilities).flatMap(({ items }) => items.map(({ href }) => href));
  assert.deepEqual(urls, ["/admin/products", "/admin/orders"]);
});
