import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/cart/razorpay-test-payment.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const id = "00000000-0000-4000-8000-000000000001";
function harness(initialRequest) {
  let hooks = [], cursor = 0, effect, cleanup, selection = [{ variantId: id, quantity: 2 }], marker = id, responses = [], modalOptions, appended = [], completedCart = 0, closed = 0;
  const calls = [], navigations = [], celebrations = [], exports = {}, listeners = {};
  const dependencies = {
    react: { useState: initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = value; }]; }, useRef: initial => { const i = cursor++; return hooks[i] ??= { current: initial }; }, useEffect: fn => { effect = fn; } },
    "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({ replace: url => navigations.push(url) }) }, "./checkout-review.module.css": { default: {} }, "./checkout-money": { formatPaise: String },
    "./cart-api": { loadCustomerCart: async () => ({}) }, "./customer-cart-store": { publishCustomerCart: () => completedCart++ },
    "./buy-now-store": { getBuyNowSelection: () => selection, clearBuyNowSelection: () => { selection = null; } },
    "./cart-utils": { sameCartItems: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    "./order-celebration": { markCelebration: (...args) => celebrations.push(args) },
  };
  const window = { Razorpay: class { constructor(options) { modalOptions = options; } on(event, callback) { listeners[event] = callback; } open() {} close() { closed++; } } };
  const document = { createElement: () => ({}), querySelector: () => ({ nonce: "nonce" }), head: { appendChild: node => appended.push(node) } };
  const storage = { getItem: () => marker, removeItem: () => { marker = null; } };
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name), AbortController, sessionStorage: storage, window, document, fetch: (url, options) => { calls.push({ url, options }); return new Promise(resolve => { responses.push(resolve); }); }, setTimeout });
  const props = { userId: "user-a", marker: id, initialRequest, onContinue() {} };
  function render() { cursor = 0; return exports.RazorpayTest(props); }
  render(); cleanup = effect();
  return { exports, calls, navigations, celebrations, render, window, appended, document, dispatch: event => listeners[event](), strictRemount: () => { cleanup(); cleanup = effect(); }, respond: async data => { responses.shift()({ ok: true, json: async () => data }); await new Promise(resolve => setImmediate(resolve)); }, stop: () => cleanup(), get marker() { return marker; }, get selection() { return selection; }, get modalOptions() { return modalOptions; }, get completedCart() { return completedCart; }, get closed() { return closed; } };
}
const order = { state: "ready", reference: `TST-${id}`, totalPaise: 100, mode: "buy-now", items: [{ variantId: id, quantity: 1 }], key: "rzp_test_abc", providerOrderId: "order_abc" };
test("validates the server payment state and requires test credentials for ready", () => {
  const h = harness();
  assert(h.exports.validResult(order));
  assert(!h.exports.validResult({ ...order, key: "rzp_live_abc" }));
  assert(!h.exports.validResult({ ...order, state: "invented" }));
  assert(!h.exports.validResult({ ...order, totalPaise: -1 }));
  h.stop();
});
test("reload only recovers and a verified callback is not paid", async () => {
  const h = harness();
  assert.equal(h.calls.length, 1); assert.match(h.calls[0].url, /recover$/);
  await h.respond({ ...order, state: "verified" });
  assert.equal(h.marker, id); assert.deepEqual(h.selection, [{ variantId: id, quantity: 2 }]); assert.equal(h.navigations.length, 0);
  assert.equal(h.celebrations.length, 0);
  assert.match(JSON.stringify(h.render()), /awaiting confirmation/);
  h.stop();
});
test("paid clears only a matching selection and ignores responses after owner changes", async () => {
  const h = harness();
  await h.respond({ ...order, state: "paid" });
  assert.equal(h.marker, null); assert.deepEqual(h.selection, [{ variantId: id, quantity: 2 }]); assert.equal(h.navigations[0], `/checkout/confirmation/TST-${id}`);
  assert.deepEqual(h.celebrations[0], ["user-a", `TST-${id}`]);
  const switched = harness(); switched.stop(); await switched.respond({ ...order, state: "paid" });
  assert.equal(switched.marker, id); assert.equal(switched.completedCart, 0); assert.equal(switched.navigations.length, 0);
});
test("loads the checkout script once with the document nonce", async () => {
  const h = harness(); delete h.window.Razorpay;
  const a = h.exports.loadRazorpay(), b = h.exports.loadRazorpay();
  assert.equal(h.appended.length, 1); assert.equal(h.appended[0].nonce, "nonce");
  h.window.Razorpay = class {}; h.appended[0].onload(); await Promise.all([a, b]); h.stop();
});

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
test("modal stays locked and a late dismissal response cannot overwrite verification", async () => {
  const h = harness(); await h.respond(order);
  const button = find(h.render(), node => node.type === "button" && node.props.children === "Continue test payment");
  await button.props.onClick();
  const modal = h.modalOptions;
  await button.props.onClick();
  assert.equal(h.modalOptions, modal);
  assert.equal(find(h.render(), node => node.type === "button" && node.props.children === "Continue test payment").props.disabled, true);
  const dismissal = modal.modal.ondismiss();
  const callback = modal.handler({ razorpay_order_id: "order_abc", razorpay_payment_id: "pay_abc", razorpay_signature: "signed" });
  assert.match(h.calls[1].url, /cancel$/); assert.match(h.calls[2].url, /verify$/);
  await h.respond({ ...order, state: "cancelled" });
  assert.doesNotMatch(JSON.stringify(h.render()), /Start a new attempt/);
  await h.respond({ ...order, state: "paid" });
  await Promise.all([dismissal, callback]);
  assert.match(JSON.stringify(h.render()), /Test payment confirmed/);
  h.stop();
});

