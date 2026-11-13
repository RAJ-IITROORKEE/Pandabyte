import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createResearchGatewayClient, validResearchChatAnswer } from '../src/server/research-gateway-client.ts';
import { signResult, verifyDispatch, researchRunId } from '../src/server/research-envelopes.ts';
import { canonicalResearchJSON } from '../src/opencode/research-provider-gateway.ts';

const dispatchKey = randomBytes(32), resultKey = randomBytes(32), now = 1794400000000, secs = Math.floor(now / 1000);
const endpoint = 'https://abcde12345.execute-api.ap-south-1.amazonaws.com/research';
const input = { subject: 'user_owner', chatId: '11111111-2222-4333-8444-555555555555', requestId: '66666666-7777-4888-9999-aaaaaaaaaaaa', profile: 'tavily-hosted-haiku', prompt: 'Which interfaces does RP2040 PIO support?' };
const answer = { outcome: 'evidence', text: 'PIO provides programmable I/O state machines.', citations: [{ id: 'S1', title: 'RP2040 documentation', sourceUrl: 'https://www.raspberrypi.com/documentation/microcontrollers/rp2040.html', capturedAt: '2026-11-12T01:00:00.000Z', quote: 'PIO provides programmable input/output state machines.', sectionPath: [] }] };
const usage = { calls: 2, inputTokens: 2000, outputTokens: 120, costNanoUsd: 260000 };
const sha = t => createHash('sha256').update(t).digest('hex');

// A fake host: records the request, verifies the dispatch MAC like the service, and replies with `reply(dispatch)`.
function setup(reply, { status = 200, type = 'application/x-ndjson' } = {}) {
  const seen = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body); seen.push({ url, init, body });
    assert.equal(verifyDispatch(dispatchKey, body.dispatch, body.mac, secs), true);
    const out = reply(body.dispatch); const text = typeof out === 'string' ? out : JSON.stringify(out);
    return new Response(text, { status, headers: { 'content-type': type } });
  };
  const client = createResearchGatewayClient({ endpoint, roleArn: 'arn:aws:iam::123456789012:role/r', dispatchKey, resultKey, fetch, now: () => now, sign: async () => ({ authorization: 'AWS4-HMAC-SHA256 test' }) });
  return { client, seen };
}
const fields = (d, over = {}) => JSON.parse(JSON.stringify({ v: 1, subjectHash: d.subjectHash, chatId: d.chatId, requestId: d.requestId, runId: researchRunId(d.subjectHash, d.chatId, d.requestId), profile: d.profile, modelId: d.modelId,
  promptHash: d.promptHash, state: 'evidence', answerHash: sha(canonicalResearchJSON(answer)), usage, exp: secs + 120, ...over }));
const resultLine = (f, extra = { answer }) => JSON.stringify({ type: 'result', payload: f, ...extra, mac: signResult(resultKey, f, secs) });

test('turn: progress then one signed cited result; dispatch carries the prompt and an exact route', async () => {
  const stages = [];
  const { client, seen } = setup(d => '{"type":"progress","stage":"searching_web"}\n{"type":"progress","stage":"checking_citations"}\n' + resultLine(fields(d)) + '\n');
  const out = await client.turn(input, { onProgress: s => stages.push(s) });
  assert.equal(out.state, 'evidence'); assert.deepEqual(out.answer, answer); assert.deepEqual(out.usage, usage);
  assert.deepEqual(stages, ['searching_web', 'checking_citations']);
  assert.equal(seen[0].url, 'https://abcde12345.execute-api.ap-south-1.amazonaws.com/research/v1/research/turns');
  assert.equal(seen[0].init.headers.accept, 'application/x-ndjson'); assert.equal(seen[0].body.prompt, input.prompt);
  assert.equal(seen[0].body.dispatch.modelId, 'anthropic/claude-haiku-5.5'); assert.equal(seen[0].body.dispatch.exp, secs + 50);
});

