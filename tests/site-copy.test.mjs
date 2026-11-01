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
  assert.equal(items.find((item) => item.name === "WhatsApp").url, "https://www.whatsapp.com/channel/0029VaIceRtInlqNQBoRTC0J");
  assert.equal(items.some((item) => item.name === "Website"), false);
  assert.deepEqual(extra, [{ label: "Community", url: "https://example.com/community" }]);
});

test("social links replace old website and WhatsApp entries with the approved channel", () => {
  const { items, extra } = resolveSocialLinks([
    { label: " Website ", url: "https://www.pandabyte.in" },
    { label: "Web site", url: "https://example.com" },
    { label: "WhatsApp", url: "javascript:alert(1)" },
    { label: "Old channel", url: "https://www.whatsapp.com/channel/old" },
    { label: "X", url: "https://x.com/pandabyte" },
    { label: "Documentation", url: "https://docs.example.com" },
  ]);
  assert.deepEqual(items[0], { name: "WhatsApp", url: "https://www.whatsapp.com/channel/0029VaIceRtInlqNQBoRTC0J" });
  assert.equal(items.filter((item) => item.name === "WhatsApp").length, 1);
  assert.equal(items.find((item) => item.name === "X (Twitter)").url, "https://x.com/pandabyte");
  assert.deepEqual(extra, [{ label: "Documentation", url: "https://docs.example.com" }]);
});
