import "server-only";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { cartError, cartJson, readCartBody } from "@/app/api/cart/http";
import { parseCartQuoteRequest } from "@/lib/cart/validation";
import { storefrontTestEnabled } from "./storefront-test-validation";

export async function storefrontTestCapabilities(request: Request): Promise<Response | null> {
  if (!storefrontTestEnabled(request, process.env)) return null;
  try {
    const client = createInsforgePublicClient();
    const { data, error } = await client.database.schema("public").rpc("storefront_test_policy", { p_proof: process.env.RAZORPAY_CHECKOUT_TEST_KEY, p_key: process.env.RAZORPAY_TEST_KEY_ID });
    if (error || !data || data.policyVersion !== "local-test-v1") return cartJson({ razorpayTestAvailable: false });
    return cartJson({ razorpayTestAvailable: true, fictionalShippingPaise: 0, fictionalTaxPaise: 0, storefrontTest: true });
  } catch { return cartJson({ razorpayTestAvailable: false }); }
}

export async function storefrontTestQuote(request: Request) {
  if (!storefrontTestEnabled(request, process.env)) return cartError("test_checkout_unavailable", 503);
  const body = await readCartBody(request);
  if (body instanceof Response) return body;
  const input = parseCartQuoteRequest(body.value);
  if (!input || input.items.length === 0) return cartError("invalid_cart", 400);
  try {
    const client = createInsforgePublicClient();
    const { data, error } = await client.database.schema("public").rpc("storefront_test_quote", { p_items: input.items, p_proof: process.env.RAZORPAY_CHECKOUT_TEST_KEY, p_key: process.env.RAZORPAY_TEST_KEY_ID });
    if (error || !data) return cartError(error?.code === "P0001" && ["invalid_input", "item_unavailable"].includes(error.details ?? "") ? "item_unavailable" : "test_checkout_unavailable", error?.code === "P0001" && error.details !== "forbidden" ? 409 : 503);
    return cartJson(data);
  } catch { return cartError("backend_unavailable", 503); }
}
