import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminOrderActivity } from "../lib/admin/order-activity-contract.ts";

const event = { action: "order.razorpay_test_capture", occurredAt: "2026-10-28T00:00:00Z", status: null, actorLabel: "Order customer", requiresReview: true };
const empty = { items: [], total: 0, limit: 50, truncated: false };

test("activity validates capped, newest-first audit records with generic actors", () => {
  assert.deepEqual(parseAdminOrderActivity(empty), empty);
  const items = Array.from({ length: 50 }, () => event);
  const result = parseAdminOrderActivity({ items, total: 52, limit: 50, truncated: true });
  assert.equal(result.items.length, 50);
  assert.equal(result.items[0].occurredAt, "2026-10-28T00:00:00.000Z");
  assert.equal(result.total, 52);
});

test("activity rejects raw IDs/details, unknown actions, invalid statuses and inconsistent counts", () => {
  const valid = { items: [event], total: 1, limit: 50, truncated: false };
  for (const bad of [
    { ...valid, items: [{ ...event, actor: "internal-subject" }] },
    { ...valid, items: [{ ...event, id: 123 }] },
    { ...valid, items: [{ ...event, details: {} }] },
    { ...valid, items: [{ ...event, action: "secret.action" }] },
    { ...valid, items: [{ ...event, actorLabel: "user_123" }] },
    { ...valid, items: [{ ...event, status: "delivered" }] },
    { ...valid, items: [{ ...event, requiresReview: "true" }] },
    { ...valid, items: [{ ...event, occurredAt: "invalid" }] },
    { ...valid, total: 51 }, { ...valid, truncated: true }, { ...valid, limit: 100 },
    { ...valid, items: [event, { ...event, occurredAt: "2026-10-29T00:00:00Z" }], total: 2 },
  ]) assert.equal(parseAdminOrderActivity(bad), null);
});
