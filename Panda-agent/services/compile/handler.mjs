// Lambda Function URL handler: HMAC-checked, sandboxed arduino-cli compile.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { validateRequest, verifySignature, scrubOutput, trimErased, BOARDS } from "./validate.mjs";

const TIMEOUT_MS = 100_000;
const MAX_OUTPUT = 1_000_000;
const MAX_BIN = 4_000_000; // base64 must fit the 6 MB Lambda response
// One build folder per board type, compiled at image build at the same /tmp/work paths (arduino-cli rebuilds everything if
// the sketch path or options differ). A container copies it once and reuses it, so later compiles rebuild only the sketch.
const PREBUILT = "/opt/arduino/prebuilt";
const WORK = "/tmp/work";
export const slugOf = (fqbn) => fqbn.replace(/[^a-z0-9]+/gi, "_");

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});

const copied = new Map();
const workFor = (fqbn) => {
  const s = slugOf(fqbn);
  // The image's files are read-only and cp keeps their modes, so the copy is made writable (14 Nov: every compile hit EACCES).
  if (!copied.has(s)) copied.set(s, cp(`${PREBUILT}/${s}`, `${WORK}/${s}`, { recursive: true, preserveTimestamps: true })
    .then(() => new Promise((done) => spawn("chmod", ["-R", "u+w", `${WORK}/${s}`]).on("close", done).on("error", done))).catch(() => {}));
  return copied.get(s).then(() => `${WORK}/${s}`);
};

function run(args, cwd) {
  // Cleared environment: nothing from the handler (secret, AWS credentials) reaches the compiler.
  const env = {
    PATH: "/opt/arduino/bin:/usr/local/bin:/usr/bin:/bin",
    HOME: "/tmp/home",
    ARDUINO_DIRECTORIES_DATA: "/opt/arduino/data",
    ARDUINO_DIRECTORIES_USER: "/opt/arduino/user",
    ARDUINO_DIRECTORIES_DOWNLOADS: "/tmp/arduino-dl",
    ARDUINO_UPDATER_ENABLE_NOTIFICATION: "false",
  };
  return new Promise((resolve) => {
    const child = spawn("arduino-cli", args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let timedOut = false;
    const collect = (d) => { if (out.length < MAX_OUTPUT) out += d; };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out: String(e.message), timedOut }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out, timedOut }); });
  });
}

export async function handler(event) {
  const started = Date.now();
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
  const h = event.headers ?? {};
  if (!verifySignature({ secret: process.env.PANDA_COMPILE_SECRET, timestamp: h["x-panda-timestamp"], body: raw, signature: h["x-panda-signature"] })) {
    return json(401, { ok: false, reason: "unauthorized" });
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return json(400, { ok: false, reason: "invalid JSON" }); }
  const v = validateRequest(parsed);
  if (!v.ok) return json(400, { ok: false, reason: v.reason });

  const dir = `/tmp/out-${randomUUID()}`;
  try {
    const work = await workFor(v.fqbn);
    // The previous request's sketch objects and images are removed; core and library objects are kept.
    await rm(`${work}/build/sketch`, { recursive: true, force: true });
    await mkdir(`${work}/sketch`, { recursive: true });
    await mkdir("/tmp/home", { recursive: true });
    await writeFile(`${work}/sketch/sketch.ino`, v.sketch);
    const r = await run(["compile", "--fqbn", v.fqbn, "--output-dir", dir, "--build-path", `${work}/build`, "sketch"], work);
    // A killed build may leave half-written objects: the next request starts this board from the prebuilt folder again.
    if (r.timedOut) { copied.delete(slugOf(v.fqbn)); await rm(work, { recursive: true, force: true }); return json(200, { ok: false, errors: "compile timed out" }); }
    if (r.code !== 0) return json(200, { ok: false, errors: scrubOutput(r.out) });

    const esp32 = BOARDS[v.board].chip !== "esp8266";
    const file = `${dir}/${esp32 ? "sketch.ino.merged.bin" : "sketch.ino.bin"}`;
    // merged.bin is padded with 0xFF (erased flash) to the full flash size; trimming it keeps the image small and leaves
    // the board's other partitions (e.g. saved Wi-Fi in NVS) as they are, like an Arduino IDE upload.
    const bin = trimErased(await readFile(file)), size = bin.length;
    if (size > MAX_BIN) return json(200, { ok: false, errors: "firmware too large to return" });
    return json(200, {
      ok: true, board: v.board, fqbn: v.fqbn, address: 0, size,
      sha256: createHash("sha256").update(bin).digest("hex"),
      binBase64: bin.toString("base64"),
      warnings: scrubOutput(r.out),
      durationMs: Date.now() - started,
    });
  } catch (e) {
    console.error("compile handler error", e?.code ?? "unknown"); // the code only: no sketch text or paths
    return json(500, { ok: false, reason: "internal error" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
