import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@insforge/sdk";
import { dispatchInquiryNotification, notificationSettings } from "../lib/contact/notifications.ts";
import { contactProtection } from "../lib/contact/turnstile.ts";
import { appRequest, cleanFixtures, createFixtures, preflight, verifyFixtureOwnership } from "./phase2-isolation.mjs";

const challengeToken = "XXXX.DUMMY.TOKEN.XXXX";
let runId = randomUUID();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "inquiry-notification-fixtures.json");
const inquiries = [];
let context;
let auth;
let users = [];
let staffId = "";
let cleanupComplete = false;
let cleanupAttempted = false;
let checkpointWritten = false;
let keepFixtures = false;
let fixturesRetained = false;

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.name = "HarnessFailure";
    this.label = label;
  }
}

function ensure(condition, label) {
  if (!condition) throw new HarnessFailure(label);
}

async function readJson(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    assert.fail(label);
  }
  return value;
}

function table(client, name) {
  return client.database.schema("public").from(name);
}

function fixtureSnapshot() {
  return {
    runId,
    users: users.map(({ userId, email, role }) => ({ userId, email, role, runId, sessionId: "" })),
    inquiries: inquiries.map(({ id, requestId, email, label }) => ({ id, requestId, email, label })),
  };
}

function checkpointSync() {
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, `${JSON.stringify(fixtureSnapshot(), null, 2)}\n`, { encoding: "utf8", flag: checkpointWritten ? "w" : "wx" });
  checkpointWritten = true;
}

