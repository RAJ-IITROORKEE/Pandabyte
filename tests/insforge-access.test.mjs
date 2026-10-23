import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createClient } from "@insforge/sdk";

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL;
assert.ok(baseUrl, "Provide the selected development backend URL in .env.local.");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const payload = [
  encode({ alg: "HS256", typ: "JWT" }),
  encode({
    sub: "user_untrusted_test_subject",
    role: "authenticated",
    aud: "insforge-api",
    exp: Math.floor(Date.now() / 1000) + 60,
  }),
].join(".");
const forgedToken = `${payload}.${createHmac("sha256", "deliberately-untrusted-test-key")
  .update(payload)
  .digest("base64url")}`;

for (const [label, accessToken] of [
  ["anonymous", undefined],
  ["malformed token", "not-a-valid-jwt"],
  ["forged authenticated claims", forgedToken],
]) {
  test(`identity RPC rejects ${label}`, async () => {
    const client = createClient({ baseUrl, accessToken });
    const { data, error, status } = await client.database
      .schema("public")
      .rpc("requesting_user_id");

    assert.equal(status, 401);
    assert.equal(data, null);
    assert.ok(error);
  });
}
