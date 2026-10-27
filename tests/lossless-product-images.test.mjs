import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceReviewedImages, shouldMigrateUntracked } from "../scripts/lossless-product-images.mjs";

test("only selected gallery references are replaced while private fields and other media survive", () => {
  const input = { mediaIds: ["front", "diagram", "back"], blocks: [
    { type: "image", mediaId: "front", alt: "Front" }, { type: "image", mediaId: "diagram", alt: "Diagram" },
    { type: "image", mediaId: "back", alt: "Back" }, { type: "paragraph", text: "Original copy" },
  ], model3d: { mediaId: "model", posterId: "poster" }, sourceReview: ["Staff note"], variants: [{ sku: "sku", id: "variant" }] };
  const mapping = new Map([["front", "new-front"], ["back", "new-back"], ["diagram", "not-selected"]]);
  const actual = replaceReviewedImages(input, ["front", "back"], mapping);
  assert.deepEqual(actual.mediaIds, ["new-front", "diagram", "new-back"]);
  assert.deepEqual(actual.blocks.map(block => block.mediaId), ["new-front", "diagram", "new-back", undefined]);
  assert.deepEqual(actual.model3d, input.model3d);
  assert.deepEqual(actual.sourceReview, input.sourceReview);
  assert.deepEqual(actual.variants, input.variants);
  assert.deepEqual(input.mediaIds, ["front", "diagram", "back"]);
});

test("missing mappings and selected media used outside galleries fail closed", () => {
  assert.throws(() => replaceReviewedImages({ mediaIds: ["front"], blocks: [] }, ["front"], new Map()), /reviewed_media_missing/);
  assert.throws(() => replaceReviewedImages({ mediaIds: ["front"], blocks: [], model3d: { posterId: "front" } }, ["front"], new Map([["front", "new-front"]])), /media_referenced_outside_gallery/);
});

test("skip unpublished drafts when selecting scope and stop on later draft changes", () => {
  assert.equal(shouldMigrateUntracked(true, false), true);
  assert.equal(shouldMigrateUntracked(false, false), false);
  assert.equal(shouldMigrateUntracked(true, true), true);
  assert.throws(() => shouldMigrateUntracked(false, true), /unpublished_product_changes/);
});
