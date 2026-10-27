import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceReviewedImages, reviewedPairsWithReplacements } from "../scripts/lossless-draft-safe.mjs";

test("independently replace images without publishing private draft changes", () => {
  const live = { slug: "live", mediaIds: ["old-image-a", "old-image-b"], blocks: [{type: "image", mediaId: "old-image-a"}] };
  const draft = { ...live, slug: "draft", model3d: { mediaId: "private", posterId: "poster" }, note: "unpublished" };
  const replacements = new Map([["old-image-a", "new-image-a"], ["old-image-b", "new-image-b"]]);
  const nextLive = replaceReviewedImages(live, ["old-image-a", "old-image-b"], replacements);
  const nextDraft = replaceReviewedImages(draft, ["old-image-a", "old-image-b"], replacements);
  assert.deepEqual(nextLive, { ...live, mediaIds: ["new-image-a", "new-image-b"], blocks: [{type: "image", mediaId: "new-image-a"}] });
  assert.deepEqual(nextDraft, { ...draft, mediaIds: ["new-image-a", "new-image-b"], blocks: [{type: "image", mediaId: "new-image-a"}] });
  assert.throws(() => replaceReviewedImages({...draft, model3d: {posterId: "old-image-a"}}, ["old-image-a", "old-image-b"], replacements), /media_referenced_outside_gallery/);
  assert.throws(() => replaceReviewedImages({...draft, blocks: [{type: "paragraph", text: "old-image-a"}]}, ["old-image-a", "old-image-b"], replacements), /media_referenced_outside_gallery/);
  assert.throws(() => replaceReviewedImages({...draft, mediaIds: ["old-image-a"]}, ["old-image-a", "old-image-b"], replacements), /reviewed_media_missing/);
});

test("reviewed mappings retain old and new IDs in gallery order", () => {
  assert.deepEqual(reviewedPairsWithReplacements([{productId: "p", ids: ["old-image-a", "old-image-b"]}], new Map([["old-image-a", "new-image-a"]])),
    [{productId: "p", ids: ["old-image-a", "new-image-a", "old-image-b"]}]);
});
