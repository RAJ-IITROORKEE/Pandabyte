// D2 opt-in host gate: the real research service handler + turn runner on the selected host, with injected
// synthetic OpenRouter and Tavily responses (zero real provider/search calls). Mirrors the driver's fixture gates.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { createResearchTurnRunner } from '../src/server/research-turn-runner.ts';
import { createResearchServiceHandler } from '../src/server/research-service-handler.ts';
import { signDispatch, verifyResult, researchSubjectHash, researchPromptHash } from '../src/server/research-envelopes.ts';
import { canonicalResearchJSON } from '../src/opencode/research-provider-gateway.ts';
import { hostedResearchModel } from '../src/server/hosted-model-policy.ts';

const root = process.argv[3];
if (process.argv[2] !== '--aws-service-injected' || process.argv.length !== 4 || process.env.PANDA_RESEARCH_AWS_FIXTURE !== 'i-05bcf2573a0b77f7a' || process.platform !== 'linux' || process.getuid?.() !== 0
  || !/^\/opt\/panda-research-tests\/[a-f0-9]{32}\/runtime$/.test(root ?? '')) throw Error('Explicit selected-host service invocation required');
const sha = text => createHash('sha256').update(text).digest('hex'), secs = () => Math.floor(Date.now() / 1000);
const fixture = path.dirname(root), checks = [], counts = { providerDispatches: 0, searches: 0 };
const evidence = { state: 'running', checks, counts, realProviderCalls: 0, realSearchCalls: 0, error: null };

