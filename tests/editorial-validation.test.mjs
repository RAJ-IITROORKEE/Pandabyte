import assert from "node:assert/strict";
import test from "node:test";
import { parseInquiryInput, parseInquiryPatch, parseListQuery, parseMediaPatch } from "../lib/editorial/validation.ts";
import { readBoundedBody } from "../lib/storage/http.ts";

const id = "bd4eeb12-1e5e-4f91-ae29-e70ee507b1ee";
const inquiry = { name: "Development fixture", email: "Fixture@example.com", subject: "Test", message: "Synthetic inquiry", idempotencyKey: id };

test("inquiry submission accepts bounded plain fields and rejects authority/identity injection", () => {
  assert.equal(parseInquiryInput(inquiry)?.email, "fixture@example.com");
  for (const extra of [{ status: "resolved" }, { userId: id }, { actor: "staff" }]) assert.equal(parseInquiryInput({ ...inquiry, ...extra }), null);
  assert.equal(parseInquiryInput({ ...inquiry, message: "x".repeat(5001) }), null);
  assert.equal(parseInquiryInput({ ...inquiry, email: "bad email" }), null);
  assert.equal(parseInquiryInput({ ...inquiry, idempotencyKey: "guessable" }), null);
});

test("staff inquiry/media changes require explicit versions and closed fields", () => {
  assert.deepEqual(parseInquiryPatch({ expectedVersion: 2, status: "in_progress", note: "  Checked  " }), { expectedVersion: 2, status: "in_progress", note: "Checked" });
  assert.equal(parseInquiryPatch({ expectedVersion: 0, status: "new" }), null);
  assert.equal(parseInquiryPatch({ expectedVersion: 2, status: "sent" }), null);
  assert.equal(parseInquiryPatch({ expectedVersion: 2, status: "new", note: "x".repeat(2001) }), null);
  const patch = { expectedVersion: 1, altText: "Board photo", source: "Owner", published: false };
  assert.deepEqual(parseMediaPatch(patch), patch);
  assert.deepEqual(parseMediaPatch({ ...patch, publicUseAllowed: false }), { ...patch, publicUseAllowed: false });
  assert.deepEqual(parseMediaPatch({ ...patch, publicUseAllowed: true }), { ...patch, publicUseAllowed: true });
  for (const value of [null, "true", 1]) assert.equal(parseMediaPatch({ ...patch, publicUseAllowed: value }), null);
  assert.equal(parseMediaPatch({ ...patch, createdBy: "other" }), null);
  assert.equal(parseMediaPatch({ ...patch, altText: "" }), null);
});

test("editorial lists and streamed bodies remain bounded", async () => {
  assert.equal(parseListQuery("http://localhost/api?q=board&limit=25&offset=0")?.limit, 25);
  for (const suffix of ["limit=51", "q=a&q=b", "offset=1000001", "status=paid", "role=admin"]) assert.equal(parseListQuery(`http://localhost/api?${suffix}`), null);
  const request = new Request("http://localhost/upload", { method: "POST", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } }), duplex: "half" });
  assert.deepEqual(await readBoundedBody(request, 10), { ok: false, reason: "too_large" });
});
