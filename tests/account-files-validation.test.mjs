import assert from "node:assert/strict";
import test from "node:test";

import {
  accountFileObjectKey,
  isAccountFileObjectKey,
  validateAccountTextFile,
} from "../lib/storage/account-files.ts";
import {
  MAX_ACCOUNT_FILE_REQUEST_BYTES,
  readBoundedBody,
} from "../lib/storage/http.ts";

const bytes = (value) => new TextEncoder().encode(value);

test("accepts bounded UTF-8 plain text and the matching owner key", () => {
  const result = validateAccountTextFile({
    filename: "notes 2026.txt",
    mimeType: "text/plain",
    bytes: bytes("Hello\nनमस्ते\tworld"),
  });

  assert.deepEqual(result, { ok: true, text: "Hello\nनमस्ते\tworld" });
  const key = accountFileObjectKey("user_123", "d9428888-122b-11e1-b85c-61cd3cbb3210");
  assert.equal(key, "user_123/d9428888-122b-11e1-b85c-61cd3cbb3210.txt");
  assert.equal(isAccountFileObjectKey(key, "user_123", "d9428888-122b-11e1-b85c-61cd3cbb3210"), true);
  assert.equal(isAccountFileObjectKey(key, "user_other", "d9428888-122b-11e1-b85c-61cd3cbb3210"), false);
});

test("rejects unsafe names, non-text MIME, empty and oversized content", () => {
  const valid = { filename: "notes.txt", mimeType: "text/plain", bytes: bytes("ok") };

  assert.equal(validateAccountTextFile({ ...valid, filename: "../notes.txt" }).ok, false);
  assert.equal(validateAccountTextFile({ ...valid, filename: "notes.html" }).ok, false);
  assert.equal(validateAccountTextFile({ ...valid, mimeType: "text/html" }).ok, false);
  assert.deepEqual(validateAccountTextFile({ ...valid, bytes: new Uint8Array() }), {
    ok: false,
    reason: "empty",
  });
  assert.deepEqual(validateAccountTextFile({ ...valid, bytes: new Uint8Array(64 * 1024 + 1) }), {
    ok: false,
    reason: "too_large",
  });
});

test("rejects invalid UTF-8 and control characters beyond tab, CR and LF", () => {
  assert.deepEqual(
    validateAccountTextFile({ filename: "notes.txt", mimeType: "text/plain", bytes: new Uint8Array([0xc3, 0x28]) }),
    { ok: false, reason: "encoding" },
  );
  assert.deepEqual(
    validateAccountTextFile({ filename: "notes.txt", mimeType: "text/plain", bytes: bytes("bad\u0000text") }),
    { ok: false, reason: "characters" },
  );
});

test("bounds the actual multipart request stream even without Content-Length", async () => {
  const request = new Request("https://pandabyte.test/api/account/files", {
    method: "POST",
    body: new Blob([new Uint8Array(MAX_ACCOUNT_FILE_REQUEST_BYTES + 1)]),
  });

  assert.deepEqual(await readBoundedBody(request), { ok: false, reason: "too_large" });
});