// Synthetic OpenRouter for the Haiku descriptor: a tool call, then a cited JSON answer over the returned passage.
const m = hostedResearchModel('anthropic/claude-haiku-5.5'), identity = n => ({ id: 'gen-SYNTHETIC_' + n, model: m.reportedModels.at(-1), provider: m.providerName });
async function fetcher(url, init) {
  if (url.endsWith('/endpoints/zdr')) return Response.json({ data: [{ model_id: m.id, tag: m.endpointTag, safety_retention: false }] });
  if (url.endsWith('/endpoints')) return Response.json({ data: { id: m.id, architecture: { tokenizer: m.tokenizer }, endpoints: [{ tag: m.endpointTag, model_id: m.id, name: m.endpointName, provider_name: m.providerName, status: 0,
    pricing: { ...m.pricing, overrides: [Object.fromEntries(m.overrideKeys.map(k => [k, k === 'min_prompt_tokens' ? 272000 : String(m.pricing[k] ?? '0.000001')]))] }, context_length: 1000000, max_completion_tokens: 128000,
    max_prompt_tokens: null, supports_implicit_caching: false, supports_tool_choice: { none: true, auto: true, required: false, function: false }, supported_parameters: ['reasoning', 'include_reasoning', m.outputParam, 'tools', 'tool_choice', 'response_format'] }] } });
  if (url.endsWith('/key')) return Response.json({ data: { workspace_id: 'SYNTHETIC_WORKSPACE' } });
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  const n = ++counts.providerDispatches, wire = JSON.parse(init.body), lastUser = wire.messages.findLastIndex(x => x.role === 'user');
  assert.deepEqual(wire.reasoning, { enabled: false });
  const tool = wire.messages.slice(lastUser + 1).findLast(x => x.role === 'tool'), chunk = (delta, finish = null) => ({ ...identity(n), choices: [{ index: 0, delta, finish_reason: finish }] }), frames = [chunk({ role: 'assistant' })];
  if (!tool) frames.push(chunk({ tool_calls: [{ index: 0, id: 'toolu_bdrk_synthetic' + n, type: 'function', function: { name: 'panda_research_search', arguments: JSON.stringify({ query: 'rp2040 pio examples' }) } }] }, 'tool_calls'));
  else { const source = JSON.parse(typeof tool.content === 'string' ? tool.content : tool.content.map(p => p.text).join('')).sources[0];
    const text = JSON.stringify(wire.messages[lastUser].content), bogus = text.includes('unverifiable'); // check 6: cite a source this turn never returned
    frames.push(chunk({ content: JSON.stringify({ answer: 'PIO provides programmable input/output state machines.', evidence: [{ handle: bogus ? 'zz-not-returned' : source.handle, passage: source.passages[0].id }] }) }, 'stop')); }
  frames.push({ ...identity(n), choices: [], usage: { prompt_tokens: 1000, completion_tokens: 60, total_tokens: 1060, cost: 0.00013, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } });
  return new Response(frames.map(f => 'data: ' + JSON.stringify(f) + '\n\n').join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
}
const searchFetch = async () => { counts.searches++; return Response.json({ request_id: 'synthetic search receipt', usage: { credits: 1 }, results: [{ url: 'https://www.raspberrypi.com/documentation/microcontrollers/rp2040.html', title: 'RP2040 documentation', content: 'PIO provides programmable input/output state machines.' }] }); };
const searchLookup = async () => [{ address: '93.184.216.34', family: 4 }];

try {
  const rootStat = await fs.lstat(root); assert.ok(rootStat.isDirectory() && rootStat.uid === 0 && (rootStat.mode & 0o777) === 0o700);
  const serviceRoot = path.join(root, 'service'), requestRoot = path.join(root, 'requests');
  for (const dir of [serviceRoot, requestRoot]) await fs.mkdir(dir, { mode: 0o700 });
  const openrouterKey = 'sk-or-v1-' + '0'.repeat(64), reviewed = new Date(Date.now() - 60000);
  const attestation = { version: 1, reviewedAt: reviewed.toISOString(), expiresAt: new Date(reviewed.getTime() + 3600000).toISOString(), keySha256: sha(openrouterKey), workspaceSha256: sha('SYNTHETIC_WORKSPACE'),
    privacy: { paidTraining: false, publicPrompts: false, dataDiscount: false, logging: false, traces: 'langsmith_metadata_only' } };
  const runner = createResearchTurnRunner({ root: serviceRoot, codeSource: fileURLToPath(new URL('../runtime/opencode/', import.meta.url)),
    keys: async () => ({ openrouterKey, tavilyKey: 'synthetic-search-key' }), attestation: async () => attestation, fetcher, searchFetch, searchLookup, diagnostic: code => (evidence.diagnostics ??= []).push(code) });
  const keys = { dispatchKey: randomBytes(32), resultKey: randomBytes(32), serviceToken: randomBytes(32) }, token = keys.serviceToken.toString('base64');
  const subjectHash = researchSubjectHash('user_synthetic_' + randomUUID()), chatId = randomUUID(), profile = 'tavily-hosted-haiku', modelId = 'anthropic/claude-haiku-5.5';
  const request = (action, url, requestId, prompt, extra = {}) => { const d = { v: 1, action, subjectHash, chatId, requestId, profile, modelId, promptHash: researchPromptHash(prompt), exp: secs() + 50 };
    return { method: 'POST', path: url, headers: { authorization: 'Bearer ' + token }, body: Buffer.from(JSON.stringify({ dispatch: d, mac: signDispatch(keys.dispatchKey, d, secs()), ...extra })) }; };
  const collect = async res => { assert.equal(res.status, 200); const lines = []; for await (const l of res.stream) lines.push(JSON.parse(l)); return lines; };
  const turn = async (handler, requestId, prompt) => { const lines = await collect(await handler.handle(request('turn', '/v1/research/turns', requestId, prompt, { prompt }))); const last = lines.at(-1);
    assert.equal(last.type, 'result'); assert.equal(verifyResult(keys.resultKey, last.payload, last.mac, secs()), true); return { lines, last }; };
  let handler = createResearchServiceHandler({ root: requestRoot, keys, runner }); await handler.reconcile();

  const r1 = randomUUID(), q1 = 'Which interfaces are RP2040 PIO examples?';
  const t1 = await turn(handler, r1, q1), p1 = t1.last.payload;
  assert.equal(p1.state, 'evidence'); assert.equal(t1.last.answer.outcome, 'evidence'); assert.equal(t1.last.answer.citations[0].id, 'S1');
  assert.equal(sha(canonicalResearchJSON(t1.last.answer)), p1.answerHash); assert.equal(p1.usage.calls, 2); assert.ok(t1.lines.some(l => l.type === 'progress'));
  checks.push('service_turn_signed_evidence_through_real_native_runtime');
  const dispatchesAfter1 = counts.providerDispatches;
  const replay = await turn(handler, r1, q1); assert.equal(replay.last.payload.answerHash, p1.answerHash); assert.equal(counts.providerDispatches, dispatchesAfter1);
  checks.push('same_request_replays_without_new_provider_call');
  const status = await handler.handle(request('status', `/v1/research/turns/${r1}/status`, r1, q1)); const st = status.json ?? (await collect(status)).at(-1);
  assert.equal(st.payload?.answerHash ?? st.result?.payload?.answerHash, p1.answerHash); checks.push('status_returns_stored_result');
  const metaFile = path.join(serviceRoot, 'chats', subjectHash, chatId, 'meta.json'), meta1 = JSON.parse(await fs.readFile(metaFile, 'utf8'));
  const r2 = randomUUID(), q2 = 'Which RP2040 PIO examples use UART?';
  const t2 = await turn(handler, r2, q2); evidence.followUp = { state: t2.last.payload.state, reason: t2.last.payload.reason ?? null }; assert.equal(t2.last.payload.state, 'evidence');
  const meta2 = JSON.parse(await fs.readFile(metaFile, 'utf8')); assert.equal(meta2.epoch, meta1.epoch); assert.equal(meta2.binding.sessionID, meta1.binding.sessionID);
  checks.push('follow_up_reuses_epoch_and_native_session');
  handler = createResearchServiceHandler({ root: requestRoot, keys, runner }); const rec = await handler.reconcile();
  assert.equal(rec.interrupted, 0); assert.deepEqual(await runner.heldLeases?.() ?? [], []);
  checks.push('restart_reconcile_clean_and_no_held_slot');
  const t3 = await turn(handler, randomUUID(), 'Which unverifiable RP2040 PIO examples exist?'), p3 = t3.last.payload;
  evidence.invalidAnswer = { state: p3.state, reason: p3.reason ?? null, calls: p3.usage.calls };
  assert.equal(p3.state, 'failed'); assert.equal(p3.reason, 'invalid'); assert.equal(p3.usage.calls, 2); assert.equal(t3.last.answer, undefined);
  checks.push('unverifiable_citation_is_failed_invalid_with_usage_not_unknown');
  evidence.state = 'service_passed'; evidence.usage = [p1.usage, t2.last.payload.usage];
} catch (error) {
  evidence.state = 'failed'; evidence.error = String(error?.message ?? error).replace(/[a-f0-9]{64}/g, '[hash]').slice(0, 400); process.exitCode = 1;
  try { await fs.writeFile(path.join(fixture, 'private-service-failure.json'), JSON.stringify({ message: error?.message, stack: error?.stack }), { mode: 0o600, flag: 'wx' }); } catch {}
}
process.stdout.write(JSON.stringify(evidence) + '\n');