test('turn: failed and insufficient results are accepted with their exact shapes', async () => {
  const failed = await setup(d => resultLine(fields(d, { state: 'failed', reason: 'attestation_expired', answerHash: undefined, usage: { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 } }), {}) + '\n').client.turn(input);
  assert.deepEqual(failed, { state: 'failed', reason: 'attestation_expired', usage: { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 } });
  const none = { outcome: 'insufficient', text: 'Not enough evidence.', citations: [] };
  const insufficient = await setup(d => resultLine(fields(d, { state: 'insufficient', answerHash: sha(canonicalResearchJSON(none)) }), { answer: none })).client.turn(input);
  assert.equal(insufficient.state, 'insufficient');
});

test('turn: every tampered, foreign or malformed result is unknown', async () => {
  const other = '99999999-7777-4888-9999-aaaaaaaaaaaa';
  const cases = {
    otherChat: d => resultLine(fields(d, { chatId: other, runId: researchRunId(d.subjectHash, other, d.requestId) })),
    otherPrompt: d => resultLine(fields(d, { promptHash: 'c'.repeat(64) })),
    otherModel: d => resultLine(fields(d, { profile: 'tavily-hosted-luna', modelId: 'openai/gpt-6-luna' })),
    otherSubject: d => resultLine(fields(d, { subjectHash: 'b'.repeat(64), runId: researchRunId('b'.repeat(64), d.chatId, d.requestId) })),
    wrongRunId: d => resultLine(fields(d, { runId: 'd'.repeat(64) })),
    wrongAnswerHash: d => resultLine(fields(d, { answerHash: 'e'.repeat(64) })),
    tamperedAnswer: d => resultLine(fields(d), { answer: { ...answer, text: 'changed' } }),
    badShape: d => { const bad = { ...answer, citations: [{ ...answer.citations[0], quote: 'q'.repeat(181) }] }; return resultLine(fields(d, { answerHash: sha(canonicalResearchJSON(bad)) }), { answer: bad }); },
    wrongKey: d => JSON.stringify({ type: 'result', payload: fields(d), answer, mac: signResult(randomBytes(32), fields(d), secs) }),
    twoResults: d => resultLine(fields(d)) + '\n' + resultLine(fields(d)),
    progressAfterResult: d => resultLine(fields(d)) + '\n{"type":"progress","stage":"searching_web"}',
    unknownStage: d => '{"type":"progress","stage":"admitted"}\n' + resultLine(fields(d)),
    noResult: () => '{"type":"progress","stage":"searching_web"}\n',
    garbage: () => 'not json\n',
    oversizeLine: () => 'x'.repeat(70000),
    unknownState: d => resultLine(fields(d, { state: 'unknown', answerHash: undefined }), {}),
  };
  for (const [name, reply] of Object.entries(cases)) assert.deepEqual(await setup(reply).client.turn(input), { state: 'unknown' }, name);
  assert.deepEqual(await setup(d => resultLine(fields(d)), { type: 'text/html' }).client.turn(input), { state: 'unknown' }, 'content type');
  const thrown = createResearchGatewayClient({ endpoint, roleArn: 'arn:aws:iam::123456789012:role/r', dispatchKey, resultKey, now: () => now, sign: async () => ({}), fetch: async () => { throw Error('network'); } });
  assert.deepEqual(await thrown.turn(input), { state: 'unknown' }, 'transport error');
});

test('turn: host 409/404/503 map to conflict/not_found/unknown', async () => {
  assert.deepEqual(await setup(() => ({ error: 'conflict' }), { status: 409, type: 'application/json' }).client.turn(input), { state: 'conflict' });
  assert.deepEqual(await setup(() => ({ error: 'unavailable' }), { status: 503, type: 'application/json' }).client.turn(input), { state: 'unknown' });
});

