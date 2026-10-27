import assert from "node:assert/strict";
import test from "node:test";
import { helpPageHref, helpTopic } from "../components/storefront/help-filters.ts";

test("Help pagination preserves search and topic", () => {
  assert.equal(helpPageHref("board & sensor", 2), "/help?q=board+%26+sensor&page=2");
  assert.equal(helpPageHref("board", 2, "IoT kits"), "/help?q=board&topic=IoT+kits&page=2");
  assert.equal(helpPageHref("", 1), "/help");
});

test("Help topic accepts bounded text and ignores invalid input", () => {
  assert.equal(helpTopic("  Hardware  "), "Hardware");
  assert.equal(helpTopic("x".repeat(121)), "");
  assert.equal(helpTopic("bad\nvalue"), "");
  assert.equal(helpTopic(["Hardware"]), "");
});
