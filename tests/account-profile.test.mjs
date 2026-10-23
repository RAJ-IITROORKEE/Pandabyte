import assert from "node:assert/strict";
import test from "node:test";
import {
  isJsonContentType,
  isSameOrigin,
  parseDisplayNamePatch,
  parseProfilePatch,
  readProfilePatchBody,
} from "../lib/account/profile.ts";

test("display name patches accept only the trimmed displayName field up to 120 Unicode characters", () => {
  assert.deepEqual(parseDisplayNamePatch({ displayName: "  Raj  " }), { displayName: "Raj" });
  assert.deepEqual(parseDisplayNamePatch({ displayName: "😀".repeat(120) }), {
    displayName: "😀".repeat(120),
  });
  assert.equal(parseDisplayNamePatch({ displayName: "x".repeat(121) }), null);
  assert.equal(parseDisplayNamePatch({ displayName: "Raj", userId: "other" }), null);
  assert.equal(parseDisplayNamePatch({ displayName: 42 }), null);
  assert.equal(parseDisplayNamePatch([]), null);
});

test("profile patches accept displayName and optional unverified contact phone only", () => {
  assert.deepEqual(parseProfilePatch({ phone: "  +91 98765 43210  " }), { phone: "+91 98765 43210" });
  assert.deepEqual(parseProfilePatch({ displayName: "  Raj  ", phone: "  " }), {
    displayName: "Raj",
    phone: "",
  });
  assert.deepEqual(parseProfilePatch({ displayName: "Ada" }), { displayName: "Ada" });
  assert.equal(parseProfilePatch({}), null);
  assert.equal(parseProfilePatch({ phone: "x".repeat(49) }), null);
  assert.equal(parseProfilePatch({ phone: "123\n456" }), null);
  assert.equal(parseProfilePatch({ phone: 9876543210 }), null);
  assert.equal(parseProfilePatch({ phone: "123", phoneVerified: true }), null);
  assert.equal(parseProfilePatch({ userId: "another-user", phone: "123" }), null);
});

test("mutation headers require JSON and an exact same origin", () => {
  assert.equal(isJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(isJsonContentType("text/plain"), false);
  assert.equal(isSameOrigin("https://shop.example/account", "https://shop.example"), true);
  assert.equal(isSameOrigin("https://shop.example/account", "https://evil.example"), false);
  assert.equal(isSameOrigin("https://shop.example/account", null), false);
});

test("profile request bodies enforce 1 KiB from streamed bytes regardless of Content-Length", async () => {
  const underLimit = await readProfilePatchBody(new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify({ displayName: "Ada" }),
  }));
  assert.deepEqual(underLimit, { ok: true, value: { displayName: "Ada" } });

  const oversized = await readProfilePatchBody(new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Length": "1" },
    body: JSON.stringify({ displayName: "x".repeat(1100) }),
  }));
  assert.deepEqual(oversized, { ok: false, status: 413 });
});
