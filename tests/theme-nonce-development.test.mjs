import assert from "node:assert/strict";
import test from "node:test";

test("the pre-paint theme script uses the trusted request nonce during hydration", async () => {
  const seen = new Set();
  for (let i = 0; i < 2; i++) {
    const response = await fetch("http://localhost:3001/", {
      headers: { "x-nonce": "attacker-nonce", "content-security-policy": "script-src 'nonce-attacker-nonce'" },
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    const policy = response.headers.get("content-security-policy");
    const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
    assert.match(nonce ?? "", /^[A-Za-z0-9+/]{22}==$/);
    assert(!seen.has(nonce));
    seen.add(nonce);
    assert(!html.includes("attacker-nonce"));
    const queued = html.match(/<script\b([^>]*)>\(self\.__next_s=self\.__next_s\|\|\[\]\)\.push\(\[0,(\{[^<]*?\})\]\)<\/script>/);
    assert(queued, "theme bootstrap queue must be present");
    assert(queued[1].includes(`nonce="${nonce}"`));
    const script = JSON.parse(queued[2]);
    assert.equal(script.id, "pandabyte-theme");
    assert.equal(script.nonce, nonce);
  }
});
