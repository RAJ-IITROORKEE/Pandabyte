import test from "node:test";
import assert from "node:assert/strict";
import { parseImagePublication } from "../lib/editorial/image-publication.ts";

const a = "1136d7b1-367d-4fd3-9338-09783a117cc4";
const b = "4d0f39e1-811f-4fad-aa92-c855bf6b1a11";
const c = "70c0ed93-db61-4940-8b98-ced68816337f";
const input = () => ({ expectedVersion: 2, expectedRevisionId: a, replacements: [{ oldId: a, newId: b }] });
test("accepts bounded image replacements with expected revision and version", () => assert.ok(parseImagePublication(input())));
test("rejects ambiguous or unbounded mutation inputs", () => {
  assert.equal(parseImagePublication({ ...input(), expectedVersion: 0 }), null);
  assert.equal(parseImagePublication({ ...input(), extra: true }), null);
  assert.equal(parseImagePublication({ ...input(), replacements: [{ oldId: a, newId: a }] }), null);
  assert.equal(parseImagePublication({ ...input(), replacements: [{ oldId: a, newId: b }, { oldId: c, newId: b }] }), null);
  assert.equal(parseImagePublication({ ...input(), replacements: [] }), null);
  assert.equal(parseImagePublication({ ...input(), replacements: Array(101).fill({ oldId: a, newId: b }) }), null);
});
