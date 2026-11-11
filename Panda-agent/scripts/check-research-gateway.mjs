// D3 opt-in live gate: app client -> research API -> relay -> host service, plus a deny matrix. Makes no provider
// call unless --real is given (then one turn per listed profile, which needs a current host attestation).
// Usage: node --conditions=react-server Panda-agent/scripts/check-research-gateway.mjs --live <endpoint> <callerRoleArn> [--real haiku,luna,terra]
// Env: VERCEL_OIDC_TOKEN (development), PANDA_RESEARCH_DISPATCH_KEY, PANDA_RESEARCH_RESULT_KEY (base64 32 B). Prints no secret.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createResearchGatewayClient } from '../src/server/research-gateway-client.ts';
import { signDispatch, researchSubjectHash, researchPromptHash } from '../src/server/research-envelopes.ts';

const [flag, endpoint, roleArn] = process.argv.slice(2), realIndex = process.argv.indexOf('--real');
if (flag !== '--live' || !endpoint || !roleArn) throw Error('usage: --live <endpoint> <callerRoleArn> [--real haiku,luna,terra]');
const key = name => { const b = Buffer.from(process.env[name] ?? '', 'base64'); assert.equal(b.length, 32, name); return b; };
const dispatchKey = key('PANDA_RESEARCH_DISPATCH_KEY'), resultKey = key('PANDA_RESEARCH_RESULT_KEY');
const roleCreds = awsCredentialsProvider({ roleArn, durationSeconds: 900, clientConfig: { region: 'ap-south-1' } });
const client = createResearchGatewayClient({ endpoint, roleArn, dispatchKey, resultKey, credentials: roleCreds });
const url = new URL(endpoint), checks = [], log = (name, extra = '') => { checks.push(name); console.log('PASS', name, extra); };
const subject = 'user_gate_' + randomUUID(), secs = () => Math.floor(Date.now() / 1000);
const input = (over = {}) => ({ subject, chatId: randomUUID(), requestId: randomUUID(), profile: 'tavily-hosted-haiku', prompt: 'Which interfaces does the RP2040 PIO support?', ...over });

// Raw signed POST (for deny cases the production client refuses to build).
async function raw(credentials, path, body, headers = { 'content-type': 'application/json', accept: 'application/json' }) {
  const signer = new SignatureV4({ service: 'execute-api', region: 'ap-south-1', sha256: Sha256, credentials });
  const signed = credentials ? (await signer.sign(new HttpRequest({ protocol: 'https:', hostname: url.hostname, method: 'POST', path, headers: { ...headers, host: url.hostname }, body }))).headers : headers;
  const res = await fetch('https://' + url.hostname + path, { method: 'POST', headers: signed, body, redirect: 'error' });
  return { status: res.status, text: (await res.text()).slice(0, 200) };
}
const envelope = (action, i, over = {}) => { const d = { v: 1, action, subjectHash: researchSubjectHash(i.subject), chatId: i.chatId, requestId: i.requestId, profile: i.profile, modelId: 'anthropic/claude-haiku-5.5', promptHash: researchPromptHash(i.prompt), exp: secs() + 50, ...over };
  return { dispatch: d, mac: signDispatch(dispatchKey, d, secs()) }; };

// Reachability through the full path, no provider call.
const fresh = input();
assert.deepEqual(await client.status(fresh), { state: 'not_found' }); log('signed_status_unknown_id_reaches_host_404');
const t = Date.now(), first = await client.turn(fresh);
assert.equal(first.state, 'failed'); log('signed_turn_returns_verified_result', JSON.stringify({ state: first.state, reason: first.reason, calls: first.usage?.calls, ms: Date.now() - t }));
const replay = await client.turn(fresh); assert.deepEqual(replay, first); log('same_request_replays_stored_result');
assert.deepEqual(await client.status(fresh), first); log('status_returns_same_signed_result');
assert.deepEqual(await client.status({ ...fresh, subject: 'user_other_' + randomUUID() }), { state: 'not_found' }); log('other_subject_cannot_read_request');
assert.deepEqual(await client.turn({ ...fresh, prompt: 'A different question about RP2040 UART?' }), { state: 'conflict' }); log('different_prompt_same_request_conflicts');

