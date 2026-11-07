// Read-only supported API metadata. This probe never sends a prompt or authorizes inference.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

assert.equal(process.argv.length, 2, 'no_probe_arguments');
const key = process.env.OPENROUTER_API_KEY;
assert.ok(typeof key === 'string' && key.length >= 32 && key.length <= 4096 && !/[\r\n]/.test(key), 'existing_server_key_required');
const model = 'xingchen-agi/xing4.0-29b-a4b:free';
const provider = 'phala';
const deadline = AbortSignal.timeout(10000);
const observations = [];
async function get(path, authenticated = false) {
  const response = await fetch('https://openrouter.ai/api/v1' + path, {
    method: 'GET', headers: { Accept: 'application/json', ...(authenticated ? { Authorization: 'Bearer ' + key } : {}) },
    redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline,
  });
  const observation = { path, authenticated, status: response.status };
  observations.push(observation);
  assert.ok(!response.redirected && /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''), 'unexpected_metadata_response');
  assert.ok(response.body, 'missing_metadata_body');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length; assert.ok(bytes <= 4_000_000, 'metadata_body_limit'); chunks.push(part.value);
    }
    const raw = Buffer.concat(chunks);
    observation.sha256 = createHash('sha256').update(raw).digest('hex');
    return { ok: response.ok, body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) };
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const report = { date: new Date().toISOString(), scope: 'supported GET metadata with existing inference key; no account login', observations,
  inferenceRequests: 0, accountSettingsChanged: false, credentialsPrinted: false, strictZdr: 'unverified', inferenceAuthorized: false };
try {
  const current = await get('/key', true);
  assert.ok(current.ok && current.body?.data && typeof current.body.data === 'object', 'key_metadata_unavailable');
  const data = current.body.data;
  report.key = { authenticated: true,
    managementFieldReported: typeof data.is_management_key === 'boolean',
    management: typeof data.is_management_key === 'boolean' ? data.is_management_key : null,
    workspaceAssignmentFieldReported: Object.hasOwn(data, 'workspace_id'),
    workspaceBound: typeof data.workspace_id === 'string' && data.workspace_id.length > 0 ? true : data.workspace_id === null ? false : null,
    workspaceIdExposed: false,
    freeRequestsRemaining: Number.isSafeInteger(data.free_model_daily_requests?.remaining) ? data.free_model_daily_requests.remaining : null,
    strictPolicyFields: Object.keys(data).filter(name => /zdr|safety_retention|privacy|logging/.test(name)) };
  const allowed = await get('/models/user', true);
  assert.ok(allowed.ok && Array.isArray(allowed.body?.data) && allowed.body.data.length <= 1000, 'user_catalog_unavailable');
  report.eligibility = { model, present: allowed.body.data.some(item => item.id === model), models: allowed.body.data.length,
    establishesStrictZdr: false };
  const listed = await get('/models/' + model + '/endpoints');
  assert.ok(listed.ok && Array.isArray(listed.body?.data?.endpoints) && listed.body.data.endpoints.length <= 100, 'endpoint_catalog_unavailable');
  const endpoints = listed.body.data.endpoints.filter(row => row.tag === provider);
  const zdr = await get('/endpoints/zdr');
  assert.ok(zdr.ok && Array.isArray(zdr.body?.data) && zdr.body.data.length <= 5000, 'zdr_catalog_unavailable');
  const matches = zdr.body.data.filter(row => row.model_id === model && row.tag === provider);
  report.candidate = { model, provider, endpoints: endpoints.length, zdrRows: matches.length,
    safetyRetentionExplicitlyFalse: matches.length === 1 && matches[0].safety_retention === false,
    tokenPricesZero: endpoints.length === 1 && endpoints[0].pricing?.prompt === '0' && endpoints[0].pricing?.completion === '0',
    optionalPriceFields: Object.fromEntries(['request', 'image'].map(name => [name, endpoints.length === 1 ? endpoints[0].pricing?.[name] ?? 'not_reported' : 'not_reported'])),
    textOnlyFreeVariant: { documentaryNoBilling: model.endsWith(':free'), source: 'https://openrouter.ai/collections/free-models',
      constraints: 'Exact free model; pinned currently verified ZDR provider; no fallback, tools, plugins or nontext input; zero provider max_price ceilings and actual returned cost zero required before acceptance',
      absentFieldsAreExplicitZero: false },
    establishesEffectiveKeyPolicy: false };
  report.reason = 'Exact public ZDR/safety_retention:false provider metadata supports the candidate endpoint policy. The supported key response reports workspace assignment but not effective input/output logging, data-discount logging or broadcast exclusions. Workspace policy inspection requires a management key; known inaccessible routes are not retried. Missing image/request prices are not a separate text-only :free no-billing blocker.';
  report.result = 'observed_blocked';
} catch {
  report.result = 'unavailable_blocked'; report.reason = 'Required supported metadata could not be validated; no inference attempted.';
}
assert.equal(report.inferenceRequests, 0);
assert.equal(report.inferenceAuthorized, false);
assert.equal(JSON.stringify(report).includes(key), false, 'credential_projection_failed');
const path = 'docs/agent-experience-upgrade/provider-policy-verification.json';
const existing = JSON.parse(await readFile(path, 'utf8'));
existing.keyOnlySupportedProbe = report;
await writeFile(path, JSON.stringify(existing, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.result !== 'observed_blocked') process.exitCode = 1;
