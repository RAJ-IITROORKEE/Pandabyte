import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewCache } from "../lib/editorial/preview-cache.ts";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const media = { objectKey: "assets/a.webp", mimeType: "image/webp", byteSize: 100, width: 200, height: 200 };
const preview = bytes => ({ bytes: Buffer.alloc(bytes), mimeType: "image/webp", extension: "webp", width: 96, height: 96 });

test("cache only holds public resized previews with matching identity and metadata", () => {
  const cache = createPreviewCache();
  cache.set(true, media, 96, preview(5));
  assert.equal(cache.get(true, media, 96).bytes.length, 5);
  assert.equal(cache.get(false, media, 96), undefined);
  assert.equal(cache.get(true, media, undefined), undefined);
  assert.equal(cache.get(true, { ...media, byteSize: 101 }, 96), undefined);
  cache.set(false, { ...media, objectKey: "private" }, 96, preview(5));
  assert.equal(cache.get(true, { ...media, objectKey: "private" }, 96), undefined);
  const large = { ...media, width: 1200, height: 900 };
  cache.set(true, large, 480, preview(7));
  assert.equal(cache.get(true, large, 480).bytes.length, 7);
  assert.equal(cache.get(false, large, 480), undefined);
  assert.equal(cache.get(true, large, 96), undefined);
  cache.set(false, { ...large, objectKey: "private-480" }, 480, preview(7));
  assert.equal(cache.get(true, { ...large, objectKey: "private-480" }, 480), undefined);
  cache.set(true, media, 960, preview(5));
  assert.equal(cache.get(true, media, 960), undefined);
});

test("eviction respects entry and byte limits and refreshes hits", () => {
  const cache = createPreviewCache(2, 10);
  const b = { ...media, objectKey: "b" }, c = { ...media, objectKey: "c" };
  cache.set(true, media, 96, preview(4));
  cache.set(true, b, 96, preview(4));
  cache.get(true, media, 96);
  cache.set(true, c, 96, preview(4));
  assert.equal(cache.get(true, b, 96), undefined);
  assert.ok(cache.get(true, media, 96));
  cache.set(true, b, 96, preview(11));
  assert.equal(cache.get(true, b, 96), undefined);
});

test("byte pressure and replacement accounting evict the oldest entries", () => {
  const cache = createPreviewCache(10, 10);
  const b = { ...media, objectKey: "b" }, c = { ...media, objectKey: "c" };
  cache.set(true, media, 96, preview(4));
  cache.set(true, b, 96, preview(4));
  cache.set(true, media, 96, preview(6));
  assert.ok(cache.get(true, b, 96));
  assert.equal(cache.get(true, media, 96).bytes.length, 6);
  cache.set(true, c, 96, preview(5));
  assert.equal(cache.get(true, b, 96), undefined);
  assert.equal(cache.get(true, media, 96), undefined);
  assert.equal(cache.get(true, c, 96).bytes.length, 5);
});

test("concurrent published preview preparation shares work without caching an unchecked result", async () => {
  const cache = createPreviewCache();
  let release, calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const load = async () => { calls++; await wait; return preview(5); };
  const a = cache.prepare(true, media, 96, load);
  const b = cache.prepare(true, media, 96, load);
  assert.equal(a, b);
  release();
  const [first, second] = await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(cache.get(true, media, 96), undefined);
  await cache.prepare(true, media, 96, load);
  assert.equal(calls, 2);
});

test("rejected, empty and synchronously failing work is removed so later requests can retry", async () => {
  const cache = createPreviewCache();
  let calls = 0;
  const fail = async () => { calls++; throw new Error("download failed"); };
  const a = cache.prepare(true, media, 96, fail);
  const b = cache.prepare(true, media, 96, fail);
  const results = await Promise.allSettled([a, b]);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(await cache.prepare(true, media, 96, async () => undefined), undefined);
  await assert.rejects(cache.prepare(true, media, 96, () => { throw new Error("sync failure"); }), /sync failure/);
  assert.equal((await cache.prepare(true, media, 96, async () => preview(3))).bytes.length, 3);
});

