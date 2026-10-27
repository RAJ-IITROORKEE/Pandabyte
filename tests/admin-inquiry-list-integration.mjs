import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { notificationSettings } from "../lib/contact/notifications.ts";
import { appRequest, cleanFixtures, createFixtures, preflight, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "admin-inquiry-list-fixtures.json");
const labels = ["Zulu", "Bravo", "Echo", "Alpha", "Delta"];
const statuses = ["new", "in_progress", "resolved", "spam", "new"];
let runId = randomUUID();
let context;
let users = [];
let auth;
let staffId = "";
let inquiries = [];
let checkpointWritten = false;
let cleanupAttempted = false;
let cleanupComplete = false;
const BROWSER_HOLD_MS = 120_000;

class HarnessFailure extends Error {
  constructor(label) { super(label); this.name = "HarnessFailure"; this.label = label; }
}

function ensure(condition, label) {
  if (!condition) throw new HarnessFailure(label);
}

function table(client, name) {
  return client.database.schema("public").from(name);
}

function snapshot() {
  return {
    runId,
    users: users.map(({ userId, email, role }) => ({ userId, email, role, runId, sessionId: "" })),
    inquiries: inquiries.map(({ id, requestId, email, index, label, createdAt }) => ({ id, requestId, email, index, label, createdAt })),
  };
}

function checkpointSync() {
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, `${JSON.stringify(snapshot(), null, 2)}\n`, { encoding: "utf8", flag: checkpointWritten ? "w" : "wx" });
  checkpointWritten = true;
}

