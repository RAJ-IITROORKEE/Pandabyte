import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@insforge/sdk";

import {
  dispatchInquiryNotification,
  notificationSettings,
  parseNotificationRequest,
} from "../lib/contact/notifications.ts";

const key = "a".repeat(64);
const env = {
  INQUIRY_EMAIL_ENABLED: "true",
  INQUIRY_EMAIL_TO: "support@example.com",
  INQUIRY_NOTIFICATION_KEY: key,
};

function databaseWith({ claim = { data: { token: "00000000-0000-4000-8000-000000000001" }, error: null }, begin = { data: true, error: null }, finish = { data: null, error: null } } = {}) {
  const calls = [];
  return {
    calls,
    schema(name) {
      assert.equal(name, "public");
      return {
        async rpc(name, args) {
          calls.push({ name, args });
          if (name === "admin_claim_inquiry_notification") return claim;
          if (name === "begin_inquiry_notification") return begin;
          if (name === "finish_inquiry_notification") return finish;
          assert.fail(`unexpected RPC ${name}`);
        },
      };
    },
  };
}

test("notification configuration is opt-in and bounded", () => {
  assert.deepEqual(notificationSettings(env), { to: "support@example.com", key });
  assert.equal(notificationSettings({ ...env, INQUIRY_EMAIL_ENABLED: "false" }), null);
  assert.equal(notificationSettings({ ...env, INQUIRY_EMAIL_ENABLED: "1" }), null);
  assert.equal(notificationSettings({ ...env, INQUIRY_EMAIL_TO: "" }), null);
  assert.equal(notificationSettings({ ...env, INQUIRY_EMAIL_TO: "support@example.com,other@example.com" }), null);
  assert.equal(notificationSettings({ ...env, INQUIRY_NOTIFICATION_KEY: "short" }), null);
  assert.equal(notificationSettings({ ...env, INQUIRY_NOTIFICATION_KEY: "g".repeat(64) }), null);
});

test("notification requests accept only a positive safe expectedVersion", () => {
  assert.deepEqual(parseNotificationRequest({ expectedVersion: 1 }), { expectedVersion: 1 });
  for (const input of [
    null,
    {},
    { expectedVersion: 0 },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { expectedVersion: "1" },
    { expectedVersion: 1, send: true },
  ]) assert.equal(parseNotificationRequest(input), null);
});

test("dispatch sends once only after claim and begin, then records acceptance", async () => {
  const db = databaseWith();
  let sends = 0;
  const result = await dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000002", 3, key, async () => {
    sends += 1;
    return { data: { accepted: true }, error: null };
  });

  assert.equal(result, "accepted");
  assert.equal(sends, 1);
  assert.deepEqual(db.calls.map(({ name }) => name), [
    "admin_claim_inquiry_notification",
    "begin_inquiry_notification",
    "finish_inquiry_notification",
  ]);
  assert.equal(db.calls[0].args.p_expected_version, 3);
  assert.equal(db.calls[0].args.p_dispatch_key, key);
  assert.equal(db.calls[1].args.p_dispatch_key, key);
  assert.equal(db.calls[2].args.p_outcome, "accepted");
});

test("a documented retryable provider rejection is persisted as failed", async () => {
  const db = databaseWith();
  let sends = 0;
  const result = await dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000003", 1, key, async () => {
    sends += 1;
    return { data: null, error: { statusCode: 429 } };
  });

  assert.equal(result, "failed");
  assert.equal(sends, 1);
  assert.equal(db.calls.at(-1)?.args.p_outcome, "failed");
});

test("an ambiguous sender exception records uncertain and never reports a retryable failure", async () => {
  const db = databaseWith();
  let sends = 0;
  const result = await dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000004", 1, key, async () => {
    sends += 1;
    throw new Error("ambiguous transport timeout");
  });

  assert.equal(result, "uncertain");
  assert.equal(sends, 1);
  assert.equal(db.calls.at(-1)?.args.p_outcome, "uncertain");
});

test("a declined begin suppresses dispatch without invoking the sender", async () => {
  const db = databaseWith({ begin: { data: false, error: null } });
  let sends = 0;
  const result = await dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000005", 1, key, async () => {
    sends += 1;
    return { data: {}, error: null };
  });

  assert.equal(result, "suppressed");
  assert.equal(sends, 0);
  assert.equal(db.calls.some(({ name }) => name === "finish_inquiry_notification"), false);
});

test("a failed begin never reaches the sender", async () => {
  const db = databaseWith({ begin: { data: null, error: { details: "invalid_state" } } });
  let sends = 0;

  await assert.rejects(dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000007", 1, key, async () => {
    sends += 1;
    return { data: {}, error: null };
  }));
  assert.equal(sends, 0);
  assert.deepEqual(db.calls.map(({ name }) => name), ["admin_claim_inquiry_notification", "begin_inquiry_notification"]);
});

test("a database failure after the send is surfaced as an unresolved outcome", async () => {
  const db = databaseWith({ finish: { data: null, error: { details: "backend_unavailable" } } });
  let sends = 0;

  await assert.rejects(dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000008", 1, key, async () => {
    sends += 1;
    return { data: { accepted: true }, error: null };
  }));
  assert.equal(sends, 1);
  assert.equal(db.calls.at(-1)?.args.p_outcome, "accepted");
});

test("a failed claim cannot reach begin or the sender", async () => {
  const db = databaseWith({ claim: { data: null, error: { code: "P0001", details: "forbidden" } } });
  let sends = 0;

  await assert.rejects(dispatchInquiryNotification(db, "00000000-0000-4000-8000-000000000006", 1, key, async () => {
    sends += 1;
    return { data: {}, error: null };
  }));
  assert.equal(sends, 0);
  assert.deepEqual(db.calls.map(({ name }) => name), ["admin_claim_inquiry_notification"]);
});

test("the installed InsForge email SDK does not retry POST after server or network failure", async () => {
  for (const failure of ["http", "network"]) {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      if (failure === "network") throw new TypeError("synthetic connection lost");
      return Response.json({ error: "unavailable" }, { status: 500 });
    };
    const client = createClient({
      baseUrl: "https://notifications.invalid",
      anonKey: "unit-test-only",
      fetch: fetcher,
    });
    await client.emails.send({
      to: "support@example.com",
      from: "PandaByte",
      subject: "Synthetic notification test",
      html: "<p>Fake transport only.</p>",
    });
    assert.equal(calls, 1);
  }
});