async function checkpoint() {
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(fixtureSnapshot(), null, 2)}\n`, { encoding: "utf8", flag: checkpointWritten ? "w" : "wx" });
  checkpointWritten = true;
}

function parseArguments(args) {
  const values = new Set(args);
  ensure([...values].every((value) => value === "--keep-fixtures" || value === "--cleanup"), "invalid_command_line");
  ensure(!(values.has("--keep-fixtures") && values.has("--cleanup")), "invalid_command_line");
  return { keep: values.has("--keep-fixtures"), cleanupOnly: values.has("--cleanup") };
}

async function setInquiryCapability(enabled) {
  const result = await context.admin.database.schema("public").rpc("set_staff_capability", {
    target_user_id: staffId,
    capability_name: "inquiries.manage",
    enabled,
    reason: `inquiry notification fixture ${enabled ? "setup" : "recheck"} ${runId}`,
  });
  ensure(!result.error, `fixture_capability_${enabled ? "setup" : "revoke"}_failed`);
}

async function createInquiry(label) {
  const requestId = randomUUID();
  const email = `notify+${Date.now()}-${label}@inquiry-notification.example`;
  const fixture = { id: "", requestId, email, label };
  inquiries.push(fixture);
  await checkpoint();
  const response = await appRequest(context.appOrigin, "/api/contact", null, {
    method: "POST",
    headers: { "content-type": "application/json", origin: context.appOrigin },
    body: JSON.stringify({
      challengeToken,
      name: `Notification fixture ${label}`,
      email,
      phone: "",
      subject: `Notification test ${label}`,
      message: `Disposable notification test fixture ${label}`,
      idempotencyKey: requestId,
    }),
  });
  ensure(response.status === 201, `fixture_contact_create_${label}_failed`);
  const body = await readJson(response, `fixture_contact_response_${label}_invalid`);
  ensure(typeof body.receipt === "string" && body.notificationStatus === "unconfigured", `fixture_contact_receipt_${label}_invalid`);
  fixture.id = body.receipt;
  await checkpoint();
  return fixture;
}

async function getInquiry(fixture) {
  const response = await appRequest(context.appOrigin, `/api/admin/inquiries/${fixture.id}`, auth.staff.appToken);
  ensure(response.status === 200, "staff_inquiry_read_failed");
  const body = await readJson(response, "staff_inquiry_response_invalid");
  ensure(body.inquiry?.id === fixture.id && body.inquiry?.notification, "notification_dto_missing");
  ensure(body.notificationAvailable === false, "disabled_notification_configuration_reported_available");
  return body.inquiry;
}

async function notificationRequest(fixture, token, { origin = context.appOrigin, json = { expectedVersion: 1 } } = {}) {
  const headers = new Headers({ "content-type": "application/json", origin });
  return appRequest(context.appOrigin, `/api/admin/inquiries/${fixture.id}/notification`, token, {
    method: "POST",
    headers,
    body: JSON.stringify(json),
  });
}

async function cleanup() {
  cleanupAttempted = true;
  for (const fixture of inquiries) {
    const owned = await table(context.admin, "inquiries")
      .select("id,email,request_id")
      .eq("request_id", fixture.requestId)
      .order("id", { ascending: true })
      .limit(1);
    ensure(!owned.error, "fixture_inquiry_ownership_check_failed");
    const row = owned.data?.[0];
    if (!row) continue;
    ensure(row.email === fixture.email && (!fixture.id || row.id === fixture.id), "fixture_inquiry_ownership_mismatch");
    for (const name of ["inquiry_notes", "inquiry_notifications"]) {
      const deleted = await table(context.admin, name).delete().eq("inquiry_id", row.id);
      ensure(!deleted.error, `fixture_${name}_cleanup_failed`);
    }
    const deleted = await table(context.admin, "inquiries").delete().eq("id", row.id).eq("request_id", fixture.requestId);
    ensure(!deleted.error, "fixture_inquiry_cleanup_failed");
  }

  if (users.length) await cleanFixtures(context, users, runId);
  cleanupComplete = true;
}

async function loadStoredFixtures() {
  let state;
  try {
    state = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    ensure(false, "fixture_file_unavailable");
  }
  ensure(state && state.runId && /^[0-9a-f-]{36}$/i.test(state.runId), "fixture_file_invalid");
  ensure(Array.isArray(state.users) && state.users.length >= 1 && state.users.length <= 2, "fixture_users_invalid");
  ensure(Array.isArray(state.inquiries) && state.inquiries.length <= 20, "fixture_inquiries_invalid");
  const roles = new Set(state.users.map(({ role }) => role));
  ensure([...roles].every((role) => ["customer", "staff"].includes(role)), "fixture_roles_invalid");
  for (const fixture of state.users) {
    ensure(fixture.runId === state.runId && fixture.sessionId === "", "fixture_user_record_invalid");
    await verifyFixtureOwnership(context.clerk, fixture);
  }
  for (const fixture of state.inquiries) {
    ensure(
      typeof fixture.label === "string" && /^[a-z-]+$/.test(fixture.label) &&
      typeof fixture.requestId === "string" && /^[0-9a-f-]{36}$/i.test(fixture.requestId) &&
      typeof fixture.email === "string" && /^notify\+[0-9]+-[a-z-]+@inquiry-notification\.example$/.test(fixture.email) &&
      (fixture.id === "" || (typeof fixture.id === "string" && /^[0-9a-f-]{36}$/i.test(fixture.id))),
      "fixture_inquiry_record_invalid",
    );
  }
  return state;
}

async function cleanupStoredFixtures() {
  const state = await loadStoredFixtures();
  runId = state.runId;
  users = state.users;
  inquiries.push(...state.inquiries);
  await cleanup();
  await unlink(fixturePath);
}

async function main(options) {
  context = await preflight();
  if (options.cleanupOnly) {
    await cleanupStoredFixtures();
    console.log("Verified disposable inquiry notification fixtures were removed.");
    return;
  }
  let checkpointExists = false;
  try {
    await readFile(fixturePath, "utf8");
    checkpointExists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw new HarnessFailure("fixture_checkpoint_unavailable");
  }
  ensure(!checkpointExists, "fixture_checkpoint_exists_run_cleanup_first");
  keepFixtures = options.keep;
  ensure(contactProtection(process.env)?.testMode === true, "local_turnstile_test_mode_required");
  ensure(/^[0-9a-f]{64}$/.test(process.env.INQUIRY_NOTIFICATION_KEY ?? ""), "scoped_notification_key_required");
  ensure(notificationSettings(process.env) === null, "live_email_must_remain_disabled_for_tests");
  ensure(process.env.INSFORGE_ANON_KEY?.trim(), "development_anonymous_key_required");

  const anonymous = createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY.trim() });
  const created = await createFixtures(context.clerk, runId, (fixture) => {
    users.push(fixture);
    checkpointSync();
  });
  users = created.users;
  auth = created.auth;
  staffId = users.find((user) => user.role === "staff")?.userId ?? "";
  try {
    ensure(staffId, "fixture_staff_missing");
    await checkpoint();
    await setInquiryCapability(true);
    const accessProbe = await anonymous.database.schema("public").rpc("admin_claim_inquiry_notification", {
      p_id: randomUUID(), p_expected_version: 1, p_dispatch_key: process.env.INQUIRY_NOTIFICATION_KEY,
    });
    ensure(accessProbe.error?.code === "42501", "anonymous_notification_claim_allowed");

    const wrongProof = await auth.staff.database.database.schema("public").rpc("admin_claim_inquiry_notification", {
      p_id: randomUUID(), p_expected_version: 1, p_dispatch_key: "0".repeat(64),
    });
    ensure(wrongProof.error?.details === "forbidden" && wrongProof.data === null, "incorrect_notification_proof_accepted");

    const success = await createInquiry("accepted");
    const failed = await createInquiry("retry");
    const uncertain = await createInquiry("uncertain");
    const spam = await createInquiry("spam");
    const spamDuringLease = await createInquiry("spam-during-lease");
    const revoked = await createInquiry("revoked-capability");
    const concurrent = await createInquiry("concurrent");
    const expiredLease = await createInquiry("expired-lease");
    const expiredSending = await createInquiry("expired-sending");
    const maxAttempts = await createInquiry("max-attempts");
    const finishReplay = await createInquiry("finish-replay");

    const anonymousRequest = await notificationRequest(success, null);
    ensure(anonymousRequest.status === 401, "anonymous_notification_api_access_allowed");
    const customer = users.find((user) => user.role === "customer");
    const denied = await notificationRequest(success, customer ? auth.customer.appToken : null);
    ensure(denied.status === 403, "customer_notification_access_allowed");

    const customerClaim = await auth.customer.database.database.schema("public").rpc("admin_claim_inquiry_notification", {
      p_id: success.id, p_expected_version: 1, p_dispatch_key: process.env.INQUIRY_NOTIFICATION_KEY,
    });
    ensure(customerClaim.error?.details === "forbidden" && customerClaim.data === null, "customer_notification_claim_allowed");

    const privateConfig = await anonymous.database.schema("public").from("inquiry_notification_config").select("singleton,key_hash").limit(1);
    ensure(privateConfig.error?.code === "42501", "anonymous_notification_config_read_allowed");

    const crossOrigin = await notificationRequest(success, auth.staff.appToken, { origin: "https://invalid.example" });
    ensure(crossOrigin.status === 403, "cross_origin_notification_request_allowed");

    const forgedBody = await notificationRequest(success, auth.staff.appToken, { json: { expectedVersion: 1, dispatchKey: "0".repeat(64) } });
    ensure(forgedBody.status === 400, "client_dispatch_key_accepted");

    const disabled = await notificationRequest(success, auth.staff.appToken);
    ensure(disabled.status === 503, "disabled_notification_configuration_did_not_fail_closed");
    const unchanged = await getInquiry(success);
    ensure(unchanged.notification.status === "unconfigured" && unchanged.notification.attempts === 0, "disabled_request_claimed_notification");

    const key = process.env.INQUIRY_NOTIFICATION_KEY;
    const dispatch = (fixture, expectedVersion, send) => dispatchInquiryNotification(auth.staff.database.database, fixture.id, expectedVersion, key, send);
    const claimLease = async (fixture) => {
      const detail = await getInquiry(fixture);
      const result = await auth.staff.database.database.schema("public").rpc("admin_claim_inquiry_notification", {
        p_id: fixture.id,
        p_expected_version: detail.notification.version,
        p_dispatch_key: key,
      });
      ensure(!result.error && typeof result.data?.token === "string", "fixture_notification_claim_failed");
      return result.data.token;
    };

    const revokedToken = await claimLease(revoked);
    await setInquiryCapability(false);
    try {
      const beginAfterRevoke = await auth.staff.database.database.schema("public").rpc("begin_inquiry_notification", {
        p_id: revoked.id,
        p_token: revokedToken,
        p_dispatch_key: key,
      });
      ensure(beginAfterRevoke.error?.details === "forbidden" && beginAfterRevoke.data === null, "revoked_capability_crossed_send_boundary");
    } finally {
      await setInquiryCapability(true);
    }

    let sends = 0;
    const initial = await getInquiry(success);
    assert.equal(await dispatch(success, initial.notification.version, async () => {
      sends += 1;
      return { data: { accepted: true }, error: null };
    }), "accepted");
    let current = await getInquiry(success);
    ensure(current.notification.status === "accepted" && current.notification.attempts === 1, "accepted_notification_not_persisted");
    assert.equal(sends, 1);

    const failedInitial = await getInquiry(failed);
    assert.equal(await dispatch(failed, failedInitial.notification.version, async () => ({ data: null, error: { statusCode: 429 } })), "failed");
    current = await getInquiry(failed);
    ensure(current.notification.status === "failed" && current.notification.attempts === 1, "definite_failure_not_persisted");
    assert.equal(await dispatch(failed, current.notification.version, async () => ({ data: { accepted: true }, error: null })), "accepted");
    current = await getInquiry(failed);
    ensure(current.notification.status === "accepted" && current.notification.attempts === 2, "failed_notification_retry_not_persisted");

    let uncertainSends = 0;
    const uncertainInitial = await getInquiry(uncertain);
    assert.equal(await dispatch(uncertain, uncertainInitial.notification.version, async () => {
      uncertainSends += 1;
      throw new Error("synthetic ambiguous transport timeout");
    }), "uncertain");
    current = await getInquiry(uncertain);
    ensure(current.notification.status === "uncertain" && current.notification.attempts === 1, "ambiguous_send_not_persisted_uncertain");
    try {
      await dispatch(uncertain, current.notification.version, async () => {
        uncertainSends += 1;
        return { data: { accepted: true }, error: null };
      });
    } catch {
      // A terminal-state conflict is expected; the sender must remain untouched.
    }
    assert.equal(uncertainSends, 1, "uncertain_notification_was_retried");

    const spamInitial = await getInquiry(spam);
    const markSpam = await appRequest(context.appOrigin, `/api/admin/inquiries/${spam.id}`, auth.staff.appToken, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: context.appOrigin },
      body: JSON.stringify({ expectedVersion: spamInitial.version, status: "spam", note: "Synthetic spam fixture" }),
    });
    ensure(markSpam.status === 200, "fixture_spam_update_failed");
    current = await getInquiry(spam);
    ensure(current.notification.status === "suppressed", "spam_did_not_suppress_notification");
    let spamSends = 0;
    try {
      await dispatch(spam, current.notification.version, async () => {
        spamSends += 1;
        return { data: { accepted: true }, error: null };
      });
    } catch {
      // A suppressed notification may reject at claim time.
    }
    assert.equal(spamSends, 0, "spam_notification_reached_sender");

    const leasedToken = await claimLease(spamDuringLease);
    current = await getInquiry(spamDuringLease);
    const markClaimedSpam = await appRequest(context.appOrigin, `/api/admin/inquiries/${spamDuringLease.id}`, auth.staff.appToken, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: context.appOrigin },
      body: JSON.stringify({ expectedVersion: current.version, status: "spam", note: "Suppress claimed fixture before send" }),
    });
    ensure(markClaimedSpam.status === 200, "fixture_claimed_spam_update_failed");
    const suppressedBegin = await auth.staff.database.database.schema("public").rpc("begin_inquiry_notification", {
      p_id: spamDuringLease.id,
      p_token: leasedToken,
      p_dispatch_key: key,
    });
    ensure(!suppressedBegin.error && suppressedBegin.data === false, "spam_claim_crossed_send_boundary");

    let concurrentSends = 0;
    const concurrentInitial = await getInquiry(concurrent);
    const race = await Promise.allSettled([
      dispatch(concurrent, concurrentInitial.notification.version, async () => {
        concurrentSends += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { data: { accepted: true }, error: null };
      }),
      dispatch(concurrent, concurrentInitial.notification.version, async () => {
        concurrentSends += 1;
        return { data: { accepted: true }, error: null };
      }),
    ]);
    ensure(race.filter((result) => result.status === "fulfilled" && result.value === "accepted").length === 1, "concurrent_notification_claim_not_single_winner");
    assert.equal(concurrentSends, 1, "concurrent_workers_sent_duplicate_email");

    let fakeSendCount = 0;
    let finishArgs;
    const observedDatabase = {
      schema(name) {
        const scoped = auth.staff.database.database.schema(name);
        return {
          async rpc(rpcName, args) {
            const result = await scoped.rpc(rpcName, args);
            if (rpcName === "finish_inquiry_notification") finishArgs = args;
            return result;
          },
        };
      },
    };
    const finishInitial = await getInquiry(finishReplay);
    assert.equal(await dispatchInquiryNotification(observedDatabase, finishReplay.id, finishInitial.notification.version, key, async () => {
      fakeSendCount += 1;
      return { data: { accepted: true }, error: null };
    }), "accepted");
    ensure(finishArgs, "finish_rpc_arguments_not_observed");
    const replayFinish = await auth.staff.database.database.schema("public").rpc("finish_inquiry_notification", finishArgs);
    ensure(!replayFinish.error, "duplicate_finish_replay_not_idempotent");
    current = await getInquiry(finishReplay);
    ensure(current.notification.status === "accepted" && current.notification.attempts === 1, "duplicate_finish_replay_changed_state");
    assert.equal(fakeSendCount, 1, "finish_replay_repeated_fake_send");

    let maxAttemptSends = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      current = await getInquiry(maxAttempts);
      assert.equal(await dispatch(maxAttempts, current.notification.version, async () => {
        maxAttemptSends += 1;
        return { data: null, error: { statusCode: 429 } };
      }), "failed");
    }
    current = await getInquiry(maxAttempts);
    ensure(current.notification.status === "failed" && current.notification.attempts === 5, "notification_attempt_limit_not_recorded");
    try {
      await dispatch(maxAttempts, current.notification.version, async () => {
        maxAttemptSends += 1;
        return { data: { accepted: true }, error: null };
      });
    } catch {
      // The fifth failed attempt is terminal for automatic/manual dispatch.
    }
    assert.equal(maxAttemptSends, 5, "notification_attempt_limit_exceeded");

    await claimLease(expiredLease);
    const expirePreSend = await table(context.admin, "inquiry_notifications")
      .update({ lease_until: new Date(Date.now() - 1_000).toISOString() })
      .eq("inquiry_id", expiredLease.id);
    ensure(!expirePreSend.error, "fixture_pre_send_lease_expiry_failed");
    current = await getInquiry(expiredLease);
    ensure(current.notification.status === "unconfigured", "expired_pre_send_lease_not_mapped_to_reclaimable_state");
    assert.equal(await dispatch(expiredLease, current.notification.version, async () => ({ data: { accepted: true }, error: null })), "accepted");

    const sendingToken = await claimLease(expiredSending);
    const begin = await auth.staff.database.database.schema("public").rpc("begin_inquiry_notification", {
      p_id: expiredSending.id,
      p_token: sendingToken,
      p_dispatch_key: key,
    });
    ensure(!begin.error && begin.data === true, "fixture_begin_sending_failed");
    const expireDuringSend = await table(context.admin, "inquiry_notifications")
      .update({ lease_until: new Date(Date.now() - 1_000).toISOString() })
      .eq("inquiry_id", expiredSending.id);
    ensure(!expireDuringSend.error, "fixture_sending_lease_expiry_failed");
    current = await getInquiry(expiredSending);
    ensure(current.notification.status === "uncertain", "expired_sending_state_not_reported_uncertain");
    let expiredSends = 0;
    try {
      await dispatch(expiredSending, current.notification.version, async () => {
        expiredSends += 1;
        return { data: { accepted: true }, error: null };
      });
    } catch {
      // A sending lease that expired has an unknown provider outcome and cannot be retried.
    }
    assert.equal(expiredSends, 0, "expired_sending_lease_was_retried");

    console.log("Inquiry notification development assertions passed: private RPC boundary, disabled API, fake-send persistence, retry and uncertainty rules, spam suppression, concurrent claim, and lease expiry.");
    if (keepFixtures) {
      await checkpoint();
      fixturesRetained = true;
      console.log("Synthetic notification states were checkpointed for browser review; only fake sender results were used.");
    }
  } finally {
    if (!fixturesRetained) {
      await cleanup();
      if (checkpointWritten) await unlink(fixturePath);
    }
  }
}

try {
  await main(parseArguments(process.argv.slice(2)));
} catch (error) {
  const label = typeof error?.label === "string" && /^[a-z0-9_]+$/i.test(error.label)
    ? error.label
    : typeof error?.code === "string" && /^[a-z0-9_]+$/i.test(error.code)
      ? error.code
      : "unexpected_error";
  const kind = typeof error?.name === "string" && /^[a-z0-9_]+$/i.test(error.name) ? error.name : "Error";
  const line = typeof error?.stack === "string" ? error.stack.match(/inquiry-notifications\.mjs:(\d+):\d+/)?.[1] : null;
  console.error(`Inquiry notification test stopped safely (${label}/${kind}${line ? `@${line}` : ""}); no provider email was sent.`);
  process.exitCode = 1;
  if (context && users.length && !cleanupComplete && !cleanupAttempted && !fixturesRetained) {
    try {
      await cleanFixtures(context, users, runId);
      if (checkpointWritten) await unlink(fixturePath);
    } catch {
      console.error("Disposable user cleanup needs follow-up.");
    }
  }
}
