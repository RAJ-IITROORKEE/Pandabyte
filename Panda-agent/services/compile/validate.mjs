// Pure request validation for the compile Lambda. No dependencies.
import { createHmac, timingSafeEqual } from "node:crypto";

export const BOARDS = {
  ESPXS3: { fqbn: "esp32:esp32:esp32s3", chip: "esp32s3", address: 0 },
  ESPXC3: { fqbn: "esp32:esp32:esp32c3", chip: "esp32c3", address: 0 },
  ESPXC3M: { fqbn: "esp32:esp32:esp32c3", chip: "esp32c3", address: 0 },
  ESPXC5: { fqbn: "esp32:esp32:esp32c5", chip: "esp32c5", address: 0 },
  ESPXC6: { fqbn: "esp32:esp32:esp32c6", chip: "esp32c6", address: 0 },
  ESPX32: { fqbn: "esp32:esp32:esp32", chip: "esp32", address: 0 },
  XLORA: { fqbn: "esp32:esp32:esp32", chip: "esp32", address: 0 },
  ESPX8266: { fqbn: "esp8266:esp8266:nodemcuv2", chip: "esp8266", address: 0 },
};

// Exact pins, installed by the Dockerfile (keep both in sync).
// Versions are the latest stable releases known when written; the image build fails loudly if one does not exist.
export const ALLOWED_LIBRARIES = {
  "Adafruit BME280 Library": "2.2.4",
  "Adafruit SSD1306": "2.5.13",
  "Adafruit GFX Library": "1.11.11",
  "Adafruit NeoPixel": "1.12.3",
  "Adafruit Unified Sensor": "1.1.14",
  "Adafruit BusIO": "1.16.1",
  "DHT sensor library": "1.4.6",
  PubSubClient: "2.8",
  ArduinoJson: "7.2.0",
};

export const MAX_SKETCH_BYTES = 65536;
const HEADER = /^[A-Za-z0-9_./-]+\.(h|hpp)$/;
const INCLUDE = /#\s*(?:include_next|include|import)(?![A-Za-z0-9_])\s*(?:<([^>\r\n]*)>|"([^"\r\n]*)")?/g;
const FORBIDDEN = [
  [/\.incbin/i, "incbin is not allowed"],
  [/\bincbin\b/i, "incbin is not allowed"],
  [/__has_include/, "__has_include is not allowed"],
  [/#\s*pragma\s+GCC\s+system_header/, "system_header pragma is not allowed"],
  [/\/proc\b/, "path /proc is not allowed"],
  [/\benviron\b/, "environ is not allowed"],
  [/\/(?:var\/task|opt|tmp)\b/, "build paths are not allowed"],
];

export function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("body must be an object");
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("board") || !keys.includes("sketch")) return bad("only board and sketch are accepted");
  const { board, sketch } = body;
  if (typeof board !== "string" || !Object.hasOwn(BOARDS, board)) return bad("unknown board");
  if (typeof sketch !== "string" || sketch.length === 0) return bad("sketch must be a non-empty string");
  if (!sketch.isWellFormed() || sketch.includes("\0")) return bad("sketch is not well-formed text");
  if (Buffer.byteLength(sketch, "utf8") > MAX_SKETCH_BYTES) return bad("sketch exceeds 64 KB");
  for (const [re, reason] of FORBIDDEN) if (re.test(sketch)) return bad(reason);
  // Splice continuation lines first so "#inc\<nl>lude" cannot hide an include.
  for (const m of sketch.replace(/\\\r?\n/g, "").matchAll(INCLUDE)) {
    const name = m[1] ?? m[2];
    if (name === undefined) return bad("#include must name a header in <> or quotes");
    if (name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("..") || name.includes("\\") || !HEADER.test(name)) {
      return bad(`include not allowed: ${name.slice(0, 60)}`);
    }
  }
  return { ok: true, board, fqbn: BOARDS[board].fqbn, sketch };
}

// timestamp: unix seconds (string); now: ms (default Date.now()).
export function verifySignature({ secret, timestamp, body, signature, now = Date.now() }) {
  if (!secret || typeof signature !== "string" || typeof body !== "string" || !/^\d{1,12}$/.test(String(timestamp))) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 60) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function scrubOutput(text) {
  return String(text ?? "").replace(/(?:\/tmp|\/opt|\/var\/task)[^\s:'"()<>]*/g, "sketch").slice(0, 4000);
}

function bad(reason) {
  return { ok: false, reason };
}

/** Drops trailing 0xFF (erased flash) padding from a firmware image, keeping 4-byte alignment for the flasher. */
export function trimErased(bin) {
  let end = bin.length;
  while (end > 0 && bin[end - 1] === 0xff) end--;
  return bin.subarray(0, Math.min(bin.length, (end + 3) & ~3));
}
