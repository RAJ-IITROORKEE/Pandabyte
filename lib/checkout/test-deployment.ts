type Environment = Record<string, string | undefined>;

export function hostedStorefrontTestEnabled(request: Request, env: Environment): boolean {
  const target = new URL(request.url);
  return env.NODE_ENV === "production" && env.VERCEL_ENV === "production"
    && env.PANDABYTE_HOSTED_TEST_ENABLED === "true"
    && env.PANDABYTE_STOREFRONT_TEST_ENABLED === "true"
    && env.PANDABYTE_RAZORPAY_TEST_ENABLED === "true"
    && target.origin === "https://pandabyte-iot.vercel.app"
    && typeof env.RAZORPAY_CHECKOUT_TEST_KEY === "string" && env.RAZORPAY_CHECKOUT_TEST_KEY.length >= 32
    && /^rzp_test_[A-Za-z0-9]{1,100}$/.test(env.RAZORPAY_TEST_KEY_ID ?? "");
}

export function localRazorpayTestEnabled(request: Request, env: Environment): boolean {
  return env.NODE_ENV === "development" && env.PANDABYTE_RAZORPAY_TEST_ENABLED === "true"
    && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
    && !!env.RAZORPAY_CHECKOUT_TEST_KEY && /^rzp_test_[A-Za-z0-9]{1,100}$/.test(env.RAZORPAY_TEST_KEY_ID ?? "");
}
