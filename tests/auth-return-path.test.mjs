import assert from "node:assert/strict";
import test from "node:test";
import {
  authEntryHref,
  hasAlternateRedirectParam,
  safeAuthReturnPath,
} from "../lib/auth/return-path.ts";
import { foundationPages } from "../lib/site-navigation.ts";

const publicPaths = Object.keys(foundationPages);

test("return paths allow registered public routes and explicit protected destinations", () => {
  assert.equal(safeAuthReturnPath("/", publicPaths), "/");
  assert.equal(safeAuthReturnPath("/panda-agent", publicPaths), "/panda-agent");
  assert.equal(safeAuthReturnPath("/panda-agent/untrusted", publicPaths), null);
  assert.equal(safeAuthReturnPath("/shop?category=kit", publicPaths), "/shop?category=kit");
  assert.equal(safeAuthReturnPath("/shop?q=ESP32%20kit", publicPaths), "/shop?q=ESP32%20kit");
  assert.equal(safeAuthReturnPath("/products/pandapulse?variant=one#details", publicPaths), "/products/pandapulse?variant=one#details");
  assert.equal(safeAuthReturnPath("/blog/phase3-update", publicPaths), "/blog/phase3-update");
  assert.equal(safeAuthReturnPath("/solutions/skills-cli?tab=tools", publicPaths), "/solutions/skills-cli?tab=tools");
  assert.equal(safeAuthReturnPath("/learn/resources/embedded-guide", publicPaths), "/learn/resources/embedded-guide");
  assert.equal(safeAuthReturnPath("/learn/youtube/pandas-build", publicPaths), "/learn/youtube/pandas-build");
  assert.equal(safeAuthReturnPath("/shop/iot-kits", publicPaths), "/shop/iot-kits");
  assert.equal(safeAuthReturnPath(`/solutions/${"a".repeat(161)}`, publicPaths), null);
  assert.equal(safeAuthReturnPath("/account", publicPaths), "/account");
  assert.equal(safeAuthReturnPath("/account/settings/addresses", publicPaths), "/account/settings/addresses");
  assert.equal(safeAuthReturnPath("/account/settings/security", publicPaths), "/account/settings/security");
  assert.equal(safeAuthReturnPath("/admin/products", publicPaths), "/admin/products");
  assert.equal(safeAuthReturnPath("/staff", publicPaths), "/staff");
  assert.equal(safeAuthReturnPath("/checkout", publicPaths), "/checkout");
  assert.equal(safeAuthReturnPath("/agent", publicPaths), "/agent");
});

test("return paths reject external, encoded, normalized, and unregistered destinations", () => {
  for (const value of [
    "https://example.com",
    "//example.com",
    "/\\\\example.com",
    "/%2f%2fevil.example",
    "/products/%2e%2e/admin",
    "/shop?next=%2F%2Fevil.example",
    "/shop?q=%252f",
    "/shop/../admin",
    "/shop//category",
    "/solutions/skills-cli/extra",
    "/learn/resources/embedded-guide/extra",
    "/learn/youtube/pandas-build/extra",
    "/shop/iot-kits/extra",
    "/shop/category/iot-kits",
    "/solutions/-invalid",
    "/unregistered-route",
    " /shop",
    "/" + "a".repeat(2048),
    ["/shop", "/admin"],
    null,
  ]) {
    assert.equal(safeAuthReturnPath(value, publicPaths), null, String(value));
  }
});

test("sign-in and sign-up links preserve only a validated redirect_url", () => {
  assert.equal(authEntryHref("sign-up", "/checkout", publicPaths), "/sign-up?redirect_url=%2Fcheckout");
  assert.equal(authEntryHref("sign-in", "/shop?category=kit", publicPaths), "/sign-in?redirect_url=%2Fshop%3Fcategory%3Dkit");
  assert.equal(authEntryHref("sign-in", "/learn/resources/embedded-guide", publicPaths), "/sign-in?redirect_url=%2Flearn%2Fresources%2Fembedded-guide");
  assert.equal(authEntryHref("sign-in", "https://example.com", publicPaths), "/sign-in?redirect_url=%2F");
  assert.equal(hasAlternateRedirectParam({ redirect_url: "/account" }), false);
  assert.equal(hasAlternateRedirectParam({ "__clerk_status": "verified" }), false);
  for (const key of ["redirect", "redirectUrl", "redirectTo", "return_to", "next", "callbackUrl"]) {
    assert.equal(hasAlternateRedirectParam({ [key]: "/account" }), true, key);
  }
});


test("order confirmation returns only to a valid test or simulation reference", () => {
  for (const prefix of ["TST", "SIM"]) {
    const path = `/checkout/confirmation/${prefix}-00000000-0000-4000-8000-000000000001`;
    assert.equal(safeAuthReturnPath(path, publicPaths), path);
  }
  assert.equal(safeAuthReturnPath("/checkout/confirmation/TST-invalid", publicPaths), null);
  assert.equal(safeAuthReturnPath("/checkout/confirmation/TST-00000000-0000-4000-8000-000000000001/extra", publicPaths), null);
});
