import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminOrderListQuery, parseAdminOrderListRpcResult } from "../lib/admin/orders-contract.ts";

const filters = { group: "all", payment: "all", environment: "razorpay_test", from: "", to: "" };
const scope = { environment: "razorpay_test", from: "", to: "" };
const stats = { total: 8, pending: 2, active: 4, delivered: 0, cancelled: 1, exceptional: 1 };
const query = { ...scope, limit: 20, offset: 0 };
const metadata = { paymentState: "paid", environment: "razorpay_test", customer: { name: "A Customer", email: "a@example.com", phone: "9876543210" }, lineCount: 1, unitCount: 3 };

test("admin order query applies bounded defaults and accepts supported filters", () => {
  assert.deepEqual(parseAdminOrderListQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", ...filters, sort: "created_desc", limit: 20, offset: 0 },
  });
  assert.deepEqual(parseAdminOrderListQuery(new URLSearchParams(
    "q=%20PB-2042%20&status=processing&sort=total_asc&limit=50&offset=100",
  )), {
    ok: true,
    value: { q: "PB-2042", status: "processing", ...filters, sort: "total_asc", limit: 50, offset: 100 },
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
    "offset=01", `q=${"x".repeat(121)}`, `q=${"+".repeat(121)}`, "q=%0A", "q=%C2%85",
    "environment=live", "environment=all", "group=fulfilled", "payment=refunded", "from=2026-02-30", "from=2026-13-01",
    "from=2026-10-29&to=2026-10-28", "from=2026-10-28T00:00:00Z", "payment=paid&payment=review",
  ]) assert.equal(parseAdminOrderListQuery(new URLSearchParams(query)).ok, false, query);
});

test("complete backend filters validate dates, groups, payment and isolated environments", () => {
  const result = parseAdminOrderListQuery(new URLSearchParams("q=Alex%20B&environment=simulation&group=active&payment=simulated&from=2024-02-29&to=2026-10-28"));
  assert.deepEqual(result, { ok: true, value: { q: "Alex B", status: "all", group: "active", payment: "simulated", environment: "simulation", from: "2024-02-29", to: "2026-10-28", sort: "created_desc", limit: 20, offset: 0 } });
  for (const group of ["all", "pending", "active", "delivered", "cancelled"]) assert.equal(parseAdminOrderListQuery(new URLSearchParams({ group })).ok, true);
  for (const payment of ["all", "unconfigured", "simulated", "pending", "verified", "paid", "failed", "cancelled", "review"]) assert.equal(parseAdminOrderListQuery(new URLSearchParams({ payment })).ok, true);
});

test("admin order RPC result validates and projects the private summary contract", () => {
  const result = parseAdminOrderListRpcResult({
    items: [{
      reference: "PB-2042", status: "processing", totalPaise: 125000, currency: "INR",
      createdAt: "2026-10-27T08:00:00+00:00", updatedAt: "2026-10-27T09:00:00Z",
      ...metadata,
    }],
    total: 8, limit: 20, offset: 0, stats, scope,
  }, query);
  assert.deepEqual(result, {
    items: [{
      reference: "PB-2042", status: "processing", totalPaise: 125000, currency: "INR",
      createdAt: "2026-10-27T08:00:00.000Z", updatedAt: "2026-10-27T09:00:00.000Z",
      ...metadata,
    }],
    total: 8, limit: 20, offset: 0, stats, scope,
  });
});

test("admin order RPC result rejects out-of-contract records and leaked fields", () => {
  const item = {
    reference: "PB-2042", status: "pending", totalPaise: 1000, currency: "INR",
    createdAt: "2026-10-27T08:00:00Z", updatedAt: "2026-10-27T09:00:00Z",
    ...metadata,
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
  ]) assert.equal(parseAdminOrderListRpcResult({ ...result, stats, scope }, { ...scope, limit: 1, offset: 0 }), null);
});

test("list projection rejects mixed environments, leaked fields and inconsistent full-dataset stats", () => {
  const item = { reference: "TST-example", status: "fulfilled", totalPaise: 100, currency: "INR", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z", ...metadata };
  const valid = { items: [item], total: 1, limit: 20, offset: 0, stats, scope };
  assert.ok(parseAdminOrderListRpcResult(valid, query));
  assert.ok(parseAdminOrderListRpcResult({ ...valid, items: [{ ...item, customer: null, lineCount: null, unitCount: null }] }, query));
  for (const bad of [
    { ...valid, items: [{ ...item, environment: "simulation" }] },
    { ...valid, items: [{ ...item, paymentState: "refunded" }] },
    { ...valid, items: [{ ...item, customer: { ...item.customer, subject: "internal" } }] },
    { ...valid, items: [{ ...item, lineCount: null }] },
    { ...valid, items: [{ ...item, unitCount: 0 }] },
    { ...valid, stats: { ...stats, total: 9 } },
    { ...valid, stats: { ...stats, active: 3, delivered: 1 } },
    { ...valid, scope: { ...scope, environment: "simulation" } },
    { ...valid, scope: { ...scope, from: "2026-10-28" } },
    { ...valid, total: 9 },
  ]) assert.equal(parseAdminOrderListRpcResult(bad, query), null);
});
