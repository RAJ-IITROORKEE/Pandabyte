// Lambda Function URL handler: HMAC-checked, sandboxed arduino-cli compile.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { validateRequest, verifySignature, scrubOutput, BOARDS } from "./validate.mjs";

const TIMEOUT_MS = 100_000;
const MAX_OUTPUT = 1_000_000;
const MAX_BIN = 4_000_000; // base64 must fit the 6 MB Lambda response
const CACHE_SRC = "/opt/arduino/cache"; // read-only, pre-warmed at image build
const CACHE = "/tmp/arduino-cache"; // writable copy, made once per container

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});

let cacheReady;
const ensureCache = () => (cacheReady ??= cp(CACHE_SRC, CACHE, { recursive: true }).catch(() => mkdir(CACHE, { recursive: true })));

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

  const dir = `/tmp/build-${randomUUID()}`;
  try {
    await ensureCache();
    await mkdir(`${dir}/sketch`, { recursive: true });
    await mkdir("/tmp/home", { recursive: true });
    await writeFile(`${dir}/sketch/sketch.ino`, v.sketch);
    const r = await run(["compile", "--fqbn", v.fqbn, "--output-dir", `${dir}/out`, "--build-path", `${dir}/build`, "--build-cache-path", CACHE, "sketch"], dir);
    if (r.timedOut) return json(200, { ok: false, errors: "compile timed out" });
    if (r.code !== 0) return json(200, { ok: false, errors: scrubOutput(r.out) });

    const esp32 = BOARDS[v.board].chip !== "esp8266";
    const file = `${dir}/out/${esp32 ? "sketch.ino.merged.bin" : "sketch.ino.bin"}`;
    const size = (await stat(file)).size;
    if (size > MAX_BIN) return json(200, { ok: false, errors: "firmware too large to return" });
    const bin = await readFile(file);
    return json(200, {
      ok: true, board: v.board, fqbn: v.fqbn, address: 0, size,
      sha256: createHash("sha256").update(bin).digest("hex"),
      binBase64: bin.toString("base64"),
      warnings: scrubOutput(r.out),
      durationMs: Date.now() - started,
    });
  } catch {
    return json(500, { ok: false, reason: "internal error" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
