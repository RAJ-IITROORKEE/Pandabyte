import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { prepareInquiryAttachment, MAX_INQUIRY_ATTACHMENT_BYTES } from "../lib/contact/attachments.ts";

const request = "052F0CFB-1515-4AE9-BFB9-AAD917D40D00";
test("validates extension, MIME, signature, size, and canonical storage key", async () => {
  const png = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer());
  const good = await prepareInquiryAttachment(new File([png], "example.png", { type: "image/png" }), request, 0);
  assert.ok(good);
  assert.match(good.key, /^inquiries\/052f0cfb-1515-4ae9-bfb9-aad917d40d00\/0-[0-9a-f]{64}$/);
  assert.equal(await prepareInquiryAttachment(new File([png], "example.pdf", { type: "application/pdf" }), request, 0), null);
  assert.equal(await prepareInquiryAttachment(new File([png.slice(0, 8)], "fake.png", { type: "image/png" }), request, 0), null);
  assert.equal(await prepareInquiryAttachment(new File([png], "example.png", { type: "text/html" }), request, 0), null);
  assert.equal(await prepareInquiryAttachment(new File([png], "../example.png", { type: "image/png" }), request, 0), null);
  assert.equal(await prepareInquiryAttachment(new File([new Uint8Array(MAX_INQUIRY_ATTACHMENT_BYTES + 1)], "large.png", { type: "image/png" }), request, 0), null);
});

test("submission key is checked before taking the shared inquiry lock", async () => {
  const migration = await readFile(new URL("../migrations/20261101120000_inquiry-attachments.sql", import.meta.url), "utf8");
  const submit = migration.split("CREATE FUNCTION public.submit_inquiry_with_attachments")[1].split("END $f$;")[0];
  const check = submit.indexOf("encode(sha256(convert_to(p_submission_key,'UTF8')),'hex')<>expected_hash");
  const lock = submit.indexOf("pg_advisory_xact_lock(832642)");
  assert.ok(check >= 0 && lock > check);
});
