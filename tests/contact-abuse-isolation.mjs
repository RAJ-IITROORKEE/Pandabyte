import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@insforge/sdk";
import { contactProtection } from "../lib/contact/turnstile.ts";
import { preflight } from "./phase2-isolation.mjs";

const CHALLENGE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const email = `contact-check-${Date.now()}@contact-abuse.example`;
const requestIds = new Set();
const context = await preflight();
assert.equal(contactProtection(process.env)?.testMode, true, "isolated local Turnstile test configuration is required");
const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
assert.ok(anonKey, "development anonymous key is required");

const anon = createClient({
  baseUrl: context.baseUrl,
  anonKey,
  fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
});

function inquiry(index, idempotencyKey = randomUUID()) {
  requestIds.add(idempotencyKey);
  return {
    name: "Disposable inquiry check",
    email,
    phone: "",
    subject: `Abuse-protection check ${index}`,
    message: `Synthetic development inquiry ${index}`,
    idempotencyKey,
    challengeToken: CHALLENGE_TOKEN,
  };
}

async function rpc(client, name, args) {
  try {
    return await client.database.schema("public").rpc(name, args);
  } catch {
    return { data: null, error: true };
  }
}

async function submit(input) {
  return fetch(new URL("/api/contact", context.appOrigin), {
    method: "POST",
    headers: { "content-type": "application/json", origin: context.appOrigin },
    body: JSON.stringify(input),
  });
}

async function body(response) {
  try {
    return await response.json();
  } catch {
    assert.fail("contact endpoint returned invalid JSON");
  }
}

async function cleanup() {
  const ids = [...requestIds];
  if (!ids.length) return;
  const inquiries = context.admin.database.schema("public").from("inquiries");
  const found = await inquiries.select("id,request_id,email").eq("email", email).in("request_id", ids).order("id", { ascending: true }).limit(ids.length);
  assert.equal(found.error, null, "fixture discovery failed");
  const inquiryIds = (found.data ?? []).map((row) => row.id);
  if (!inquiryIds.length) return;
  const notes = await context.admin.database.schema("public").from("inquiry_notes").delete().in("inquiry_id", inquiryIds);
  assert.equal(notes.error, null, "fixture note cleanup failed");
  const notifications = await context.admin.database.schema("public").from("inquiry_notifications").delete().in("inquiry_id", inquiryIds);
  assert.equal(notifications.error, null, "fixture notification cleanup failed");
  const removed = await inquiries.delete().in("id", inquiryIds);
  assert.equal(removed.error, null, "fixture inquiry cleanup failed");
  const remaining = await inquiries.select("id").eq("email", email).in("request_id", ids).order("id", { ascending: true }).limit(ids.length);
  assert.equal(remaining.error, null, "fixture cleanup verification failed");
  assert.equal(remaining.data?.length, 0, "synthetic contact fixtures remain after cleanup");
}

const directProbeId = randomUUID();
requestIds.add(directProbeId);
const args = {
  p_name: "Disposable inquiry check",
  p_email: email,
  p_phone: "",
  p_subject: "Direct submission protection check",
  p_message: "Synthetic direct submission probe",
  p_request_id: directProbeId,
};

try {
  const missingChallenge = inquiry("missing challenge");
  delete missingChallenge.challengeToken;
  assert.equal((await submit(missingChallenge)).status, 400, "missing challenge token must be rejected before database access");

  const invalidChallenge = inquiry("invalid challenge");
  invalidChallenge.challengeToken = "not-a-valid-turnstile-token";
  assert.equal((await submit(invalidChallenge)).status, 403, "invalid challenge token must be rejected");

  const forgedProof = { ...inquiry("forged proof"), submissionKey: "0".repeat(64) };
  assert.equal((await submit(forgedProof)).status, 400, "client-supplied submission proof must be rejected");

  const legacy = await rpc(anon, "submit_inquiry", args);
  assert.equal(legacy.error?.code, "42501", "legacy inquiry RPC must be unavailable to anonymous clients");

  const secretRead = await anon.database.schema("public").from("contact_submission_config").select("singleton,key_hash").limit(1);
  assert.equal(secretRead.error?.code, "42501", "anonymous clients must not read submission configuration");

  const wrongProof = await rpc(anon, "submit_verified_inquiry", {
    ...args,
    p_submission_key: "0".repeat(64),
  });
  assert.equal(wrongProof.error?.code, "P0001", "incorrect submission proof must be rejected by the database function");
  assert.equal(wrongProof.error?.details, "forbidden", "incorrect proof must not reveal whether configuration exists");
  assert.equal(wrongProof.data, null, "incorrect proof must not return a receipt");

  const submissions = Array.from({ length: 5 }, (_, index) => ({ input: inquiry(index) }));
  const concurrent = await Promise.all([
    submit(submissions[0].input),
    submit(submissions[0].input),
    ...submissions.slice(1).map(({ input }) => submit(input)),
  ]);
  const results = await Promise.all(concurrent.map(async (response) => {
    assert.equal(response.status, 201, "valid challenged guest inquiry should save");
    const result = await body(response);
    assert.deepEqual(Object.keys(result).sort(), ["notificationStatus", "receipt"]);
    assert.match(result.receipt, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    return result;
  }));
  submissions.forEach((submission, index) => { submission.result = results[index === 0 ? 0 : index + 1]; });
  assert.equal(results[0].receipt, results[1].receipt, "concurrent request retries must return one receipt");
  assert.equal(new Set(results.map(({ receipt }) => receipt)).size, 5, "five distinct request IDs must create five inquiries");

  const replay = await submit(submissions[0].input);
  assert.equal(replay.status, 201, "same challenged request should be safely retryable");
  assert.equal((await body(replay)).receipt, submissions[0].result.receipt, "idempotent retry must return the original receipt");

  const collision = await submit({ ...submissions[0].input, message: "Changed synthetic payload" });
  assert.equal(collision.status, 409, "reused request ID with changed payload must conflict");

  const sixth = await submit(inquiry("sixth"));
  assert.equal(sixth.status, 429, "per-email limit must still apply after challenge verification");

} finally {
  await cleanup();
}

console.log("Contact abuse boundary assertions passed: RPC/config isolation, invalid proof/challenge denial, concurrent guest idempotency, email quota and fixture cleanup.");
