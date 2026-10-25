import assert from "node:assert/strict";
import test from "node:test";
import { getSiteCopy } from "../lib/site-copy.ts";

const defaults = {
  supportTitle: "Engineering Support",
  supportText: "Contact PandaByte for IoT development, setup, and troubleshooting support.",
  footerTagline: "Ideas into embedded innovation.",
  copyrightName: "PandaByte",
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
