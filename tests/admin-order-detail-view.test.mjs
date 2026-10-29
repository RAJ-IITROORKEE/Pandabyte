import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(new URL("../components/admin/order-detail.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function harness(order, activity = null) {
  let cursor = 0;
  const state = [], exports = {}, requests = [];
  let response = { ok: false, status: 409 };
  const deps = {
    react: { ...require("react"), useState(initial) { const i = cursor++; if (!(i in state)) state[i] = i === 0 ? order : i === 11 ? activity : initial; return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; }, useEffect() {} },
    "@clerk/nextjs": { useUser: () => ({ isLoaded: true, user: { id: "test" } }) },
    "@/components/admin/admin-shell": { useAdminCapabilities: () => ["staff.manage"] },
    "@/components/admin/record-screens": { AdminAccessDeniedScreen: () => null },
    "next/link": { __esModule: true, default: ({ children, ...props }) => require("react").createElement("a", props, children) },
    "./admin-ui.module.css": { default: {} }, "./order-detail.module.css": { default: {} },
  };
  runInNewContext(compiled + "\nexports.testApi = { allowedStatuses, orderBackHref, OrderDetailSession, TrackingLink };", { exports, require: name => deps[name] ?? require(name), AbortController, URL, Intl, Date, fetch: async (...args) => { requests.push(args); return response; } });
  return { ...exports.testApi, state, requests, response: value => { response = value; }, tree: () => { cursor = 0; return exports.testApi.OrderDetailSession({ reference: order.reference }); }, render: () => { cursor = 0; return renderToStaticMarkup(exports.testApi.OrderDetailSession({ reference: order.reference })); } };
}
const order = {
  reference: "SIM-11111111-1111-4111-8111-111111111111", status: "pending", version: 1, totalPaise: 12345,
  environment: "simulation", paymentState: "simulated", createdAt: "2026-10-28T06:30:00Z", updatedAt: "2026-10-28T06:30:00Z",
  snapshot: { contact: { firstName: "Test", lastName: "Customer", email: "disposable@example.test", phone: "+910000000000" },
    shipping: { recipientName: "Original Recipient", phone: "+910000000000", line1: "Original snapshot address", line2: "", city: "Test City", state: "Test State", postalCode: "000000", country: "India" },
    business: "Snapshot business", gstin: "Recorded GSTIN", chargesAreFictional: true, fictionalShippingPaise: 100, fictionalTaxPaise: 245,
    quote: { subtotalPaise: 12000, lines: [{ variantId: "line", title: "Purchased product", quantity: 2, lineTotalPaise: 12000, variant: { sku: "OLD-SKU", label: "Purchased variant", effectivePricePaise: 6000 } }] } },
};
test("detail transitions mirror simulation and paid test fulfillment without reopening terminal or review histories", () => {
  const h = harness(order);
  assert.deepEqual([...h.allowedStatuses(order)], ["pending", "processing", "cancelled"]);
  assert.deepEqual([...h.allowedStatuses({ ...order, status: "processing" })], ["processing", "fulfilled", "cancelled"]);
  for (const status of ["fulfilled", "cancelled"]) assert.deepEqual([...h.allowedStatuses({ ...order, status })], [status]);
  const paid = { ...order, environment: "razorpay_test", paymentState: "paid" };
  assert.deepEqual([...h.allowedStatuses(paid)], ["pending", "processing"]);
  assert.deepEqual([...h.allowedStatuses({ ...paid, status: "processing" })], ["processing", "fulfilled"]);
  for (const paymentState of ["pending", "verified", "review", "failed", "cancelled"]) assert.deepEqual([...h.allowedStatuses({ ...paid, paymentState })], []);
  assert.deepEqual([...h.allowedStatuses({ ...order, environment: "legacy" })], []);
});
test("back navigation accepts only the order list and tracking accepts safe HTTPS URLs", () => {
  const h = harness(order);
  assert.equal(h.orderBackHref("/admin/orders?q=SIM&offset=20"), "/admin/orders?q=SIM&offset=20");
  for (const input of ["https://external.test", "//external.test", "/admin/orders/other", "/admin/orders#bad", "/admin/orders?q=bad\n", undefined]) assert.equal(h.orderBackHref(input), "/admin/orders");
  for (const url of ["javascript:alert(1)", "http://example.test", "https://user:password@example.test", "bad", undefined]) assert.equal(h.TrackingLink({ url }), null);
  assert.match(renderToStaticMarkup(h.TrackingLink({ url: "https://carrier.test/track" })), /rel="noopener noreferrer"/);
});
test("detail renders historical item, address, price and fictional charge evidence with honest unsupported fields", () => {
  const markup = harness(order).render();
  for (const value of ["Original Recipient", "Original snapshot address", "Purchased product", "Purchased variant", "OLD-SKU", "₹60.00", "₹120.00", "₹123.45", "Fictional test shipping", "Fictional test tax", "No payment was collected", "Recorded GSTIN", "Not recorded", "Loading recorded order activity", "12:00 pm IST", "Update status"]) assert.ok(markup.includes(value), value);
  assert.ok(!markup.includes("Delivered"));
  const frozen = harness({ ...order, environment: "razorpay_test", paymentState: "review" }).render();
  assert.ok(frozen.includes("Payment requires review"));
  assert.ok(!frozen.includes(">Update status</button>"));
});


test("detail activity displays only supplied audit events and reports bounded history", () => {
  const activity = { items: [{ action: "order.update", occurredAt: "2026-10-28T07:30:00Z", status: "processing", actorLabel: "Administrator", requiresReview: false }], total: 64, limit: 50, truncated: true };
  const markup = harness(order, activity).render();
  assert.ok(markup.includes("Order updated"));
  assert.ok(markup.includes("By Administrator"));
  assert.ok(markup.includes("Fulfillment: Processing"));
  assert.ok(markup.includes("Showing the latest 1 of 64 recorded events"));
  assert.ok(!markup.includes("Order placed</strong>"));
  assert.ok(markup.includes("Previous statuses and internal reasons were not recorded"));
});

function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}
test("status save sends versioned fulfillment only, preserves draft on conflict and confirms server response", async () => {
  const h = harness(order);
  findElement(h.tree(), node => node.props?.children === "Update status").props.onClick();
  findElement(h.tree(), node => node.props?.id === "order-status").props.onChange({ target: { value: "processing" } });
  findElement(h.tree(), node => node.props?.id === "order-carrier").props.onChange({ target: { value: "Test carrier" } });
  await findElement(h.tree(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
  const request = JSON.parse(h.requests[0][1].body);
  assert.deepEqual(request, { expectedVersion: 1, status: "processing", shipping: { carrier: "Test carrier", trackingNumber: "", trackingUrl: "" } });
  assert.match(h.state[3], /Your input is preserved/);
  assert.equal(h.state[0], order);
  assert.equal(h.state[1], "processing");
  assert.equal(h.state[2].carrier, "Test carrier");
  const saved = { ...order, status: "processing", version: 2, snapshot: { ...order.snapshot, shipment: request.shipping } };
  h.response({ ok: true, json: async () => saved });
  await findElement(h.tree(), node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.state[0], saved);
  assert.match(h.state[4], /Order updated/);
  assert.equal(h.state[5], false);
  assert.equal(h.state[6], 1, "success refreshes detail and audit data");
});
