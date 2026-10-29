import { ADMIN_ORDER_STATUSES, type AdminOrderStatus } from "./orders-contract.ts";

export const ADMIN_ORDER_ACTIVITY_ACTIONS = ["order.simulate", "order.razorpay_test_prepare", "order.razorpay_test_capture", "order.update"] as const;
export type AdminOrderActivityItem = {
  action: (typeof ADMIN_ORDER_ACTIVITY_ACTIONS)[number];
  occurredAt: string;
  status: AdminOrderStatus | null;
  actorLabel: "Administrator" | "Order customer" | "Recorded actor";
  requiresReview: boolean | null;
};
export type AdminOrderActivityResponse = { items: AdminOrderActivityItem[]; total: number; limit: 50; truncated: boolean };

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)); }

export function parseAdminOrderActivity(value: unknown): AdminOrderActivityResponse | null {
  if (!object(value) || !exact(value, ["items", "total", "limit", "truncated"]) || !Array.isArray(value.items) || value.items.length > 50 || value.limit !== 50 ||
    !Number.isSafeInteger(value.total) || (value.total as number) < 0 || value.items.length !== Math.min(value.total as number, 50) || value.truncated !== ((value.total as number) > 50)) return null;
  const items: AdminOrderActivityItem[] = [];
  for (const item of value.items) {
    if (!object(item) || !exact(item, ["action", "occurredAt", "status", "actorLabel", "requiresReview"]) ||
      !(ADMIN_ORDER_ACTIVITY_ACTIONS as readonly unknown[]).includes(item.action) ||
      typeof item.occurredAt !== "string" || !Number.isFinite(Date.parse(item.occurredAt)) ||
      (item.status !== null && !(ADMIN_ORDER_STATUSES as readonly unknown[]).includes(item.status)) ||
      !["Administrator", "Order customer", "Recorded actor"].includes(item.actorLabel as string) ||
      (item.requiresReview !== null && typeof item.requiresReview !== "boolean")) return null;
    const occurredAt = new Date(item.occurredAt).toISOString();
    if (items.length && occurredAt > items[items.length - 1].occurredAt) return null;
    items.push({ action: item.action as AdminOrderActivityItem["action"], occurredAt, status: item.status as AdminOrderStatus | null,
      actorLabel: item.actorLabel as AdminOrderActivityItem["actorLabel"], requiresReview: item.requiresReview as boolean | null });
  }
  return { items, total: value.total as number, limit: 50, truncated: value.truncated as boolean };
}
