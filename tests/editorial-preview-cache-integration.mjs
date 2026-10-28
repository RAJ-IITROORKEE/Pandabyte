import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { createClerkClient } from "@clerk/backend";
import sharp from "sharp";

const origin = "http://localhost:3001";
const journalPath = ".bootstrap/preview-cache-fixture.json";
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const config = JSON.parse(await readFile(".insforge/project.json", "utf8"));
ensure(config.project_id === "988b987b-f809-4cd5-94b2-c1d1e5cc9120" && config.oss_host === "https://r2g8wzib.us-east.insforge.app" && process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === config.oss_host && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "development_target_mismatch");
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
ensure((await clerk.instance.get()).id === "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI", "identity_mismatch");
const owner = JSON.parse(await readFile(".bootstrap/owner-admin-subject.json", "utf8"));
const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
ensure(sessions.data.length > 0, "owner_session_missing");
const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
let token, mintedAt = 0;
async function request(route, { method = "GET", json, form, authenticated = true } = {}) {
  const headers = { origin };
  if (authenticated) {
    if (!token || Date.now() - mintedAt > 25000) { token = (await clerk.sessions.getToken(session.id)).jwt; mintedAt = Date.now(); }
    headers.authorization = `Bearer ${token}`;
  }
  if (json) headers["content-type"] = "application/json";
  return fetch(origin + route, { method, headers, body: json ? JSON.stringify(json) : form, signal: AbortSignal.timeout(90000) });
}
async function checked(route, options, status) {
  const response = await request(route, options);
  ensure(response.status === status, `unexpected_status_${response.status}_expected_${status}`);
  return response;
}
const access = await (await checked("/api/admin/access", {}, 200)).json();
ensure(access.capabilities.includes("media.manage"), "owner_capability_missing");
const roles = await (await checked("/api/admin/roles?limit=50&offset=0", {}, 200)).json();
ensure(roles.items.some(r => r.userId === owner.userId && r.role === "ADMIN" && r.protected), "protected_owner_missing");
const runId = randomUUID();
const state = { runId, pending: null, phase: "start" };
const save = async () => { await writeFile(journalPath + ".tmp", JSON.stringify(state, null, 2)); await rename(journalPath + ".tmp", journalPath); };
await writeFile(journalPath, JSON.stringify(state), { flag: "wx" });
const mutate = async (label, route, options, status) => {
  state.pending = label; await save();
  const response = await checked(route, options, status);
  const value = await response.json();
  state.pending = null; state.phase = label; if (value.media) state.media = value.media;
  await save();
  return value;
};
const filename = `cache-test-${runId}.webp`;
const image = await sharp({ create: { width: 1200, height: 1000, channels: 3, background: "#687b64" } }).webp({ lossless: true }).toBuffer();
const form = new FormData(); form.set("file", new File([image], filename, { type: "image/webp" })); form.set("altText", `Disposable cache test ${runId}`); form.set("source", "Synthetic local preview cache test");
const upload = await mutate("upload", "/api/admin/media", { method: "POST", form }, 201);
let media = upload.media;
ensure(media && media.width === 1200 && media.height === 1000 && !media.published, "uploaded_fixture_invalid");
const path = `/api/media/${media.id}?w=960`;
await checked(path, { authenticated: false }, 404);
await checked(path, {}, 200);
const patch = published => ({ method: "PATCH", json: { expectedVersion: media.version, altText: media.altText, source: media.source, published } });
media = (await mutate("publish", `/api/admin/media/${media.id}`, patch(true), 200)).media;
const timings = [];
let previous;
for (let i = 0; i < 2; i++) {
  const start = performance.now();
  const response = await checked(path, { authenticated: false }, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  ensure(response.headers.get("cache-control")?.includes("no-store"), "unsafe_cache_header");
  const metadata = await sharp(bytes).metadata();
  ensure(metadata.width === 960 && metadata.height <= 960 && (!previous || previous.equals(bytes)), "preview_invalid");
  previous = bytes; timings.push(Math.round(performance.now() - start));
}
media = (await mutate("withdraw", `/api/admin/media/${media.id}`, patch(false), 200)).media;
await checked(path, { authenticated: false }, 404);
const privateResponse = await checked(path, {}, 200);
ensure(privateResponse.headers.get("cache-control")?.includes("no-store"), "private_cache_header_invalid");
ensure(Buffer.from(await privateResponse.arrayBuffer()).equals(previous), "private_preview_differs");
media = (await mutate("archive", `/api/admin/media/${media.id}/archive`, { method: "POST", json: { expectedVersion: media.version } }, 200)).media;
ensure(media.archived && !media.published, "fixture_archive_failed");
await checked(path, { authenticated: false }, 404);
state.phase = "complete"; state.timingsMs = timings; state.previewBytes = previous.length; await save();
console.log(JSON.stringify({ outcome: "passed", previewBytes: previous.length, timingsMs: timings, anonymousAfterWithdrawal: 404, staffAfterWithdrawal: 200, anonymousAfterArchive: 404, cleanup: "archived through Admin API; historical record and object retained" }));
