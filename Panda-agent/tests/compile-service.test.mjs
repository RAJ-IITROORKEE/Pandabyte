import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { BOARDS, validateRequest, verifySignature, scrubOutput } from "../services/compile/validate.mjs";

const ok = "void setup(){} void loop(){}";

test("accepts every allowed board", () => {
  for (const [board, { fqbn }] of Object.entries(BOARDS)) {
    assert.deepEqual(validateRequest({ board, sketch: ok }), { ok: true, board, fqbn, sketch: ok });
  }
});

test("rejects bad shape, board and size", () => {
  assert.equal(validateRequest({ board: "NOPE", sketch: ok }).ok, false);
  assert.equal(validateRequest({ board: "ESPX32", sketch: ok, extra: 1 }).ok, false);
  assert.equal(validateRequest({ board: "ESPX32" }).ok, false);
  assert.equal(validateRequest({ board: "ESPX32", sketch: "" }).ok, false);
  assert.equal(validateRequest({ board: "ESPX32", sketch: "a".repeat(65536) }).ok, true);
  assert.equal(validateRequest({ board: "ESPX32", sketch: "a".repeat(65537) }).ok, false);
  assert.equal(validateRequest({ board: "ESPX32", sketch: "é".repeat(32769) }).ok, false);
  assert.equal(validateRequest({ board: "ESPX32", sketch: "\ud800" }).ok, false);
  assert.equal(validateRequest({ board: "toString", sketch: ok }).ok, false);
});

test("allows normal includes", () => {
  const s = '#include <Adafruit_BME280.h>\n#include "helper.h"\n#include <sys/time.h>\n' + ok;
  assert.equal(validateRequest({ board: "ESPXS3", sketch: s }).ok, true);
});

test("rejects forbidden content", () => {
  const bad = [
    '#include "/etc/passwd.h"', "#include <C:/x.h>", '#include "../x.h"', '#include "a\\b.h"', "#include <foo.cpp>",
    "#include <foo>", "#include MACRO", "# import <../a.h>", '#inc\\\nlude "../a.h"',
    '__asm__(".incbin \\"x\\"");', '#if __has_include("/etc/x")', "#pragma GCC system_header",
    'fopen("/proc/self/environ")', "extern char **environ;", 'x("/var/task/handler.mjs")', 'x("/opt/arduino")', 'x("/tmp/a")',
  ];
  for (const b of bad) assert.equal(validateRequest({ board: "ESPXS3", sketch: `${b}\n${ok}` }).ok, false, b);
});

test("verifySignature", () => {
  const secret = "s".repeat(32), body = '{"a":1}', now = 1_800_000_000_000, ts = String(now / 1000);
  const sig = (s, t, b) => createHmac("sha256", s).update(`${t}.${b}`).digest("hex");
  const base = { secret, timestamp: ts, body, signature: sig(secret, ts, body), now };
  assert.equal(verifySignature(base), true);
  assert.equal(verifySignature({ ...base, signature: sig("x".repeat(32), ts, body) }), false);
  assert.equal(verifySignature({ ...base, body: '{"a":2}' }), false);
  assert.equal(verifySignature({ ...base, now: now + 61_000 }), false);
  assert.equal(verifySignature({ ...base, now: now - 59_000 }), true);
  assert.equal(verifySignature({ ...base, signature: "abc" }), false);
  assert.equal(verifySignature({ ...base, secret: "" }), false);
});

test("scrubOutput", () => {
  const out = scrubOutput("/tmp/build-1/sketch/sketch.ino:3:1: error\n/opt/arduino/data/x.h /var/task/a.mjs");
  assert.ok(!/\/tmp|\/opt|\/var\/task/.test(out));
  assert.match(out, /^sketch:3:1: error/);
  assert.equal(scrubOutput("a".repeat(5000)).length, 4000);
});

test("trimErased drops 0xFF flash padding but keeps 4-byte alignment", async () => {
  const { trimErased } = await import("../services/compile/validate.mjs");
  assert.deepEqual([...trimErased(Buffer.from([1, 2, 3, 0xff, 0xff, 0xff, 0xff, 0xff]))], [1, 2, 3, 0xff]);
  assert.deepEqual([...trimErased(Buffer.from([1, 2, 3, 4]))], [1, 2, 3, 4]);
  assert.equal(trimErased(Buffer.alloc(4096, 0xff)).length, 0);
});
