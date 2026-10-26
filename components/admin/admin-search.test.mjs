import assert from "node:assert/strict";
import test from "node:test";
import { searchAdminNavigation, visibleNavigationGroups } from "./admin-navigation.ts";

test("admin page search uses the visible navigation capability set", () => {
  const capabilities = ["catalog.edit", "content.edit"];
  assert.deepEqual(searchAdminNavigation("pricing", capabilities).map(({ href }) => href), ["/admin/pricing"]);
  assert.deepEqual(searchAdminNavigation("users", capabilities), []);
  assert.deepEqual(visibleNavigationGroups(capabilities).map(({ label }) => label), ["Workspace", "Products & catalog", "Site content"]);
  assert.deepEqual(searchAdminNavigation("coming soon", capabilities).map(({ label }) => label), []);
  assert.deepEqual(searchAdminNavigation("chat", capabilities).map(({ href }) => href), ["/admin/chat", "/admin/ai-chat"]);
});
