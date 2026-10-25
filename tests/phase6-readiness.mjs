import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

// A fixed localhost-only sequential probe, never a production load test.
const origin = "http://localhost:3000";
const pages = ["/", "/shop", "/about", "/contact", "/blog", "/learn", "/help", "/policies"];
const observations = [];
for (const path of pages) {
  for (let sample = 1; sample <= 2; sample++) {
    const started = performance.now();
    const response = await fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    const headersMs = performance.now() - started;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const html = new TextDecoder().decode(bytes);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/, path);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/, path);
    assert.match(response.headers.get("content-security-policy") ?? "", /script-src/, path);
    assert.match(html, /id="main"/, path);
    assert.match(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i, path);
    assert(!html.includes("NEXT_HTTP_ERROR_FALLBACK;404"), path);
    assert(!html.includes("Your session is active, but"), path);
    observations.push({ path, sample, status: response.status, headersMs: Math.round(headersMs), totalMs: Math.round(performance.now() - started), decodedBodyBytes: bytes.length });
  }
}
console.log(JSON.stringify({ scope: "16 sequential anonymous GETs; local production preview with current published content; no concurrency or Web Vitals claim", observations }, null, 2));
