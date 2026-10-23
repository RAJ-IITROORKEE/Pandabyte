import assert from "node:assert/strict";
import test from "node:test";
import { aboutLinks, footerGroups, foundationPages, hardwareLinks, learnLinks, upcomingLinks } from "../lib/site-navigation.ts";

test("navigation stays on approved local destinations and excludes private tools", () => {
  const links = [...aboutLinks, ...hardwareLinks, ...learnLinks, ...upcomingLinks, ...footerGroups.flatMap((group) => group.links)];
  for (const { href } of links) {
    assert(href.startsWith("/") && !href.startsWith("//"), href);
    const url = new URL(href, "https://pandabyte.in");
    assert.equal(url.origin, "https://pandabyte.in");
    assert(Object.hasOwn(foundationPages, url.pathname), href);
    assert(!/^\/(admin|staff)(\/|$)/.test(url.pathname), href);
    for (const key of url.searchParams.keys()) assert.equal(key, "category");
  }
});
