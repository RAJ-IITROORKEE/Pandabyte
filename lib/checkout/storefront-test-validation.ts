import { parseSimulationRequest } from "./validation.ts";
import { hostedStorefrontTestEnabled, localRazorpayTestEnabled } from "./test-deployment.ts";

export function parseStorefrontTestRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { expectedTestTotalPaise, testPolicyVersion, ...base } = value as Record<string, unknown>;
  const parsed = parseSimulationRequest(base);
  if (!parsed || !Number.isSafeInteger(expectedTestTotalPaise) || Number(expectedTestTotalPaise) < 100 || Number(expectedTestTotalPaise) > 59_010_000 || testPolicyVersion !== "local-test-v1") return null;
  return { ...parsed, expectedTestTotalPaise: Number(expectedTestTotalPaise), testPolicyVersion };
}

export function storefrontTestEnabled(request: Request, env: Record<string, string | undefined>) {
  return hostedStorefrontTestEnabled(request, env) || (localRazorpayTestEnabled(request, env) && env.PANDABYTE_STOREFRONT_TEST_ENABLED === "true"
    && typeof env.RAZORPAY_CHECKOUT_TEST_KEY === "string" && env.RAZORPAY_CHECKOUT_TEST_KEY.length >= 32
    && /^rzp_test_[A-Za-z0-9]{1,100}$/.test(env.RAZORPAY_TEST_KEY_ID ?? ""));
}
