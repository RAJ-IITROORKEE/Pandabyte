import test from "node:test";
import assert from "node:assert/strict";
import { policies } from "../components/policies/policy-content.ts";

test("captured policy articles retain all source sections and paragraphs", () => {
  const expected = { "privacy-policy": [12, 18], "terms-and-conditions": [20, 23], "shipping-and-returns": [8, 18] };
  for (const [slug, [headingCount, paragraphCount]] of Object.entries(expected)) {
    const blocks = policies[slug].blocks;
    assert.equal(blocks.filter(block => block.type === "heading").length, headingCount);
    assert.equal(blocks.filter(block => block.type === "paragraph").length, paragraphCount);
  }
  const sections = policies["terms-and-conditions"].blocks.filter(block => block.type === "heading");
  assert.deepEqual(sections.map(block => Number(block.text.match(/^SECTION (\d+)/)?.[1])), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(policies["privacy-policy"].blocks.filter(block => block.type === "heading" && block.level === 3).length, 3);
});
