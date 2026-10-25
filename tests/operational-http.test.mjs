import assert from "node:assert/strict";
import test from "node:test";

test("real API validation/auth responses keep their contracts without diagnostic references", async () => {
  for (const [path, status] of [
    ["/api/account/profile", 401], ["/api/account/addresses", 401], ["/api/account/files", 401],
    ["/api/cart", 401], ["/api/admin/roles", 401], ["/api/staff/access", 401],
    ["/api/catalog?sort=not-a-sort", 400], ["/api/media/not-an-id", 404],
  ]) {
    const response = await fetch(`http://localhost:3000${path}`, {
      headers: { "X-Error-Reference": "incoming-private-reference" }, redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("x-error-reference"), null, path);
    assert.match(response.headers.get("content-type"), /application\/json/, path);
    assert.match(response.headers.get("cache-control"), /no-store/, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
    const body = await response.json();
    assert(body.error, path);
    assert.equal(JSON.stringify(body).includes("incoming-private-reference"), false, path);
    assert.equal(Object.hasOwn(body, "reference"), false, path);
  }
});
