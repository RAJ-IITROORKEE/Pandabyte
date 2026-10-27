import assert from "node:assert/strict";
import test from "node:test";
import { faqGroups } from "./faq-groups.ts";

test("groups real FAQ topics in first occurrence order without dropping answers", () => {
  const items = ["Orders", " Support ", "Orders", ""].map((topic, id) => ({ id, document: { topic } }));
  const groups = faqGroups(items);
  assert.deepEqual([...groups.keys()], ["Orders", "Support", ""]);
  assert.deepEqual([...groups.values()].map(group => group.map(item => item.id)), [[0, 2], [1], [3]]);
  assert.equal(faqGroups([]).size, 0);
});
