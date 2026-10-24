import assert from "node:assert/strict";
import test from "node:test";

import {
  STAFF_ROLES,
  parseRoleChangeInput,
  parseRoleListQuery,
  parseStaffRoleList,
  parseStaffRoleMembership,
} from "../lib/admin/roles-validation.ts";

const target = "user_verified_opaque_subject";
const membership = {
  userId: target,
  role: "EDITOR",
  version: 2,
  protected: false,
  updatedAt: "2026-10-24T12:30:45.123456Z",
};

test("role list query is closed, unique, and bounded", () => {
  assert.deepEqual(parseRoleListQuery("http://localhost/api/admin/roles"), { limit: 25, offset: 0 });
  assert.deepEqual(parseRoleListQuery("http://localhost/api/admin/roles?limit=50&offset=5000"), { limit: 50, offset: 5000 });
  for (const query of [
    "limit=0", "limit=51", "limit=1&limit=2", "offset=5001", "offset=-1", "offset=1.5",
    "limit=+1", "limit=01", "unknown=x", "offset=9007199254740992",
  ]) assert.equal(parseRoleListQuery(`http://localhost/api/admin/roles?${query}`), null, query);
  assert.equal(parseRoleListQuery("not a URL"), null);
});

test("role mutation accepts only exact fields and distinguishes first assignment from update", () => {
  const initial = parseRoleChangeInput({
    email: "  Raj@example.com ", role: "ADMIN", expectedVersion: 0,
    reason: " Owner bootstrap ", targetUserId: null,
  });
  assert.deepEqual(initial, {
    email: "raj@example.com", role: "ADMIN", expectedVersion: 0,
    reason: "Owner bootstrap", targetUserId: null,
  });
  assert.deepEqual(parseRoleChangeInput({
    email: "person@example.com", role: "SUPPORT", expectedVersion: 3,
    reason: "Support handoff", targetUserId: target,
  }), {
    email: "person@example.com", role: "SUPPORT", expectedVersion: 3,
    reason: "Support handoff", targetUserId: target,
  });
  assert.deepEqual(STAFF_ROLES, ["ADMIN", "EDITOR", "CATALOG", "SUPPORT", "CUSTOMER"]);

  const valid = { email: "person@example.com", role: "SUPPORT", expectedVersion: 1, reason: "Review", targetUserId: target };
  for (const bad of [
    { ...valid, capabilities: ["staff.manage"] },
    { ...valid, protected: true },
    { ...valid, role: "OWNER" },
    { ...valid, expectedVersion: "1" },
    { ...valid, expectedVersion: -1 },
    { ...valid, expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, expectedVersion: Number.MAX_SAFE_INTEGER },
    { ...valid, targetUserId: null },
    { ...valid, expectedVersion: 0 },
    { ...valid, email: "not-an-email" },
    { ...valid, reason: "  " },
    { ...valid, reason: "x".repeat(501) },
    { ...valid, targetUserId: ` ${target}` },
    { ...valid, extra: true },
  ]) assert.equal(parseRoleChangeInput(bad), null);
  assert.equal(parseRoleChangeInput(null), null);
});

test("RPC membership output is strict and list DTOs reject malformed or duplicate rows", () => {
  assert.deepEqual(parseStaffRoleMembership(membership), membership);
  assert.equal(parseStaffRoleMembership({ ...membership, userId: "" }), null);
  assert.equal(parseStaffRoleMembership({ ...membership, role: "OWNER" }), null);
  assert.equal(parseStaffRoleMembership({ ...membership, version: 0 }), null);
  assert.equal(parseStaffRoleMembership({ ...membership, protected: true }), null);
  assert.equal(parseStaffRoleMembership({ ...membership, updatedAt: "2026-02-30T12:30:45Z" }), null);
  assert.equal(parseStaffRoleMembership({ ...membership, extra: true }), null);

  assert.deepEqual(parseStaffRoleList({ items: [membership], total: 4 }), { items: [membership], total: 4 });
  assert.equal(parseStaffRoleList({ items: [membership, membership], total: 2 }), null);
  assert.equal(parseStaffRoleList({ items: [membership], total: -1 }), null);
  assert.equal(parseStaffRoleList({ items: [membership], total: 0 }), null);
  assert.equal(parseStaffRoleList({ items: [membership], total: 1, emails: [] }), null);
});
