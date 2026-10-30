import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cartError, cartJson, checkoutOwnerError, readCheckoutBody } from "@/lib/checkout/http";
import { parseSimulationRequest } from "@/lib/checkout/validation";
import { parseStorefrontTestRequest, storefrontTestEnabled } from "./storefront-test-validation";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { parseTestRequest, prepareTest, safeTestDto, TestConnectionChanged, verifyTest } from "./razorpay-test-core";

export async function razorpayTestRoute(request: Request, action: "capabilities" | "prepare" | "recover" | "verify" | "cancel") {
  const proof = process.env.RAZORPAY_CHECKOUT_TEST_KEY;
  const key = process.env.RAZORPAY_TEST_KEY_ID;
  const enabled = process.env.NODE_ENV === "development" && process.env.PANDABYTE_RAZORPAY_TEST_ENABLED === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname) && !!proof && !!key && /^rzp_test_[a-zA-Z0-9]+$/.test(key);
  if (!enabled || !proof || !key) return action === "capabilities" ? cartJson({ razorpayTestAvailable: false }) : cartError("test_checkout_unavailable", 503);
  try {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return cartError("unauthorized", 401);
    if (action !== "capabilities") {
      const error = await checkoutOwnerError(request);
      if (error) return error;
    }
    const client = await createInsforgeServerClient();
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await client.database.schema("public").rpc(name, args);
      if (result.error) throw result.error;
      return result.data as unknown;
    };
    if (action === "capabilities") {
      const data = await rpc("razorpay_test_capabilities", { p_proof: proof, p_key: key });
      if (!data || typeof data !== "object" || !("razorpayTestAvailable" in data) || data.razorpayTestAvailable !== true || !("fictionalShippingPaise" in data) || !("fictionalTaxPaise" in data) || !Number.isSafeInteger(data.fictionalShippingPaise) || !Number.isSafeInteger(data.fictionalTaxPaise)) return cartJson({ razorpayTestAvailable: false });
      return cartJson({ razorpayTestAvailable: true, fictionalShippingPaise: data.fictionalShippingPaise, fictionalTaxPaise: data.fictionalTaxPaise });
    }
    const body = await readCheckoutBody(request);
    if (body instanceof Response) return body;
    if (action === "prepare") {
      const storefront = storefrontTestEnabled(request, process.env);
      const input = storefront ? parseStorefrontTestRequest(body.value) : parseSimulationRequest(body.value);
      const prepareRpc = storefront ? (name: string, args: Record<string, unknown>) => rpc(name === "razorpay_test_prepare" ? "razorpay_storefront_test_prepare" : name, args) : rpc;
      return input ? cartJson(await prepareTest(prepareRpc, client.payments.razorpay, input, proof, key, session.userId)) : cartError("invalid_input", 400);
    }
    const input = parseTestRequest(body.value, action === "verify");
    if (!input) return cartError("invalid_input", 400);
    if (action === "verify") return cartJson(await verifyTest(rpc, client.payments.razorpay, input, key));
    return cartJson(safeTestDto(await rpc(action === "recover" ? "razorpay_test_recover" : "razorpay_test_cancel", action === "recover" ? { p_request_key: input.requestKey, p_proof: proof, p_key: key } : { p_request_key: input.requestKey }), key));
  } catch (error) {
    if (error instanceof TestConnectionChanged) return cartError("connection_changed", 409);
    const mapped: Record<string, [string, number]> = { unauthenticated: ["unauthorized", 401], forbidden: ["forbidden", 403], invalid_input: ["invalid_input", 400], not_found: ["not_found", 404], version_conflict: ["conflict", 409], price_changed: ["price_changed", 409], invalid_transition: ["invalid_transition", 409], item_unavailable: ["item_unavailable", 409], idempotency_conflict: ["idempotency_conflict", 409], attempt_closed: ["attempt_closed", 409], recovery_limit: ["recovery_limit", 409], attempt_pending: ["attempt_pending", 409], connection_changed: ["connection_changed", 409] };
    if (error && typeof error === "object" && "code" in error && error.code === "P0001" && "details" in error && typeof error.details === "string" && mapped[error.details]) {
      const [code, status] = mapped[error.details];
      return cartError(code, status);
    }
    return cartError("backend_unavailable", 503);
  }
}
