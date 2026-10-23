import assert from "node:assert/strict";
import test from "node:test";
import { foundationPages } from "../lib/site-navigation.ts";

const origin = "http://localhost:3000";

async function page(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000) });
  return { response, html: await response.text() };
}

test("public route shell has one header/footer, a skip target and local navigation", async () => {
  for (const route of ["/", "/about", "/shop?category=kit", "/policies", "/sign-in"]) {
    const { response, html } = await page(route);
    assert.equal(response.status, 200, route);
    assert.equal((html.match(/<header\b/g) ?? []).length, 1, route);
    assert.equal((html.match(/<footer\b/g) ?? []).length, 1, route);
    assert.match(html, /id="main"/);
    assert.match(html, /href="#main"/);
    assert.match(html, /Open Solutions menu/);
    assert.match(html, /pandabyte-theme/);
    assert(!html.includes("https://p.superdesign.dev/draft/"), route);
    assert(!html.includes("₹5,000"), route);
  }
});

test("public planned destinations render an honest foundation state", async () => {
  const routes = Object.keys(foundationPages).filter((route) => route !== "/agent");
  // Bound concurrency so a regression check does not overwhelm local development.
  for (let index = 0; index < routes.length; index += 4) {
    await Promise.all(routes.slice(index, index + 4).map(async (route) => {
      const { response, html } = await page(route);
      assert.equal(response.status, 200, route);
      assert.match(html, /not connected in this development build/, route);
    }));
  }
});

test("unknown routes render the not-found state with noindex, including streamed responses", async () => {
  const { response, html } = await page("/not-a-pandabyte-route");
  // Next.js retains 200 once the layout has streamed; the not-found UI and noindex remain required.
  assert([200, 404].includes(response.status));
  if (response.status === 200) assert.match(html, /data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"/);
  assert.match(html, /Page not found/);
  assert.match(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i);
  assert(!html.includes("This section is being prepared."));
});
