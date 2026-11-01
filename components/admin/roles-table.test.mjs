import assert from "node:assert/strict";
import test from "node:test";
import { accountsCsv, pageRows, roleTone } from "./roles-table.ts";
const row = (overrides = {}) => ({ userId: "a", name: "Alice", email: "a@example.com", imageUrl: null, verified: true, removalPending: false, role: "CUSTOMER", version: 0, protected: false, updatedAt: null, createdAt: null, lastActiveAt: null, orderCount: 0, ...overrides });
test("page filters and sorting operate only on supplied rows", () => {
  const rows = [row(), row({ userId: "b", name: "Bob", role: "ADMIN", verified: false, orderCount: 3 })];
  assert.deepEqual(pageRows(rows, "all", "all", "orders", true, String).map((item) => item.userId), ["b", "a"]);
  assert.deepEqual(pageRows(rows, "ADMIN", "unverified", "account", false, String).map((item) => item.userId), ["b"]);
  assert.deepEqual(rows.map((item) => item.userId), ["a", "b"]);
});
test("CSV escapes quotes and spreadsheet formulas", () => {
  const csv = accountsCsv([row({ name: '=HYPERLINK("bad")', email: "a,b@example.com" })], String);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"a,b@example.com"/);
  assert.match(accountsCsv([row({ name: " \t+1" })], String), /"' \t\+1"/);
});
test("role tones are stable and preserve built-in meanings", () => {
  assert.equal(roleTone("ADMIN"), "red"); assert.equal(roleTone("CUSTOMER"), "neutral");
  assert.equal(roleTone("custom_test"), roleTone("custom_test"));
});
