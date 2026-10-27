import assert from "node:assert/strict";
import test from "node:test";
import { aboutSections } from "../components/editorial/about-sections.ts";

test("About sections preserve every block and keep subheadings with their parent", () => {
  const blocks = [
    { type: "paragraph", text: "Introduction" },
    { type: "heading", level: 2, text: "Mission" },
    { type: "paragraph", text: "Mission text" },
    { type: "heading", level: 3, text: "Our approach" },
    { type: "bulletList", items: ["Build", "Learn"] },
    { type: "heading", level: 1, text: "Vision" },
    { type: "paragraph", text: "Vision text" },
    { type: "heading", level: 2, text: "Values" },
  ];
  const before = structuredClone(blocks);
  const sections = aboutSections(blocks);
  assert.deepEqual(sections.map(section => section.length), [1, 4, 2, 1]);
  assert.deepEqual(sections.flat(), blocks);
  assert.deepEqual(blocks, before);
  assert.deepEqual(aboutSections([]), []);
  assert.deepEqual(aboutSections([blocks[3]]), [[blocks[3]]]);
});
