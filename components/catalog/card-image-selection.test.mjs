import { test } from "node:test";
import assert from "node:assert/strict";
import { cardImageIds } from "./card-image-selection.ts";

test("selects reviewed front and rear in order, only if still published", () => {
  const product = "833b6026-d946-4379-a070-a07ca17f3cbc";
  const front = "228f9e39-dace-4321-8d79-1f6f4d02deff";
  const rear = "9c9e9480-315f-4cdd-8d6a-30355c9b0529";
  assert.deepEqual(cardImageIds(product, ["other", rear, front]), [front, rear]);
  assert.deepEqual(cardImageIds(product, ["other", rear]), [rear]);
  assert.deepEqual(cardImageIds(product, ["other"]), ["other"]);
  assert.deepEqual(cardImageIds("unmapped", ["other", front]), ["other", front]);
  assert.deepEqual(cardImageIds(product, []), []);
});

test("uses a reviewed single view without adding unrelated published images", () => {
  const product = "43dd32fe-f280-4f01-b580-2c4ba744fd3b";
  const front = "38e5bf5c-f08d-4c96-93fe-ba35a5ae1622";
  assert.deepEqual(cardImageIds(product, ["other", front]), [front]);
  assert.deepEqual(cardImageIds(product, ["other"]), ["other"]);
});
