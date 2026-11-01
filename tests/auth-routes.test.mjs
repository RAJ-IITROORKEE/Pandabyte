import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.PHASE2_APP_BASE_URL ?? "http://localhost:3000";

async function request(path) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  await response.text();
  return response;
}

test("signed-out visitors can render public auth entry points", async () => {
  for (const path of ["/", "/about", "/contact", "/shop", "/sign-in", "/sign-up"]) {
    assert.equal((await request(path)).status, 200, path);
  }
});

test("account content requires a session", async () => {
  const response = await request("/account");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/sign-in?redirect_url=%2Faccount");
});

test("completion requires a real session and rejects unsafe destinations", async () => {
  const response = await request("/auth/complete?return_to=%2Faccount");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/sign-in?redirect_url=%2Faccount");
  for (const query of ["return_to=https%3A%2F%2Fevil.example", "return_to=%2F%2Fevil.example", "return_to=%2Faccount&return_to=%2Fadmin"]) {
    const rejected = await request(`/auth/complete?${query}`);
    assert.equal(rejected.status, 307);
    assert.equal(rejected.headers.get("location"), "/");
  }
});

test("private settings preserve their exact intended destination", async () => {
  for (const path of ["/account/settings", "/account/settings/security"]) {
    const response = await request(path);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `/sign-in?redirect_url=${encodeURIComponent(path)}`);
  }
});

test("signed-out staff entry preserves the guarded staff destination", async () => {
  const response = await request("/staff");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/sign-in?redirect_url=%2Fstaff");
  assert.equal((await request("/sign-in?redirect_url=%2Fstaff")).status, 200);
});

test("signed-out admin entry preserves the guarded admin destination", async () => {
  for (const path of ["/admin", "/admin/users", "/admin/workspaces", "/admin/chat", "/admin/ai-chat", "/admin/notifications"]) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), "/admin-login", path);
  }
  assert.equal((await request("/admin-login")).status, 200);
});

test("checkout and Agent require an active session while public storefront routes stay open", async () => {
  for (const path of ["/checkout", "/agent", "/panda-agent"]) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `/sign-in?redirect_url=${encodeURIComponent(path)}`);
  }
});

test("auth return paths reject external and duplicate redirect parameters", async () => {
  for (const route of ["sign-in", "sign-up"]) {
    for (const value of [
      "https%3A%2F%2Fexample.com",
      "%2F%2Fexample.com",
      "%2Faccount&redirect_url=https%3A%2F%2Fexample.com",
      "%2F%252f%252fevil.example",
      "%2Fshop%2F..%2Fadmin",
    ]) {
      const response = await request(`/${route}?redirect_url=${value}`);
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), `/${route}?redirect_url=%2F`);
    }
    assert.equal((await request(`/${route}?redirect_url=%2Faccount`)).status, 200);
    assert.equal((await request(`/${route}?redirect_url=%2Fadmin`)).status, 200);
    assert.equal((await request(`/${route}?redirect_url=%2Fcheckout`)).status, 200);
    assert.equal((await request(`/${route}?redirect_url=%2Fagent`)).status, 200);
    assert.equal((await request(`/${route}?redirect_url=%2Fpanda-agent`)).status, 200);
    assert.equal((await request(`/${route}?redirect_url=%2Fshop%3Fcategory%3Dkit`)).status, 200);
    for (const key of ["redirect", "redirectTo", "return_to", "next", "callbackUrl"]) {
      const response = await request(`/${route}?${key}=%2F%2Fevil.example`);
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), `/${route}?redirect_url=%2F`);
    }
  }
});

test("account sections preserve their intended destination when signed out", async () => {
  for (const section of ["profile", "addresses", "favorites", "orders", "billing"]) {
    const path = `/account/${section}`;
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `/sign-in?redirect_url=${encodeURIComponent(path)}`);
  }
});