test("private, original, small and overflow requests keep independent preparation", async () => {
  const cache = createPreviewCache(64, 1024, 1);
  let release, calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const load = async () => { calls++; await wait; return preview(5); };
  const tracked = cache.prepare(true, media, 96, load);
  const requests = [tracked, cache.prepare(true, media, 96, load)];
  for (const [published, item, size] of [[false, media, 96], [true, media, undefined], [true, media, 960], [true, { ...media, objectKey: "overflow" }, 96]]) {
    requests.push(cache.prepare(published, item, size, load), cache.prepare(published, item, size, load));
  }
  release();
  await Promise.all(requests);
  assert.equal(calls, 9);
  const other = { ...media, objectKey: "after-completion" };
  const a = cache.prepare(true, other, 96, load);
  assert.equal(a, cache.prepare(true, other, 96, load));
  await a;
  assert.equal(calls, 10);
});

test("each concurrent route caller rechecks publication after shared work and denies withdrawal", async () => {
  const source = await readFile(new URL("../app/api/media/[id]/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const id = "11111111-1111-4111-8111-111111111111";
  const record = { ...media, width: 1200, height: 900, id, objectKey: `assets/${id}.webp` };
  const cache = createPreviewCache();
  let published = true, checks = 0, downloads = 0, preparations = 0, release, started;
  const wait = new Promise(resolve => { release = resolve; });
  const begin = new Promise(resolve => { started = resolve; });
  const client = { database: { schema: () => ({ rpc: async () => { checks++; return { data: { media: published ? record : null } }; } }) } };
  const deps = {
    "server-only": {},
    "@insforge/sdk": { createAdminClient: () => ({ storage: { from: () => ({ download: async () => {
      downloads++; started(); await wait;
      return { data: { size: record.byteSize, arrayBuffer: async () => Buffer.alloc(record.byteSize) } };
    } }) } }) },
    "@/lib/insforge/public": { createInsforgePublicClient: () => client },
    "@/lib/insforge/server": { createInsforgeServerClient: () => { throw new Error("unexpected private client"); } },
    "@/lib/authorization": { getStaffAccess: () => { throw new Error("unexpected staff lookup"); } },
    "@/lib/editorial/http": { editorialHeaders: { "Cache-Control": "private, no-store" }, editorialError: (code, status) => new Response(code, { status }) },
    "@/lib/editorial/validation": { UUID_PATTERN: /^[0-9a-f-]{36}$/, MAX_MEDIA_BYTES: 4 * 1024 * 1024, EDITORIAL_MEDIA_BUCKET: "editorial-media" },
    "@/lib/editorial/media-delivery": { parseEditorialImageSize: () => 480, prepareEditorialDownload: async () => { preparations++; return preview(5); } },
    "@/lib/editorial/preview-cache": { publicPreviewCache: cache },
  };
  const exported = {};
  runInNewContext(compiled, { exports: exported, require: name => { assert.ok(name in deps, name); return deps[name]; }, Buffer, URL, Response, Uint8Array, process: { env: { INSFORGE_EDITORIAL_STORAGE_READ_KEY: "fixture-key" } } });
  const get = () => exported.GET(new Request(`http://localhost/api/media/${id}?w=480`), { params: Promise.resolve({ id }) });
  const first = get();
  await begin;
  const second = get();
  // Let the second request finish its initial publication lookup before withdrawal.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(checks, 2);
  published = false; release();
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses.map(response => response.status), [404, 404]);
  assert.equal(checks, 4);
  assert.equal(downloads, 1);
  assert.equal(preparations, 1);
  assert.equal(cache.get(true, record, 480), undefined);
  published = true;
  assert.equal((await get()).status, 200);
  assert.equal(downloads, 2);
  assert.equal((await get()).status, 200);
  assert.equal(downloads, 2);
  assert.equal(checks, 8);
});
