import assert from "node:assert/strict";
import test from "node:test";
import { publicMetadata } from "../lib/editorial/seo.ts";

test("unpublished public pages have distinct descriptive document titles", () => {
  const pages = [
    ["/about", "About"], ["/contact", "Contact"], ["/help", "Help Center"],
    ["/policies", "Policies"], ["/solutions", "Solutions"], ["/learn", "Learn"],
  ];
  for (const [path, title] of pages) {
    for (const document of [null, undefined, { title: "", seoTitle: "" }]) {
      assert.equal(publicMetadata(document, path).title, `${title} | PandaByte.in`);
    }
  }
});

test("authored metadata keeps priority over route defaults", () => {
  const document = { title: "Published page", summary: "Published summary", seoTitle: "Authored SEO title", seoDescription: "Authored description" };
  assert.equal(publicMetadata(document, "/about").title, "Authored SEO title");
  assert.equal(publicMetadata(document, "/about").description, "Authored description");
  assert.equal(publicMetadata({ ...document, seoTitle: "", seoDescription: "" }, "/about").title, "Published page");
  assert.equal(publicMetadata({ ...document, seoDescription: "" }, "/about").description, "Published summary");
});

test("fallback titles preserve canonical URLs, development robots and unknown routes", () => {
  for (const path of ["/about", "/unrecognized", "/account", "/admin", "/learn/resources/unpublished", "/toString"]) {
    const metadata = publicMetadata(null, path);
    assert.deepEqual(metadata.alternates, { canonical: `https://www.pandabyte.in${path}` });
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(metadata.description, "PandaByte IoT and embedded hardware.");
    if (path !== "/about") assert.equal(metadata.title, "PandaByte.in");
  }
});
