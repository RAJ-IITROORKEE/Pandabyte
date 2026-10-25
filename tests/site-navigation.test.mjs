import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { aboutLinks, CORE_NAVIGATION_HREFS, footerGroups, foundationPages, hardwareLinks, learnLinks, resolveSiteNavigation, upcomingLinks } from "../lib/site-navigation.ts";

test("navigation stays on approved local destinations and excludes private tools", () => {
  const links = [...aboutLinks, ...hardwareLinks, ...learnLinks, ...upcomingLinks, ...footerGroups.flatMap((group) => group.links), ...CORE_NAVIGATION_HREFS.header.map((href) => ({ href }))];
  for (const { href } of links) {
    assert(href.startsWith("/") && !href.startsWith("//"), href);
    const url = new URL(href, "https://pandabyte.in");
    assert.equal(url.origin, "https://pandabyte.in");
    assert(Object.hasOwn(foundationPages, url.pathname), href);
    assert(!/^\/(admin|staff)(\/|$)/.test(url.pathname), href);
    for (const key of url.searchParams.keys()) assert.equal(key, "category");
  }
});

test("published navigation overrides matching core links and preserves missing values", () => {
  const navigation = resolveSiteNavigation([
    { label: "Build", href: "/solutions", group: "header", position: 5, visible: true },
    { label: "Academy", href: "/learn", group: "header", position: 0, visible: true },
    { label: "Hidden", href: "/contact", group: "header", position: 3, visible: false },
    { label: "Journal", href: "/blog", group: "header", position: 10, visible: true },
    { label: "Hidden help", href: "/help", group: "header", position: 0, visible: false },
    { label: "Hidden kits", href: "/shop?category=iot-kits", group: "header", position: 0, visible: false },
    { label: "Talk to us", href: "/contact", group: "footer", position: 0, visible: true },
    { label: "Hidden company", href: "/about", group: "footer", position: 0, visible: false },
    { label: "Projects", href: "/projects", group: "header" },
  ]);

  assert.deepEqual(navigation.header.primary.map(({ href }) => href), ["/learn", "/about", "/solutions"]);
  assert.equal(navigation.header.primary[0].label, "Academy");
  assert.equal(navigation.header.primary[2].label, "Build");
  assert.deepEqual(navigation.header.learn.map(({ href }) => href), [
    "/learn/youtube", "/learn/product-specs", "/learn/embedded-systems", "/learn/kit-guides", "/blog",
  ]);
  assert(!navigation.header.hardwareHighlight.some(({ href }) => href === "/shop?category=iot-kits"));
  assert(!navigation.header.hardware.some(({ href }) => href === "/shop?category=iot-kits"));
  assert.equal(navigation.header.about[0].label, "About us");
  assert.equal(navigation.header.about.find(({ href }) => href === "/projects")?.label, "Projects");

  const learnFooter = navigation.footerGroups.find(({ title }) => title === "Learn & support");
  const companyFooter = navigation.footerGroups.find(({ title }) => title === "Company & policies");
  assert.equal(learnFooter?.links.find(({ href }) => href === "/contact")?.label, "Talk to us");
  assert(!companyFooter?.links.some(({ href }) => href === "/about"));
});

test("unknown visible links stay in About or Company & policies", () => {
  const navigation = resolveSiteNavigation([
    { label: "Support portal", href: "https://support.example", group: "header", position: 100, visible: true },
    { label: "Hidden header extra", href: "/extra-hidden", group: "header", position: 0, visible: false },
    { label: "Returns portal", href: "https://returns.example", group: "footer", position: 100, visible: true },
    { label: "Hidden footer extra", href: "/footer-hidden", group: "footer", position: 0, visible: false },
  ]);

  assert.equal(navigation.header.about.at(-1)?.href, "https://support.example");
  assert(!navigation.header.about.some(({ href }) => href === "/extra-hidden"));
  const companyFooter = navigation.footerGroups.find(({ title }) => title === "Company & policies");
  assert.equal(companyFooter?.links.at(-1)?.href, "https://returns.example");
  assert(!companyFooter?.links.some(({ href }) => href === "/footer-hidden"));
});

test("duplicate matching rows use the first row and position ties preserve defaults", () => {
  const navigation = resolveSiteNavigation([
    { label: "Projects first", href: "/projects", group: "header", position: 0, visible: true },
    { label: "Projects duplicate", href: "/projects", group: "header", position: 0, visible: false },
    { label: "Company", href: "/about", group: "header", position: 0, visible: true },
  ]);

  assert.deepEqual(navigation.header.about.slice(0, 2).map(({ label }) => label), ["Company", "Projects first"]);
  assert(navigation.header.about.some(({ href }) => href === "/projects"));
});

test("core href inventories expose unique rows for safe hidden-link projection", () => {
  assert.equal(new Set(CORE_NAVIGATION_HREFS.header).size, CORE_NAVIGATION_HREFS.header.length);
  assert.equal(new Set(CORE_NAVIGATION_HREFS.footer).size, CORE_NAVIGATION_HREFS.footer.length);
  assert(CORE_NAVIGATION_HREFS.header.includes("/solutions"));
  assert(CORE_NAVIGATION_HREFS.footer.includes("/policies#privacy"));
});

test("database hidden-core allowlist matches frontend defaults", () => {
  const sql = readFileSync(new URL("../migrations/20261025233325_editable-site-copy.sql", import.meta.url), "utf8");
  for (const group of ["header", "footer"]) {
    const match = sql.match(new RegExp(`link->>'group' = '${group}' AND link->>'href' = ANY\\(ARRAY\\[(.*?)\\]::text\\[\\]\\)`));
    assert(match, group);
    const hrefs = [...match[1].matchAll(/'([^']+)'/g)].map((row) => row[1]);
    assert.deepEqual(hrefs, CORE_NAVIGATION_HREFS[group]);
  }
});