async function checkpoint() {
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(snapshot(), null, 2)}\n`, { encoding: "utf8", flag: checkpointWritten ? "w" : "wx" });
  checkpointWritten = true;
}

function parseArguments(args) {
  const values = new Set(args);
  ensure([...values].every((value) => value === "--hold-for-browser" || value === "--cleanup"), "invalid_command_line");
  ensure(!(values.has("--hold-for-browser") && values.has("--cleanup")), "invalid_command_line");
  return { holdForBrowser: values.has("--hold-for-browser"), cleanupOnly: values.has("--cleanup") };
}

async function readJson(response, label) {
  try { return await response.json(); } catch { throw new HarnessFailure(label); }
}

async function request(route, token, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", context.appOrigin);
    const { json, ...init } = options;
    return appRequest(context.appOrigin, route, token, { ...init, headers, body: JSON.stringify(json) });
  }
  return appRequest(context.appOrigin, route, token, { ...options, headers });
}

async function setInquiryCapability(enabled) {
  const result = await context.admin.database.schema("public").rpc("set_staff_capability", {
    target_user_id: staffId,
    capability_name: "inquiries.manage",
    enabled,
    reason: `inquiry list fixture ${enabled ? "setup" : "cleanup"} ${runId}`,
  });
  ensure(!result.error, `fixture_capability_${enabled ? "setup" : "cleanup"}_failed`);
}

async function createInquiry(index, label) {
  const requestId = randomUUID();
  const email = `inquiry-list-${runId}-mailneed-${index}@inquiry-list.example`;
  const createdAt = new Date(Date.UTC(2025, 0, 1) + index * 60_000).toISOString();
  const fixture = { id: "", requestId, email, index, label, createdAt };
  inquiries.push(fixture);
  await checkpoint();

  const created = await table(context.admin, "inquiries").insert({
    request_id: requestId,
    name: `INQ-${runId}-${label}`,
    email,
    phone: "",
    subject: `Subject ${runId} ${label} subjectneedle-${index}`,
    message: `Disposable inquiry list fixture ${runId} ${label}`,
    status: "new",
    created_at: createdAt,
  }).select("id,email,request_id,created_at");
  ensure(!created.error && Array.isArray(created.data) && created.data.length === 1, `fixture_inquiry_create_${index}_failed`);
  const row = created.data[0];
  ensure(row.email === email && row.request_id === requestId && new Date(row.created_at).toISOString() === createdAt &&
    /^[0-9a-f-]{36}$/i.test(row.id), `fixture_inquiry_create_${index}_ownership_mismatch`);
  fixture.id = row.id;
  await checkpoint();

  const outbox = await table(context.admin, "inquiry_notifications").insert({ inquiry_id: fixture.id, status: "unconfigured" });
  ensure(!outbox.error, `fixture_notification_create_${index}_failed`);
  const verifiedOutbox = await table(context.admin, "inquiry_notifications").select("inquiry_id,status")
    .eq("inquiry_id", fixture.id).limit(1);
  ensure(!verifiedOutbox.error && verifiedOutbox.data?.length === 1 && verifiedOutbox.data[0].status === "unconfigured",
    `fixture_notification_create_${index}_unverified`);
  await checkpoint();
  return fixture;
}

async function list(token, searchParams) {
  const response = await request(`/api/admin/inquiries?${searchParams}`, token);
  ensure(response.status === 200, `staff_list_failed_${response.status}`);
  const body = await readJson(response, "staff_list_invalid_json");
  ensure(Array.isArray(body.items) && Number.isSafeInteger(body.total), "staff_list_shape_invalid");
  return body;
}

async function updateStatus(fixture, status) {
  if (status === "new") return;
  const detailResponse = await request(`/api/admin/inquiries/${fixture.id}`, auth.staff.appToken);
  ensure(detailResponse.status === 200, "staff_detail_failed");
  const detail = await readJson(detailResponse, "staff_detail_invalid_json");
  ensure(detail.inquiry?.id === fixture.id, "staff_detail_fixture_mismatch");
  const response = await request(`/api/admin/inquiries/${fixture.id}`, auth.staff.appToken, {
    method: "PATCH",
    json: { expectedVersion: detail.inquiry.version, status, note: `Disposable inquiry list status fixture ${runId} ${status}` },
  });
  ensure(response.status === 200, `fixture_status_update_${status}_failed`);
  const body = await readJson(response, `fixture_status_response_${status}_invalid`);
  ensure(body.inquiry?.id === fixture.id && body.inquiry.status === status, `fixture_status_update_${status}_mismatch`);
}

function scopedQuery(overrides = {}) {
  return new URLSearchParams({ q: runId, limit: "50", ...overrides });
}

async function verifyQueries() {
  const noAuth = await request(`/api/admin/inquiries?q=${encodeURIComponent(runId)}&limit=1`, null);
  ensure(noAuth.status === 401, "anonymous_inquiry_list_access_allowed");
  const customer = await request(`/api/admin/inquiries?q=${encodeURIComponent(runId)}&limit=1`, auth.customer.appToken);
  ensure(customer.status === 403, "customer_inquiry_list_access_allowed");

  const invalid = await request(`/api/admin/inquiries?q=${encodeURIComponent(runId)}&sort=other`, auth.staff.appToken);
  ensure(invalid.status === 400, "invalid_sort_was_accepted");

  const all = await list(auth.staff.appToken, scopedQuery());
  assert.equal(all.total, inquiries.length);
  assert.equal(all.items.length, inquiries.length);
  assert.deepEqual(new Set(all.items.map(({ id }) => id)), new Set(inquiries.map(({ id }) => id)));

  for (const [needle, label] of [["alpha", "Alpha"], [`mailneed-${2}`, "Echo"], [`subjectneedle-${3}`, "Alpha"]]) {
    const result = await list(auth.staff.appToken, new URLSearchParams({ q: needle, limit: "10" }));
    assert.equal(result.total, 1, `search ${needle} should match one fixture`);
    assert.equal(result.items[0].id, inquiries.find(({ label: itemLabel }) => itemLabel === label).id);
  }

  for (const [status, expectedCount] of [["new", 2], ["in_progress", 1], ["resolved", 1], ["spam", 1]]) {
    const result = await list(auth.staff.appToken, scopedQuery({ status, limit: "10" }));
    assert.equal(result.total, expectedCount, `status ${status} total`);
    assert.equal(result.items.length, expectedCount, `status ${status} item count`);
    assert.ok(result.items.every((item) => item.status === status), `status ${status} returned an unrelated row`);
  }

  const sorts = [
    ["created_asc", ["Zulu", "Bravo", "Echo", "Alpha", "Delta"]],
    ["created_desc", ["Delta", "Alpha", "Echo", "Bravo", "Zulu"]],
    ["name_asc", ["Alpha", "Bravo", "Delta", "Echo", "Zulu"]],
    ["name_desc", ["Zulu", "Echo", "Delta", "Bravo", "Alpha"]],
  ];
  for (const [sort, expectedLabels] of sorts) {
    const result = await list(auth.staff.appToken, scopedQuery({ sort, limit: "50" }));
    assert.equal(result.total, inquiries.length, `${sort} total`);
    assert.deepEqual(result.items.map(({ id }) => inquiries.find((item) => item.id === id)?.label), expectedLabels, `${sort} order`);
  }

  const pages = [];
  for (const offset of [0, 2, 4, 5]) {
    const result = await list(auth.staff.appToken, scopedQuery({ sort: "name_asc", limit: "2", offset: String(offset) }));
    assert.equal(result.total, inquiries.length, `page ${offset} total`);
    pages.push(...result.items.map(({ id }) => id));
    if (offset === 5) assert.equal(result.items.length, 0, "past-end page should be empty");
  }
  assert.equal(new Set(pages).size, inquiries.length, "pages must not repeat fixtures");
  assert.deepEqual(pages.map((id) => inquiries.find((item) => item.id === id)?.label), ["Alpha", "Bravo", "Delta", "Echo", "Zulu"]);
}

async function cleanup() {
  cleanupAttempted = true;
  for (const fixture of inquiries) {
    const owned = await table(context.admin, "inquiries").select("id,email,request_id")
      .eq("request_id", fixture.requestId).limit(2);
    ensure(!owned.error, "fixture_inquiry_ownership_read_failed");
    ensure(Array.isArray(owned.data) && owned.data.length <= 1, "fixture_request_id_not_unique");
    const row = owned.data?.[0];
    if (!row) continue;
    ensure(row.email === fixture.email && (!fixture.id || row.id === fixture.id), "fixture_inquiry_ownership_mismatch");

    const notes = await table(context.admin, "inquiry_notes").select("id,actor,text").eq("inquiry_id", row.id).limit(20);
    ensure(!notes.error && (notes.data ?? []).every((note) => note.actor === staffId && note.text.includes(runId)), "fixture_note_ownership_mismatch");
    const deletedNotes = await table(context.admin, "inquiry_notes").delete().eq("inquiry_id", row.id);
    ensure(!deletedNotes.error, "fixture_note_cleanup_failed");
    const deletedNotifications = await table(context.admin, "inquiry_notifications").delete().eq("inquiry_id", row.id);
    ensure(!deletedNotifications.error, "fixture_notification_cleanup_failed");
    const deletedInquiry = await table(context.admin, "inquiries").delete().eq("id", row.id).eq("request_id", fixture.requestId);
    ensure(!deletedInquiry.error, "fixture_inquiry_cleanup_failed");
    const remaining = await table(context.admin, "inquiries").select("id").eq("request_id", fixture.requestId).limit(1);
    ensure(!remaining.error && remaining.data?.length === 0, "fixture_inquiry_remains_after_cleanup");
  }
  if (users.length) await cleanFixtures(context, users, runId);
  cleanupComplete = true;
}

async function loadFixtures() {
  let state;
  try { state = JSON.parse(await readFile(fixturePath, "utf8")); } catch { ensure(false, "fixture_file_unavailable"); }
  ensure(state && /^[0-9a-f-]{36}$/i.test(state.runId), "fixture_file_invalid");
  runId = state.runId;
  ensure(Array.isArray(state.users) && state.users.length <= 2, "fixture_users_invalid");
  ensure(Array.isArray(state.inquiries) && state.inquiries.length <= labels.length, "fixture_inquiries_invalid");
  users = state.users;
  inquiries = state.inquiries;
  for (const fixture of users) {
    ensure(fixture.runId === runId && fixture.sessionId === "", "fixture_user_record_invalid");
    await verifyFixtureOwnership(context.clerk, fixture);
  }
  staffId = users.find(({ role }) => role === "staff")?.userId ?? "";
  for (const fixture of inquiries) {
    ensure(Number.isInteger(fixture.index) && fixture.index >= 0 && fixture.index < labels.length &&
      fixture.label === labels[fixture.index] && fixture.email === `inquiry-list-${runId}-mailneed-${fixture.index}@inquiry-list.example` &&
      fixture.createdAt === new Date(Date.UTC(2025, 0, 1) + fixture.index * 60_000).toISOString() &&
      /^[0-9a-f-]{36}$/i.test(fixture.requestId) && (fixture.id === "" || /^[0-9a-f-]{36}$/i.test(fixture.id)), "fixture_inquiry_record_invalid");
  }
}

async function main(options) {
  context = await preflight();
  if (options.cleanupOnly) {
    await loadFixtures();
    await cleanup();
    await unlink(fixturePath);
    console.log("Verified disposable inquiry-list fixtures were removed.");
    return;
  }

  let checkpointExists = false;
  try { await readFile(fixturePath, "utf8"); checkpointExists = true; }
  catch (error) { if (error?.code !== "ENOENT") throw new HarnessFailure("fixture_checkpoint_unavailable"); }
  ensure(!checkpointExists, "fixture_checkpoint_exists_run_cleanup_first");
  ensure(notificationSettings(process.env) === null, "live_email_must_remain_disabled_for_tests");

  checkpointSync();
  try {
    const created = await createFixtures(context.clerk, runId, (fixture) => {
      users.push(fixture);
      checkpointSync();
    });
    users = created.users;
    auth = created.auth;
    staffId = users.find(({ role }) => role === "staff")?.userId ?? "";
    ensure(staffId, "fixture_staff_missing");
    await checkpoint();
    await setInquiryCapability(true);

    for (let index = 0; index < labels.length; index += 1) {
      const fixture = await createInquiry(index, labels[index]);
      await updateStatus(fixture, statuses[index]);
    }
    await verifyQueries();
    console.log("Inquiry list integration assertions passed: search fields, status filters, all sorts, bounded pagination, anonymous/customer denial, and no email send.");

    if (options.holdForBrowser) {
      await checkpoint();
      console.log(`BROWSER_REVIEW_READY: open Admin > Inquiries at ${context.appOrigin}; synthetic fixtures and exact ownership journal are held for 120 seconds, then cleaned automatically.`);
      await new Promise((resolve) => setTimeout(resolve, BROWSER_HOLD_MS));
    }
  } finally {
    await cleanup();
    if (checkpointWritten) await unlink(fixturePath);
  }
}

try {
  await main(parseArguments(process.argv.slice(2)));
} catch (error) {
  const label = typeof error?.label === "string" && /^[a-z0-9_]+$/i.test(error.label) ? error.label :
    typeof error?.code === "string" && /^[A-Z0-9_-]+$/.test(error.code) ? error.code : "unexpected_error";
  const kind = typeof error?.name === "string" && /^[a-z0-9_]+$/i.test(error.name) ? error.name : "Error";
  const line = typeof error?.stack === "string" ? error.stack.match(/admin-inquiry-list-integration\.mjs:(\d+):\d+/)?.[1] : null;
  console.error(`Inquiry list integration stopped safely (${label}/${kind}${line ? `@${line}` : ""}); no provider email was sent.`);
  process.exitCode = 1;
  if (context && users.length && !cleanupComplete && !cleanupAttempted) {
    try {
      await cleanFixtures(context, users, runId);
      if (checkpointWritten) await unlink(fixturePath);
    } catch {
      console.error("Disposable fixture cleanup needs follow-up; preserve the checkpoint file.");
    }
  }
}
