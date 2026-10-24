import assert from "node:assert/strict";
import test from "node:test";

test("HTML and API responses apply the non-commerce browser security baseline", async () => {
  for (const route of ["/", "/sign-in", "/api/cart", "/api/admin/roles"]) {
    const response = await fetch(`http://localhost:3000${route}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    await response.text();
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", route);
    assert.equal(response.headers.get("x-frame-options"), "DENY", route);
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin", route);
    assert.equal(response.headers.get("content-security-policy"), "base-uri 'self'; object-src 'none'; frame-ancestors 'none'", route);
    assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=()", route);
    assert.equal(response.headers.get("x-powered-by"), null, route);
  }
});
