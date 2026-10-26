import assert from "node:assert/strict";
import test from "node:test";
import { foundationPages } from "../lib/site-navigation.ts";

const origin = process.env.PANDABYTE_TEST_ORIGIN ?? "http://localhost:3000";

async function page(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000) });
  return { response, html: await response.text() };
}

test("public route shell has one header/footer, a skip target and local navigation", async () => {
  for (const route of ["/", "/about", "/shop?category=kit", "/policies", "/sign-in"]) {
    const { response, html } = await page(route);
    assert.equal(response.status, 200, route);
    // Streaming may contain both fallback and resolved shell HTML. The browser
    // replaces the fallback; rendered landmark counts are checked in the browser.
    assert([1,2].includes((html.match(/<header\b[^>]*class="pb-site-header"/g) ?? []).length), route);
    assert([1,2].includes((html.match(/<footer\b[^>]*class="pb-site-footer"/g) ?? []).length), route);
    assert.match(html, /id="main"/);
    assert.match(html, /href="#main"/);
    for (const label of ["Products", "Solutions", "Company"]) assert.match(html, new RegExp(`class="pb-nav-trigger"[^>]*>${label}<`));
    assert.match(html, />Shop<\/a>/);
    assert.match(html, /pandabyte-theme/);
    assert(!html.includes("https://p.superdesign.dev/draft/"), route);
    assert(!html.includes("₹5,000"), route);
  }
});

test("public navigation destinations render without exposing private application states", async () => {
  const routes = Object.keys(foundationPages).filter((route) => route !== "/agent");
  // Bound concurrency so a regression check does not overwhelm local development.
  for (let index = 0; index < routes.length; index += 4) {
    await Promise.all(routes.slice(index, index + 4).map(async (route) => {
      const { response, html } = await page(route);
      assert.equal(response.status, 200, route);
      assert.match(html, /id="main"/, route);
      assert(!html.includes("NEXT_HTTP_ERROR_FALLBACK;404"), route);
      assert(!html.includes("Your session is active, but"), route);
      assert(!html.includes("₹5,000"), route);
    }));
  }
});

test("unknown routes render the not-found state with noindex, including streamed responses", async () => {
  const { response, html } = await page("/not-a-pandabyte-route");
  // Next.js retains 200 once the layout has streamed; the not-found UI and noindex remain required.
  assert([200, 404].includes(response.status));
  if (response.status === 200) assert.match(html, /NEXT_HTTP_ERROR_FALLBACK;404/);
  assert.match(html, /Page not found/);
  assert.match(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i);
  assert(!html.includes("This section is being prepared."));
});
