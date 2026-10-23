import assert from "node:assert/strict";
import test from "node:test";

const origin = "http://localhost:3000";

async function request(path) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  await response.text();
  return response;
}

test("signed-out visitors can render public auth entry points", async () => {
  for (const path of ["/", "/sign-in", "/sign-up"]) {
    assert.equal((await request(path)).status, 200, path);
  }
});

test("account content requires a session", async () => {
  const response = await request("/account");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/sign-in?redirect_url=%2Faccount");
});

test("auth return paths reject external and duplicate redirect parameters", async () => {
  for (const route of ["sign-in", "sign-up"]) {
    for (const value of [
      "https%3A%2F%2Fexample.com",
      "%2F%2Fexample.com",
      "%2Faccount&redirect_url=https%3A%2F%2Fexample.com",
    ]) {
      const response = await request(`/${route}?redirect_url=${value}`);
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), `/${route}?redirect_url=%2Faccount`);
    }
    assert.equal((await request(`/${route}?redirect_url=%2Faccount`)).status, 200);
  }
});