test("failed or cancelled provider attempts retain their marker and cannot be retried", async () => {
  for (const state of ["failed", "cancelled"]) {
    const h = harness(); await h.respond({ ...order, state });
    const view = JSON.stringify(h.render());
    assert.match(view, /late result/); assert.doesNotMatch(view, /Start a new attempt|Continue review/);
    assert.equal(h.marker, id); h.stop();
  }
});
test("a failed script load removes its element before retry", async () => {
  const h = harness(); delete h.window.Razorpay;
  let removed = false; h.document.createElement = () => ({ remove: () => { removed = true; } });
  const first = h.exports.loadRazorpay(); h.appended[0].onerror(); await assert.rejects(first);
  assert(removed); const second = h.exports.loadRazorpay(); assert.equal(h.appended.length, 2);
  h.window.Razorpay = class {}; h.appended[1].onload(); await second; h.stop();
});

test("changing owners closes the old payment modal without discarding the marker", async () => {
  const h = harness(); await h.respond(order);
  const button = find(h.render(), node => node.type === "button" && node.props.children === "Continue test payment");
  await button.props.onClick(); h.stop();
  assert.equal(h.closed, 1); assert.equal(h.marker, id);
  await h.modalOptions.modal.ondismiss(); assert.equal(h.calls.length, 1);
});

test("Strict Mode cleanup before initial startup sends prepare once without recovery", async () => {
  const h = harness(JSON.stringify({ idempotencyKey: id }));
  h.strictRemount();
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /prepare$/);
  assert.equal(h.calls[0].options.signal.aborted, false);
  await h.respond(order);
  assert.equal(h.marker, id);
  h.stop();
});

test("Strict Mode aborted recovery cannot clear loading or show an error", async () => {
  const h = harness();
  h.strictRemount();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.calls[1].options.signal.aborted, false);
  await h.respond(order);
  const loading = JSON.stringify(h.render());
  assert.match(loading, /Checking/);
  assert.doesNotMatch(loading, /could not be checked/);
  await h.respond(order);
  const ready = JSON.stringify(h.render());
  assert.match(ready, /Continue test payment/);
  assert.doesNotMatch(ready, /could not be checked/);
  h.stop();
});


test("a failed event followed by success in the same modal clears the old error", async () => {
  const h = harness(); await h.respond(order);
  const button = find(h.render(), node => node.type === "button" && node.props.children === "Continue test payment");
  await button.props.onClick();
  h.dispatch("payment.failed");
  assert.match(JSON.stringify(h.render()), /test payment failed/);
  const callback = h.modalOptions.handler({ razorpay_order_id: "order_abc", razorpay_payment_id: "pay_abc", razorpay_signature: "signed" });
  assert.doesNotMatch(JSON.stringify(h.render()), /test payment failed/);
  h.dispatch("payment.failed");
  assert.doesNotMatch(JSON.stringify(h.render()), /test payment failed/);
  assert.match(h.calls[1].url, /verify$/);
  await h.respond({ ...order, state: "paid" }); await callback;
  const view = JSON.stringify(h.render());
  assert.match(view, /Test payment confirmed/); assert.doesNotMatch(view, /test payment failed/);
  h.stop();
});
