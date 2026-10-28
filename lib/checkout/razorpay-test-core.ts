const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseTestRequest(value: unknown, verify = false) {
  if (!object(value)) return null;
  const expected = verify ? ["requestKey", "orderId", "paymentId", "signature"] : ["requestKey"];
  if (Object.keys(value).length !== expected.length || !expected.every(k => k in value) || typeof value.requestKey !== "string" || !uuid.test(value.requestKey)) return null;
  if (verify && (typeof value.orderId !== "string" || !/^order_[a-zA-Z0-9]{1,100}$/.test(value.orderId) || typeof value.paymentId !== "string" || !/^pay_[a-zA-Z0-9]{1,100}$/.test(value.paymentId) || typeof value.signature !== "string" || !/^[a-f0-9]{64}$/i.test(value.signature))) return null;
  return value;
}
export class TestConnectionChanged extends Error { readonly code = "connection_changed"; }
function connectionChanged(error: unknown) {
  return error instanceof TestConnectionChanged || (object(error) && error.code === "P0001" && error.details === "connection_changed");
}
export function safeTestDto(value: unknown, configuredKey: string) {
  if (!object(value) || typeof value.state !== "string" || !["creating", "ready", "verified", "paid", "failed", "cancelled", "unknown", "review", "not_created"].includes(value.state)) throw new Error("Invalid test response");
  if (value.state === "not_created") return { state: value.state };
  if (typeof value.reference !== "string" || !value.reference.startsWith("TST-") || !uuid.test(value.reference.slice(4)) || !Number.isSafeInteger(value.totalPaise) || Number(value.totalPaise) <= 0 || (value.mode !== "cart" && value.mode !== "buy-now") || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50) throw new Error("Invalid test response");
  const seen = new Set<string>();
  const items = value.items.map(item => {
    if (!object(item) || typeof item.variantId !== "string" || !uuid.test(item.variantId) || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99 || seen.has(item.variantId.toLowerCase())) throw new Error("Invalid test item");
    seen.add(item.variantId.toLowerCase());
    return { variantId: item.variantId, quantity: item.quantity };
  });
  if (value.providerOrderId !== undefined && (typeof value.providerOrderId !== "string" || !/^order_[a-zA-Z0-9]{1,100}$/.test(value.providerOrderId))) throw new Error("Invalid provider order");
  if (value.key !== undefined && (value.state !== "ready" || typeof value.key !== "string" || !/^rzp_test_[a-zA-Z0-9]+$/.test(value.key))) throw new Error("Invalid test key");
  if (value.state === "ready" && (!value.providerOrderId || !value.key)) throw new Error("Incomplete ready response");
  if (value.state === "ready" && value.key !== configuredKey) throw new TestConnectionChanged();
  const result: Record<string, unknown> = { state: value.state, reference: value.reference, totalPaise: value.totalPaise, mode: value.mode, items };
  if (value.providerOrderId !== undefined) result.providerOrderId = value.providerOrderId;
  if (value.key !== undefined) result.key = value.key;
  return result;
}
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Provider = { createOrder: (environment: "test", input: { amount: number; currency: "INR"; receipt: string; subject: {type: "user"; id: string}; notes: Record<string, string> }) => Promise<{ data: unknown; error: unknown }>; verifyOrder: (environment: "test", input: { orderId: string; paymentId: string; signature: string }) => Promise<{ data: unknown; error: unknown }> };
export async function prepareTest(rpc: Rpc, provider: Provider, input: Record<string, unknown>, proof: string, key: string, subject: string) {
  const prepared = await rpc("razorpay_test_prepare", { p_request: input, p_proof: proof, p_key: key });
  if (!object(prepared)) throw new Error("Invalid prepare");
  safeTestDto(prepared, key);
  if (prepared.createProvider !== true) return safeTestDto(prepared, key);
  if (prepared.connectionKey !== key) throw new TestConnectionChanged();
  if (prepared.state !== "creating" || typeof prepared.receipt !== "string" || !/^PBRZ[0-9a-f]{32}$/i.test(prepared.receipt) || typeof prepared.nonce !== "string" || !uuid.test(prepared.nonce) || typeof prepared.attemptId !== "string" || !uuid.test(prepared.attemptId) || typeof prepared.requestKey !== "string" || prepared.requestKey !== input.idempotencyKey) throw new Error("Invalid claim");
  try {
    const result = await provider.createOrder("test", { amount: Number(prepared.totalPaise), currency: "INR", receipt: prepared.receipt, subject: { type: "user", id: subject }, notes: { pandabyte_attempt: prepared.attemptId, pandabyte_nonce: prepared.nonce, pandabyte_key_id: key } });
    if (object(result.data) && object(result.data.checkoutOptions) && typeof result.data.checkoutOptions.key === "string" && result.data.checkoutOptions.key !== key) {
      try { await rpc("razorpay_test_connection_error", { p_request_key: prepared.requestKey }); }
      finally { throw new TestConnectionChanged(); }
    }
    if (!result.error && object(result.data) && object(result.data.order) && object(result.data.checkoutOptions)) {
      const order = result.data.order, options = result.data.checkoutOptions;
      if (order.environment === "test" && order.amount === prepared.totalPaise && typeof order.currency === "string" && order.currency.toUpperCase() === "INR" && order.receipt === prepared.receipt && order.subjectType === "user" && order.subjectId === subject && typeof order.orderId === "string" && /^order_[a-zA-Z0-9]{1,100}$/.test(order.orderId) && options.key === key && options.order_id === order.orderId && options.amount === order.amount && typeof options.currency === "string" && options.currency.toUpperCase() === "INR") {
        return safeTestDto(await rpc("razorpay_test_bind", { p_request_key: prepared.requestKey, p_provider_order_id: order.orderId, p_key: key }), key);
      }
    }
  } catch (error) { if (connectionChanged(error)) throw new TestConnectionChanged(); /* An unknown provider outcome must only be recovered, never retried. */ }
  try { return safeTestDto(await rpc("razorpay_test_recover", { p_request_key: prepared.requestKey, p_proof: proof, p_key: key }), key); }
  catch (error) { if (connectionChanged(error)) throw new TestConnectionChanged(); return safeTestDto({ ...prepared, state: "unknown" }, key); }
}
export async function verifyTest(rpc: Rpc, provider: Provider, input: Record<string, unknown>, key: string) {
  const resolved = await rpc("razorpay_test_resolve", { p_provider_order_id: input.orderId });
  if (!object(resolved) || resolved.requestKey !== input.requestKey) throw new Error("Order ownership mismatch");
  if (resolved.connectionKey !== key) throw new TestConnectionChanged();
  const result = await provider.verifyOrder("test", { orderId: input.orderId as string, paymentId: input.paymentId as string, signature: input.signature as string });
  if (result.error) throw new Error("Verification failed");
  return safeTestDto(await rpc("razorpay_test_mark_verified", { p_request_key: input.requestKey, p_payment_id: input.paymentId }), key);
}
