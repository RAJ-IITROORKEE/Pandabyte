import assert from "node:assert/strict";
import test from "node:test";
import { getSiteCopy, resolveSocialLinks } from "../lib/site-copy.ts";

const defaults = {
  supportTitle: "Engineering Support",
  supportText: "Contact PandaByte for IoT development, setup, and troubleshooting support.",
  footerTagline: "IoT hardware, learning resources and software for connected ideas.",
  copyrightName: "PandaByte Innovations Pvt Ltd",
};

test("site copy falls back for missing and blank fields independently", () => {
  assert.deepEqual(getSiteCopy(), defaults);
  assert.deepEqual(getSiteCopy({ supportTitle: "  ", footerTagline: "" }), defaults);
  assert.deepEqual(getSiteCopy({ supportTitle: "Custom support" }), { ...defaults, supportTitle: "Custom support" });
});

test("site copy trims custom text and preserves markup as inert text", () => {
  assert.deepEqual(getSiteCopy({ supportText: "  <script>alert(1)</script>  " }), {
    ...defaults,
    supportText: "<script>alert(1)</script>",
  });
});


test("social links retain published destinations and identify placeholders", () => {
  const { items, extra } = resolveSocialLinks([
    { label: "Our photos", url: "https://instagram.com/pandabyte" },
    { label: "Community", url: "https://example.com/community" },
  ], "hello@example.com");
  assert.equal(items.find((item) => item.name === "Instagram").url, "https://instagram.com/pandabyte");
  assert.equal(items.find((item) => item.name === "Email").url, "mailto:hello@example.com");
  assert.equal(items.find((item) => item.name === "Website").url, "#");
  assert.deepEqual(extra, [{ label: "Community", url: "https://example.com/community" }]);
});
