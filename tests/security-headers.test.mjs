import assert from "node:assert/strict";
import test from "node:test";

test("HTML and API responses apply the non-commerce browser security baseline", async () => {
  for (const route of ["/", "/sign-in", "/api/cart", "/api/admin/roles"]) {
    const response = await fetch(`http://localhost:3000${route}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    await response.text();
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", route);
    assert.equal(response.headers.get("x-frame-options"), "DENY", route);
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin", route);
    const policy = response.headers.get("content-security-policy");
    assert.match(policy, /base-uri 'self'/, route);
    assert.match(policy, /object-src 'none'/, route);
    assert.match(policy, /frame-ancestors 'none'/, route);
    assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=()", route);
    assert.equal(response.headers.get("x-powered-by"), null, route);
    if (route.startsWith("/api/")) {
      assert.equal(response.status, 401, route);
      const parsed = directives(policy);
      assert(parsed.get("script-src").includes("'strict-dynamic'"), route);
      assert.deepEqual(parsed.get("script-src-attr"), ["'none'"], route);
    }
  }
});

function directives(policy) {
  assert(policy && !policy.includes(","), "one effective CSP, not intersecting headers");
  const result = new Map();
  for (const directive of policy.split(";").map((value) => value.trim()).filter(Boolean)) {
    const [name, ...values] = directive.split(/\s+/);
    assert(!result.has(name), `duplicate ${name}`);
    result.set(name, values);
  }
  return result;
}

test("production documents use fresh trusted nonces on framework, theme and Clerk scripts", async () => {
  const nonces = new Set();
  for (const route of ["/", "/", "/sign-in", "/account", "/admin/users"]) {
    // Empty development handshake token lets Clerk render its genuine signed-out branch.
    const response = await fetch(`http://localhost:3000${route}?__clerk_db_jwt=`, {
      redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { "x-nonce": "attacker-nonce", "content-security-policy": "script-src 'nonce-attacker-nonce'" },
    });
    const html = await response.text();
    const policy = directives(response.headers.get("content-security-policy"));
    const scriptSources = policy.get("script-src");
    assert(scriptSources.includes("'strict-dynamic'"), route);
    assert(!scriptSources.includes("'unsafe-eval'") && !scriptSources.includes("http:") && !scriptSources.includes("https:"), route);
    const nonceSource = scriptSources.filter((value) => value.startsWith("'nonce-"));
    assert.equal(nonceSource.length, 1, route);
    const nonce = nonceSource[0].slice(7, -1);
    assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/, route);
    assert(!nonces.has(nonce), "nonce must change for every document response");
    nonces.add(nonce);
    assert.equal(html.includes("attacker-nonce"), false, route);
    assert.deepEqual(policy.get("script-src-attr"), ["'none'"], route);
    assert(policy.get("frame-src").includes("https://www.youtube-nocookie.com"), route);
    assert.equal(response.headers.get("content-security-policy-report-only"), null, route);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      assert.match(response.headers.get("location"), /sign-in/, route);
      continue;
    }
    assert.equal(response.status, 200, route);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1]);
    assert(scripts.length > 0, route);
    for (const attributes of scripts) assert(attributes.includes(`nonce="${nonce}"`), `untrusted script on ${route}`);
    assert(html.includes("pandabyte-theme"), route);
    assert(html.includes("clerk.browser.js"), route);
  }
});
