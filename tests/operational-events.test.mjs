import assert from "node:assert/strict";
import test from "node:test";
import { onRequestError } from "../instrumentation.ts";
import { buildOperationalEvent, logOperationalFailure, operationalJson } from "../lib/observability/events.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_KEYS = ["area", "event", "reference", "schemaVersion", "status", "timestamp"];

async function captureLogs(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args);
  try {
    return { value: await run(), lines };
  } finally {
    console.error = original;
  }
}

function readEvent(lines, index = 0) {
  assert.equal(lines.length > index, true, "expected a diagnostic event");
  assert.equal(lines[index].length, 1, "logger writes one structured value");
  assert.equal(typeof lines[index][0], "string");
  return JSON.parse(lines[index][0]);
}

function hostileObject(label) {
  return new Proxy({}, {
    get() { throw new Error(`${label} getter was read`); },
    getOwnPropertyDescriptor() { throw new Error(`${label} descriptor was read`); },
    ownKeys() { throw new Error(`${label} keys were read`); },
  });
}

function assertClosedEvent(event, { kind, area, status }) {
  assert.deepEqual(Object.keys(event).sort(), EVENT_KEYS);
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.event, kind);
  assert.equal(event.area, area);
  assert.equal(event.status, status);
  assert.match(event.reference, UUID);
  assert.equal(Number.isNaN(Date.parse(event.timestamp)), false);
  assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
}

test("buildOperationalEvent keeps a closed allowlisted event schema", () => {
  const event = buildOperationalEvent("storage_cleanup_failure", "account_files", 503);
  assertClosedEvent(event, { kind: "storage_cleanup_failure", area: "account_files", status: 503 });

  const invalid = buildOperationalEvent("private-provider-message", "customer-123", 200);
  assertClosedEvent(invalid, { kind: "uncaught_failure", area: "unknown", status: 500 });
});

test("operationalJson logs one redacted matching reference for a 5xx and preserves the response", async () => {
  const body = { error: { code: "backend_unavailable", message: "Try again" }, diagnosticSentinel: "body-private-sentinel" };
  const { value: response, lines } = await captureLogs(() => operationalJson(body, 503, {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    Location: "/account/settings",
    "X-Error-Reference": "attacker-controlled-reference",
    "X-Provider-Diagnostic": "provider-secret-sentinel",
    "X-Sensitive-Header": "header-private-sentinel",
  }, "account_profile"));

  assert.equal(response.status, 503);
  const responseBody = await response.json();
  assert.deepEqual(responseBody, body);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("location"), "/account/settings");

  const event = readEvent(lines);
  assertClosedEvent(event, { kind: "api_failure", area: "account_profile", status: 503 });
  assert.equal(response.headers.get("x-error-reference"), event.reference);
  assert.notEqual(response.headers.get("x-error-reference"), "attacker-controlled-reference");
  assert.equal(JSON.stringify(responseBody).includes(event.reference), false, "reference stays out of the response body/UI");
  const logText = lines.flat().join(" ");
  for (const secret of ["body-private-sentinel", "provider-secret-sentinel", "header-private-sentinel", "/account/settings"]) {
    assert.equal(logText.includes(secret), false, `log must not contain ${secret}`);
  }
});

test("each operational response gets a fresh reference and exactly one event", async () => {
  const { value: responses, lines } = await captureLogs(async () => [
    operationalJson({ error: { code: "backend_unavailable" } }, 503, {}, "cart"),
    operationalJson({ error: { code: "backend_unavailable" } }, 500, {}, "cart"),
  ]);

  assert.equal(lines.length, 2);
  const events = [readEvent(lines, 0), readEvent(lines, 1)];
  assert.equal(responses[0].headers.get("x-error-reference"), events[0].reference);
  assert.equal(responses[1].headers.get("x-error-reference"), events[1].reference);
  assert.notEqual(events[0].reference, events[1].reference);
  for (const event of events) assertClosedEvent(event, { kind: "api_failure", area: "cart", status: event.status });
});

test("success, routine 4xx, and expected unavailable responses are silent and remove stale references", async () => {
  const { value: responses, lines } = await captureLogs(async () => [
    operationalJson({ ok: true }, 200, { "X-Error-Reference": "stale-success" }, "catalog"),
    operationalJson({ error: { code: "invalid_input" } }, 400, { "X-Error-Reference": "stale-client-error" }, "editorial"),
    operationalJson({ error: { code: "contact_unconfigured" } }, 503, { "X-Error-Reference": "stale-held-error" }, "editorial", true),
  ]);

  assert.equal(lines.length, 0);
  for (const response of responses) assert.equal(response.headers.get("x-error-reference"), null);
  assert.equal(responses[2].status, 503);
  assert.deepEqual(await responses[2].json(), { error: { code: "contact_unconfigured" } });
});

test("untrusted labels are rejected without coercion", async () => {
  const hostile = hostileObject("label");
  const event = buildOperationalEvent(hostile, hostile, hostile);
  assertClosedEvent(event, { kind: "uncaught_failure", area: "unknown", status: 500 });

  const { value: response, lines } = await captureLogs(() => operationalJson({}, 503, {}, hostile));
  assert.equal(response.status, 503);
  assertClosedEvent(readEvent(lines), { kind: "api_failure", area: "unknown", status: 503 });
});

test("logging failure does not alter the business response", async () => {
  const original = console.error;
  console.error = () => { throw new Error("console output unavailable"); };
  try {
    const response = operationalJson({ error: { code: "backend_unavailable" } }, 503, {}, "admin_records");
    assert.equal(response.status, 503);
    assert.match(response.headers.get("x-error-reference"), UUID);
    assert.deepEqual(await response.json(), { error: { code: "backend_unavailable" } });
  } finally {
    console.error = original;
  }
});

test("onRequestError ignores raw error/request fields and logs only the safe route type", async () => {
  const { lines } = await captureLogs(() => onRequestError(
    hostileObject("raw error"),
    hostileObject("raw request"),
    new Proxy({}, {
      get(_target, key) {
        if (key === "routeType") return "action";
        throw new Error(`context ${String(key)} was read`);
      },
    }),
  ));

  const line = lines.flat().join(" ");
  assert.equal(line.includes("raw error"), false);
  assert.equal(line.includes("raw request"), false);
  assert.equal(line.includes("context"), false);
  assertClosedEvent(readEvent(lines), { kind: "uncaught_failure", area: "action", status: 500 });
});

test("direct operational logging accepts the cleanup event categories without payloads", async () => {
  const { value: references, lines } = await captureLogs(async () => [
    logOperationalFailure("storage_cleanup_failure", "account_files", 500),
    logOperationalFailure("editorial_cleanup_failure", "editorial", 502),
  ]);

  assert.equal(lines.length, 2);
  for (const [index, kind] of ["storage_cleanup_failure", "editorial_cleanup_failure"].entries()) {
    const event = readEvent(lines, index);
    assert.equal(references[index], event.reference);
    assert.match(references[index], UUID);
    assert.equal(event.event, kind);
  }
});
