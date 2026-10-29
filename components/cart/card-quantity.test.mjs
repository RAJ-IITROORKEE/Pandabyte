import assert from "node:assert/strict";
import test from "node:test";
import { cardQuantityValue } from "./card-quantity.ts";

test("card quantity accepts digits only and leaves bounds to the cart", () => {
  assert.equal(cardQuantityValue("12"), 12);
  for (const value of ["", "1.5", "1e2", "-1", " 2"]) assert.ok(Number.isNaN(cardQuantityValue(value)));
});
