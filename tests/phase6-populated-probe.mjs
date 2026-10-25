import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import sharp from "sharp";

// Fixed sequential development reads: no concurrency, writes, provider-login or capacity exercise.
const origin = "http://localhost:3000";
const pages = ["/", "/shop", "/shop?category=microcontroller", "/shop?q=XC3M",
  "/products/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible", "/contact"];
async function sample(route) {
  const started = performance.now();
  const response = await fetch(origin + route, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  const headersMs = Math.round(performance.now() - started);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, "Local sample must succeed");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, "Do not weaken visibility/cache boundaries");
  return { response, bytes, headersMs, totalMs: Math.round(performance.now() - started) };
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === "--derivatives"));
  const sizes = args.length ? [undefined, 96, 960] : [undefined];
  const catalogCount = async () => {
    const { bytes } = await sample("/api/catalog?limit=1");
    const total = JSON.parse(bytes).total;
    assert.equal(total, 42, "Use the reconciled dataset after disposable fixtures are cleaned");
    return total;
  };
  const productsBefore = await catalogCount();
  const observations = [];
  for (const route of pages) for (let repeat = 1; repeat <= 2; repeat++) {
    const { response, bytes, headersMs, totalMs } = await sample(route);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(bytes.toString(), /id="main"/);
    assert(!bytes.toString().includes("NEXT_HTTP_ERROR_FALLBACK;404"));
    observations.push({ route, repeat, headersMs, totalMs, decodedBodyBytes: bytes.length });
  }
  const prepared = JSON.parse(await fs.readFile(".bootstrap/catalog-import/prepared.json", "utf8"));
  const ledger = JSON.parse(await fs.readFile(".bootstrap/catalog-import/ledger.json", "utf8"));
  const sorted = [...prepared].sort((a, b) => a.normalizedBytes - b.normalizedBytes);
  const selected = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted.at(-1)];
  const images = [];
  for (const [index, item] of selected.entries()) for (const size of sizes) for (let repeat = 1; repeat <= 2; repeat++) {
    const media = ledger.media[item.key];
    assert.match(media.id, /^[0-9a-f-]{36}$/i);
    const { response, bytes, headersMs, totalMs } = await sample(`/api/media/${media.id}${size ? `?w=${size}` : ""}`);
    assert.match(response.headers.get("content-type") ?? "", /image\/webp/);
    if (!size) assert.equal(createHash("sha256").update(bytes).digest("hex"), item.normalizedSha256);
    const metadata = await sharp(bytes).metadata();
    if (size) assert(metadata.width <= size && metadata.height <= size);
    images.push({ sample: ["smallest", "median", "largest"][index], variant: size ?? "original", repeat, bytes: bytes.length, width: metadata.width, height: metadata.height, headersMs, totalMs });
  }
  const productsAfter = await catalogCount();
  console.log(JSON.stringify({ scope: `${14 + images.length} sequential localhost GETs against populated development catalog; HTML/body/image timing only; no browser-network/Web Vitals, percentile or capacity claim`, productsBefore, productsAfter, observations, images }, null, 2));
}
main().catch(() => { console.error("Populated localhost probe failed safely."); process.exitCode = 1; });