// Deny matrix.
const creds = await roleCreds(), turnPath = url.pathname.replace(/\/$/, '') + '/v1/research/turns';
const body = JSON.stringify({ ...envelope('turn', fresh), prompt: fresh.prompt }), ndjson = { 'content-type': 'application/json', accept: 'application/x-ndjson' };
assert.equal((await raw(null, turnPath, body, ndjson)).status, 403); log('unsigned_request_denied');
const root = JSON.parse(execFileSync('aws', ['configure', 'export-credentials', '--profile', 'datumm', '--format', 'process'], { encoding: 'utf8' }));
const rootCreds = { accessKeyId: root.AccessKeyId, secretAccessKey: root.SecretAccessKey, sessionToken: root.SessionToken };
// The account-root session is not stopped by the API principal deny (same on the existing API); the relay caller check refuses it (503, not forwarded).
const rootStatus = (await raw(rootCreds, turnPath, body, ndjson)).status; assert.ok([403, 503].includes(rootStatus)); log('other_principal_not_forwarded', String(rootStatus));
for (const p of [url.pathname + '/v1/turns', url.pathname + '/v1/research/turns/' + fresh.requestId, url.pathname + '/v1/research/other'])
  assert.ok([403, 404].includes((await raw(creds, p, body)).status), p);
log('unlisted_paths_denied');
const badMac = JSON.stringify({ ...envelope('turn', input()), mac: 'a'.repeat(64), prompt: fresh.prompt });
assert.equal((await raw(creds, turnPath, badMac, ndjson)).status, 403); log('bad_dispatch_mac_rejected_by_host');
const expiredInput = input(), expired = envelope('turn', expiredInput, { exp: secs() + 1 });
await new Promise(r => setTimeout(r, 2500));
assert.equal((await raw(creds, turnPath, JSON.stringify({ ...expired, prompt: expiredInput.prompt }), ndjson)).status, 403); log('expired_dispatch_rejected');
assert.ok([413, 503].includes((await raw(creds, turnPath, JSON.stringify({ pad: 'x'.repeat(20000) }), ndjson)).status)); log('oversize_body_rejected');
assert.equal((await raw(creds, turnPath, body, { 'content-type': 'application/json', accept: 'application/json' })).status, 503); log('wrong_accept_not_forwarded');
void randomBytes;

// Optional real turns (paid; needs a current attestation on the host).
if (realIndex > 0) {
  const profiles = (process.argv[realIndex + 1] ?? '').split(',').filter(Boolean);
  const chatId = randomUUID();
  for (const name of profiles) {
    const i = input({ chatId: name === profiles[0] ? chatId : randomUUID(), profile: 'tavily-hosted-' + name, prompt: 'Which serial interfaces can the RP2040 PIO implement? Cite the official documentation.' });
    const started = Date.now(), stages = [], r = await client.turn(i, { onProgress: s => stages.push(s) });
    console.log('REAL', name, JSON.stringify({ state: r.state, reason: r.reason, citations: r.answer?.citations?.length, usage: r.usage, stages, ms: Date.now() - started }));
    assert.ok(r.state === 'evidence' || r.state === 'insufficient', name); checks.push('real_' + name);
  }
  if (profiles.length) {
    const f = input({ chatId, profile: 'tavily-hosted-' + profiles[0], prompt: 'Which of those examples use UART? Cite the documentation.' });
    const started = Date.now(), r = await client.turn(f);
    console.log('REAL follow-up', JSON.stringify({ state: r.state, citations: r.answer?.citations?.length, usage: r.usage, ms: Date.now() - started }));
    assert.ok(r.state === 'evidence' || r.state === 'insufficient'); checks.push('real_follow_up');
  }
}
console.log(JSON.stringify({ passed: checks.length, checks }));
