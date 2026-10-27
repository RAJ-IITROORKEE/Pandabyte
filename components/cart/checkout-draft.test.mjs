import test from "node:test";
import assert from "node:assert/strict";
import { readDraft, saveDraft, clearDraft } from "./checkout-draft.ts";

test("checkout draft remains memory-only and scoped to user and selection", () => {
  const draft = { email: "a@example.com" };
  saveDraft("user-a:null", draft);
  assert.equal(readDraft("user-a:null"), draft);
  assert.equal(readDraft("user-b:null"), null);
  assert.equal(readDraft("user-a:buy-now"), null);
  clearDraft();
  assert.equal(readDraft("user-a:null"), null);
});
