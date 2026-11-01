import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_ATTEMPT_KEY, AUTH_ATTEMPT_TTL_MS, AUTH_FLASH_KEY, authCompletionHref, consumeAuthAttempt, consumeAuthFlash } from "../lib/auth/completion.ts";

function storage(key, value) {
  const data = new Map([[key, value]]);
  return { getItem: (name) => data.get(name) ?? null, removeItem: (name) => data.delete(name) };
}

test("completion preserves the encoded return without interpreting it", () => {
  assert.equal(authCompletionHref("/shop?category=kit#details"), "/auth/complete?return_to=%2Fshop%3Fcategory%3Dkit%23details");
});

test("attempt matches destination, expires, and is consumed once", () => {
  const now = 2_000_000_000_000;
  const attempt = (createdAt, returnPath = "/account") => JSON.stringify({ createdAt, returnPath });
  const current = storage(AUTH_ATTEMPT_KEY, attempt(now - AUTH_ATTEMPT_TTL_MS));
  assert.equal(consumeAuthAttempt(current, "/account", now), true);
  assert.equal(consumeAuthAttempt(current, "/account", now), false);
  for (const value of ["bad", attempt(now + 1), attempt(now - AUTH_ATTEMPT_TTL_MS - 1), attempt(now, "/checkout")]) {
    assert.equal(consumeAuthAttempt(storage(AUTH_ATTEMPT_KEY, value), "/account", now), false);
  }
});

test("flash is bound to the active session and user, expires, and is consumed once", () => {
  const now = 2_000_000_000_000;
  const flash = JSON.stringify({ sessionId: "sess_a", userId: "user_a", createdAt: now });
  const current = storage(AUTH_FLASH_KEY, flash);
  assert.equal(consumeAuthFlash(current, "sess_a", "user_a", now), true);
  assert.equal(consumeAuthFlash(current, "sess_a", "user_a", now), false);
  assert.equal(consumeAuthFlash(storage(AUTH_FLASH_KEY, flash), "sess_b", "user_a", now), false);
  assert.equal(consumeAuthFlash(storage(AUTH_FLASH_KEY, flash), "sess_a", "user_b", now), false);
  assert.equal(consumeAuthFlash(storage(AUTH_FLASH_KEY, flash), "sess_a", "user_a", now + AUTH_ATTEMPT_TTL_MS + 1), false);
  assert.equal(consumeAuthFlash(storage(AUTH_FLASH_KEY, "not json"), "sess_a", "user_a", now), false);
});
