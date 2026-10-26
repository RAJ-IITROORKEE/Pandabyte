import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminOrderListQuery, parseAdminOrderListRpcResult } from "../lib/admin/orders-contract.ts";

test("admin order query applies bounded defaults and accepts supported filters", () => {
  assert.deepEqual(parseAdminOrderListQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", sort: "created_desc", limit: 20, offset: 0 },
  });
  assert.deepEqual(parseAdminOrderListQuery(new URLSearchParams(
    "q=%20PB-2042%20&status=processing&sort=total_asc&limit=50&offset=100",
  )), {
    ok: true,
    value: { q: "PB-2042", status: "processing", sort: "total_asc", limit: 50, offset: 100 },
  });
  for (const status of ["pending", "processing", "fulfilled", "cancelled"]) {
    assert.equal(parseAdminOrderListQuery(new URLSearchParams(`status=${status}`)).ok, true);
  }
  for (const sort of ["created_desc", "created_asc", "total_desc", "total_asc"]) {
    assert.equal(parseAdminOrderListQuery(new URLSearchParams(`sort=${sort}`)).ok, true);
  }
});

test("admin order query rejects unknown, duplicate, malformed, and unbounded values", () => {
  for (const query of [
    "debug=1", "q=a&q=b", "status=refunded", "sort=random", "limit=25", "offset=-1", "offset=10001",
    "offset=01", `q=${"x".repeat(121)}`, "q=%0A",
  ]) assert.equal(parseAdminOrderListQuery(new URLSearchParams(query)).ok, false, query);
});

test("admin order RPC result validates and projects the private summary contract", () => {
  const result = parseAdminOrderListRpcResult({
    items: [{
      reference: "PB-2042", status: "processing", totalPaise: 125000, currency: "INR",
      createdAt: "2026-10-27T08:00:00+00:00", updatedAt: "2026-10-27T09:00:00Z",
    }],
    total: 8, limit: 20, offset: 0,
  }, { limit: 20, offset: 0 });
  assert.deepEqual(result, {
    items: [{
      reference: "PB-2042", status: "processing", totalPaise: 125000, currency: "INR",
      createdAt: "2026-10-27T08:00:00.000Z", updatedAt: "2026-10-27T09:00:00.000Z",
    }],
    total: 8, limit: 20, offset: 0,
  });
});

test("admin order RPC result rejects out-of-contract records and leaked fields", () => {
  const item = {
    reference: "PB-2042", status: "pending", totalPaise: 1000, currency: "INR",
    createdAt: "2026-10-27T08:00:00Z", updatedAt: "2026-10-27T09:00:00Z",
  };
  for (const result of [
    { items: [{ ...item, customerEmail: "private@example.com" }], total: 1, limit: 1, offset: 0 },
    { items: [{ ...item, status: "refunded" }], total: 1, limit: 1, offset: 0 },
    { items: [{ ...item, totalPaise: 1.5 }], total: 1, limit: 1, offset: 0 },
    { items: [{ ...item, totalPaise: -1 }], total: 1, limit: 1, offset: 0 },
    { items: [{ ...item, currency: "USD" }], total: 1, limit: 1, offset: 0 },
    { items: [{ ...item, createdAt: "invalid" }], total: 1, limit: 1, offset: 0 },
    { items: [item, item], total: 2, limit: 1, offset: 0 },
    { items: [item], total: 0, limit: 1, offset: 0 },
    { items: [], total: 0, limit: 20, offset: 0, customerCount: 1 },
    { items: [], total: 0, limit: 20, offset: 1 },
  ]) assert.equal(parseAdminOrderListRpcResult(result, { limit: 1, offset: 0 }), null);
});
