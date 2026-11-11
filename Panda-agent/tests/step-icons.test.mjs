import assert from "node:assert/strict";
import test from "node:test";
import { stepKind } from "../src/ui/agent/step-icons.ts";

test("stepKind", () => {
  const cases = {
    "Understanding your question": "understand",
    "Searching the web": "search_web",
    "Reading sources": "read",
    "Searching sources": "read",
    "Selecting evidence": "select",
    "Checking citations": "check",
    "Saving answer": "save",
    "Resolving product": "product",
    "Sending your question": "other",
  };
  for (const [label, kind] of Object.entries(cases)) assert.equal(stepKind(label), kind, label);
});
