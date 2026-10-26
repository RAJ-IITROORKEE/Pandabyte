import assert from "node:assert/strict";
import test from "node:test";
import { filterBlogPreview } from "../components/blog/preview.ts";

test("development preview filters categories and search together", () => {
  assert.equal(filterBlogPreview("", "").length, 3);
  assert.equal(filterBlogPreview("workbench", "Projects").length, 1);
  assert.equal(filterBlogPreview("workbench", "Guides").length, 0);
  assert.equal(filterBlogPreview("CIRCUITS", "").length, 1);
});