test('status and cancel: signed body, exact id route, unsigned running is only running', async () => {
  const s = setup(d => JSON.parse(resultLine(fields(d))), { type: 'application/json' });
  const out = await s.client.status(input);
  assert.equal(out.state, 'evidence'); assert.equal(s.seen[0].url, endpoint + '/v1/research/turns/' + input.requestId + '/status');
  assert.equal(s.seen[0].body.dispatch.action, 'status'); assert.equal(s.seen[0].body.prompt, undefined); assert.equal(s.seen[0].init.headers.accept, 'application/json');
  assert.deepEqual(await setup(() => ({ type: 'status', state: 'running' }), { type: 'application/json' }).client.status(input), { state: 'running' });
  assert.deepEqual(await setup(() => ({ type: 'status', state: 'running' }), { status: 202, type: 'application/json' }).client.cancel(input), { state: 'running' });
  assert.deepEqual(await setup(() => ({ type: 'status', state: 'evidence' }), { type: 'application/json' }).client.status(input), { state: 'unknown' }, 'unsigned terminal');
  assert.deepEqual(await setup(() => ({ error: 'not_found' }), { status: 404, type: 'application/json' }).client.status(input), { state: 'not_found' });
  const c = setup(d => JSON.parse(resultLine(fields(d, { state: 'unknown', answerHash: undefined, usage }), {})), { type: 'application/json' });
  assert.deepEqual(await c.client.cancel(input), { state: 'unknown' }); assert.match(c.seen[0].url, /\/cancel$/);
});

test('client and answer validation refuse bad configuration and shapes', () => {
  const base = { endpoint, roleArn: 'arn:aws:iam::123456789012:role/r', dispatchKey, resultKey, sign: async () => ({}) };
  for (const over of [{ endpoint: 'https://evil.example.com/research' }, { endpoint: endpoint.replace('/research', '/agent') }, { endpoint: endpoint.replace('https', 'http') }, { resultKey: dispatchKey }, { dispatchKey: Buffer.alloc(16) }])
    assert.throws(() => createResearchGatewayClient({ ...base, ...over }));
  assert.equal(validResearchChatAnswer(answer), true);
  for (const bad of [{ ...answer, outcome: 'insufficient' }, { ...answer, citations: [] }, { ...answer, extra: 1 }, { ...answer, citations: [{ ...answer.citations[0], id: 'S2' }] },
    { ...answer, citations: [{ ...answer.citations[0], sourceUrl: 'javascript:alert(1)' }] }, { ...answer, citations: [{ ...answer.citations[0], sectionPath: ['x'] }] }, { ...answer, text: ' ' }])
    assert.equal(validResearchChatAnswer(bad), false);
  const page = new URL(answer.citations[0].sourceUrl), image = { url: `https://${page.hostname}/pinout.png`, description: 'Pinout' };
  assert.equal(validResearchChatAnswer({ ...answer, citations: [{ ...answer.citations[0], images: [image] }] }), true);
  for (const images of [[], [image, image, image], [{ ...image, url: 'https://evil.example.net/x.png' }], [{ url: image.url }]])
    assert.equal(validResearchChatAnswer({ ...answer, citations: [{ ...answer.citations[0], images }] }), false);
});

test('size bounds: an escape-heavy prompt is refused before dispatch; a maximal signed answer is accepted', async () => {
  const s = setup(() => 'unused');
  await assert.rejects(s.client.turn({ ...input, prompt: '"\n'.repeat(3999) }), /Research request invalid/); assert.equal(s.seen.length, 0);
  const big = { ...answer, text: 'é'.repeat(7800), citations: [answer.citations[0], { ...answer.citations[0], id: 'S2' }] };
  assert.equal(validResearchChatAnswer(big), true);
  const out = await setup(d => JSON.parse(resultLine(fields(d, { answerHash: sha(canonicalResearchJSON(big)) }), { answer: big })), { type: 'application/json' }).client.status(input);
  assert.equal(out.state, 'evidence');
});
