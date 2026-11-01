import test from "node:test";
import assert from "node:assert/strict";
import { parseRoleDefinitionInput, validPermissions, parseUsersQuery, parseUserSummaries } from "../lib/admin/access-contract.ts";
import { parseRoleChangeInput } from "../lib/admin/roles-validation.ts";

test("permissions enforce dependencies and exclude user management", () => {
  assert.equal(validPermissions(["products.read", "products.update", "products.publish"]), true);
  for (const value of [["products.publish"], ["products.read", "products.delete"], ["staff.manage"], ["orders.read", "orders.read"]]) assert.equal(validPermissions(value), false);
});
test("role definitions and selected first assignments have closed inputs", () => {
  const input = { key: null, name: "Warehouse", description: "", permissions: ["inventory.read"], expectedVersion: 0, reason: "New role" };
  assert.deepEqual(parseRoleDefinitionInput(input), input);
  assert.equal(parseRoleDefinitionInput({...input, permissions: ["users.read"]}), null);
  assert.equal(parseRoleDefinitionInput({...input, extra: true}), null);
  const change = {email: "user@example.com", role: "custom_warehouse", expectedVersion: 0, reason: "Assign", targetUserId: "user_123"};
  assert.deepEqual(parseRoleChangeInput(change), change);
  assert.equal(parseRoleChangeInput({...change, role: "custom_a"}), null);
});
test("directory is bounded and requires complete actual counts", () => {
  assert.deepEqual(parseUsersQuery("http://localhost/api/admin/users?query=ann&limit=50&offset=5000"), {query: "ann", limit: 50, offset: 5000});
  assert.equal(parseUsersQuery("http://localhost/api/admin/users?limit=51"), null);
  const summary = {items: [{userId: "user_123", role: "CUSTOMER", version: 0, protected: false, updatedAt: null, orderCount: 0, removalPending: false}], counts: {assigned: 0, staff: 0, byRole: [], staffUsers: []}};
  assert.deepEqual(parseUserSummaries(summary, ["user_123"]), summary);
  assert.equal(parseUserSummaries({...summary, counts: {...summary.counts, staff: 1}}, ["user_123"]), null);
  assert.equal(parseUserSummaries({...summary, items: []}, ["user_123"]), null);
  assert.equal(parseUserSummaries({...summary, items: [{...summary.items[0], orderCount: null}]}, ["user_123"]), null);
});
