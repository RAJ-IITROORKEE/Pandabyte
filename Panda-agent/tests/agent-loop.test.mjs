// Agent loop with a scripted fake provider: these prove the plumbing (tools, validation, history, caps, persistence order),
// not the planning quality of a real model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAgentLoop, loopMessages, MAX_STEPS, stepLimitText } from '../src/agent-loop/loop.ts';
import { createToolHost, searchCatalog, GENERAL_HEADING, MAX_PRODUCTS } from '../src/agent-loop/tools.ts';
import { loopHistory, CONTEXT_BYTES, COMPACT_AT } from '../src/agent-loop/history.ts';
import { createAgentLoopChat, withAgentLoop, sourcesChangedText } from '../src/agent-loop/chat.ts';
import { createAgentLoopStore } from '../src/agent-loop/store.ts';
import { createOpenRouterStep } from '../src/agent-loop/openrouter-step.ts';
import { parseClarificationOptions, agentQuestionText, clarificationText } from '../src/retrieval/catalog-listing.ts';
import { fastHostedModel } from '../src/hosted-model.ts';

const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog-42.json', import.meta.url), 'utf8'));
const signal = () => new AbortController().signal;
const usage = { inputTokens: 1000, outputTokens: 200, costNanoUsd: 300 };
// Synthetic listing passages (not real PandaByte copy).
const listing = sku => {
  const row = catalog.find(r => r.sku === sku);
  return [`SYNTHETIC listing for ${row.title}. Feature: ${sku}-feature-one.`, `SYNTHETIC interface line for ${sku}: I2C.`]
    .map((text, i) => ({ text, title: row.title, sourceUrl: row.sourceUrl, capturedAt: '2026-11-01T00:00:00.000Z', sectionPath: ['Overview', `Part ${i + 1}`] }));
};
function deps(extra = {}) {
  const read = [], revalidated = [];
  return { read, revalidated, tools: {
    catalog: async () => catalog,
    readProduct: async (row, focus) => { read.push([row.sku, focus]); return extra.readProduct?.(row) ?? { kind: 'ready', passages: listing(row.sku), revalidate: async () => { revalidated.push(row.sku); return extra.revalidate ?? true; } }; },
  } };
}
const call = (name, args, id = `${name}-${Math.random().toString(36).slice(2, 8)}`) => ({ id, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) });
const reply = (...toolCalls) => ({ content: null, toolCalls, usage });
/** Excerpt ids the loop returned for one SKU, read from the tool messages the model saw. */
const idsFor = (messages, sku) => messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content)).filter(r => r.sku === sku).flatMap(r => r.excerpts?.map(e => e.id) ?? r.excerptIds ?? []);
const toolErrors = messages => messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content).error).filter(Boolean);
/** A scripted model: each entry receives (messages, tools) and returns a step result. */
function scripted(steps) {
  const seen = [];
  const step = async (messages, tools) => { seen.push({ messages: structuredClone(messages), tools: tools.map(t => t.function.name) }); const next = steps[seen.length - 1];
    if (!next) throw Object.assign(Error('script exhausted'), { code: 'outcome_unknown' }); return next(messages, tools.map(t => t.function.name)); };
  return { step, seen };
}
const run = (question, script, d = deps(), history = []) => runAgentLoop({ messages: loopMessages(question, history, null) }, { step: script.step, tools: createToolHost(d.tools), signal: signal() });
const menu = /could not match that to one PandaByte product|Pick an option:|Which PandaByte products would you like/;

const q1 = 'I am planning to make a project like air quality monitoring so can you help me which board and sensor I should use';
const q2 = 'help me to create a project step by step along with the code, materials, how will I connect them';
const q3 = 'tell me about using some pandabyte dev boards and air quality monitor, temperature and humidity in an OLED display... from the PandaByte source give me complete C++ code for Arduino IDE and library links';

test('live conversation 1: an open project question is planned with catalog search and product reads, not a product menu', async () => {
  const d = deps();
  const script = scripted([
    (_m, tools) => { assert.deepEqual(tools, ['search_catalog', 'read_product', 'ask_user', 'final_answer']); return reply(call('search_catalog', { query: 'air quality sensor' }), call('search_catalog', { query: 'ESP32 development board' })); },
    m => { const found = m.filter(x => x.role === 'tool').map(x => JSON.parse(x.content));
      assert.ok(found[0].products.some(p => p.sku === 'PB-BMV080')); assert.ok(found[1].products.some(p => p.sku === 'ESPXS3'));
      return reply(call('read_product', { sku: 'PB-BMV080', focus: 'particulate interface' }), call('read_product', { sku: 'ESPXS3' })); },
    m => reply(call('final_answer', { sourced: 'The BMV080 listing names particulate sensing; the xS3 listing names its interface.', citations: [idsFor(m, 'PB-BMV080')[0], idsFor(m, 'ESPXS3')[1]],
      general: '1. Pair the sensor with the board over I2C.\n2. Log readings every minute.' })),
  ]);
  const result = await run(q1, script, d);
  assert.equal(result.kind, 'final'); assert.equal(result.answer.outcome, 'evidence'); assert.equal(result.steps, 3);
  assert.deepEqual(result.citedSkus.sort(), ['ESPXS3', 'PB-BMV080']);
  assert.deepEqual(new Set(result.answer.citations.map(c => c.title)).size, 2, 'one answer cites two products');
  for (const c of result.answer.citations) assert.ok(listing(catalog.find(r => r.title === c.title).sku).some(p => p.text.includes(c.quote)), 'quotes are exact listing text');
  assert.match(result.answer.text, /\[S1\] \[S2\]/); assert.ok(result.answer.text.includes(GENERAL_HEADING)); assert.doesNotMatch(result.answer.text, menu);
  assert.deepEqual(d.read, [['PB-BMV080', 'particulate interface'], ['ESPXS3', '']]);
  assert.deepEqual(result.usage, { inputTokens: 3000, outputTokens: 600, costNanoUsd: 900 });
});

test('live conversation 1, asking variant: one clarifying question ends the turn and renders as a question panel', async () => {
  const script = scripted([() => reply(call('ask_user', { question: 'Is this indoor or outdoor, and do you want Wi-Fi logging?', options: ['Indoor, Wi-Fi dashboard', 'Outdoor, battery powered', 'Not sure yet'], recommended: 0 }))]);
  const result = await run(q1, script);
  assert.equal(result.kind, 'ask'); assert.equal(script.seen.length, 1); assert.equal(result.answer.outcome, 'clarification'); assert.deepEqual(result.answer.citations, []);
  const parsed = parseClarificationOptions(result.answer.text);
  assert.equal(parsed.question, 'Is this indoor or outdoor, and do you want Wi-Fi logging?');
  assert.deepEqual(parsed.options.map(o => [o.question, o.recommended]), [['Indoor, Wi-Fi dashboard', true], ['Outdoor, battery powered', false], ['Not sure yet', false]]);
});

const now = '2026-11-13T05:00:00.000Z';
const thread = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Air quality', updatedAt: now, status: 'pending' };
const bmvCitation = { id: 'S1', title: catalog.find(r => r.sku === 'PB-BMV080').title, sourceUrl: catalog.find(r => r.sku === 'PB-BMV080').sourceUrl, capturedAt: now, quote: 'SYNTHETIC listing', sectionPath: ['Overview'] };
const priorTurns = [
  { requestId: '11111111-1111-4111-8111-111111111111', question: q1, status: 'complete', createdAt: now, response: { outcome: 'clarification', text: 'Should I answer from PandaByte boards?', citations: [] } },
  { requestId: '22222222-2222-4222-8222-222222222222', question: 'Tell me about PandaByte Bosch BMV080', status: 'complete', createdAt: now, response: { outcome: 'evidence', text: 'The BMV080 measures PM1, PM2.5 and PM10.\n\n[S1]', citations: [bmvCitation] } },
  { requestId: '33333333-3333-4333-8333-333333333333', question: 'stopped one', status: 'complete', createdAt: now, response: { outcome: 'insufficient', text: 'Stopped waiting.', citations: [] } },
];
const current = { requestId: '44444444-4444-4444-8444-444444444444', question: q2, status: 'pending', createdAt: now, response: null };

test('live conversation 2: the follow-up sees earlier turns, including the cited product answer, as context', async () => {
  const history = loopHistory({ thread, messages: [], turns: [...priorTurns, current] }, current.requestId, 4000);
  assert.equal(history.compacted, false);
  assert.deepEqual(history.messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant'], 'insufficient and pending turns are left out');
  assert.match(history.messages[3].content, /^The BMV080 measures PM1, PM2.5 and PM10\.\n\n\(That answer cited PandaByte sources: PandaByte Bosch BMV080/);
  assert.doesNotMatch(history.messages[3].content, /\[S1\]/);
  const script = scripted([
    m => { assert.equal(m.at(-1).content, q2); assert.ok(m.some(x => x.role === 'assistant' && /BMV080 measures/.test(x.content)), 'the model sees the cited BMV080 turn');
      return reply(call('read_product', { sku: 'PB-BMV080' }), call('read_product', { sku: 'ESPXS3' })); },
    m => reply(call('final_answer', { sourced: 'Listing facts used for the build.', citations: [idsFor(m, 'PB-BMV080')[0]], general: '## Materials\n- xS3 board\n- BMV080\n\n## Code\n```cpp\nvoid setup() {}\nvoid loop() {}\n```' })),
  ]);
  const result = await run(q2, script, deps(), history.messages);
  assert.equal(result.kind, 'final'); assert.equal(result.answer.outcome, 'evidence'); assert.match(result.answer.text, /```cpp/);
});

test('live conversation 3: several product reads, the per-turn product cap, and general code with library links', async () => {
  const script = scripted([
    () => reply(call('search_catalog', { query: 'air quality temperature humidity OLED ESP32 board' })),
    () => reply(call('read_product', { sku: 'PB-BMV080' }), call('read_product', { sku: 'PBDHT11' }), call('read_product', { sku: 'PB96OLED' }), call('read_product', { sku: 'ESPXS3' })),
    m => { assert.deepEqual(toolErrors(m), ['product_limit']);
      return reply(call('final_answer', { sourced: 'The three listings describe the sensors and display.', citations: [idsFor(m, 'PB-BMV080')[0], idsFor(m, 'PBDHT11')[0], idsFor(m, 'PB96OLED')[0]],
        general: 'Libraries (Arduino Library Manager): "DHT sensor library" by Adafruit, https://github.com/adafruit/DHT-sensor-library\n```cpp\nconst int DHT_PIN = 4;\nvoid setup() {}\nvoid loop() {}\n```' })); },
  ]);
  const result = await run(q3, script);
  assert.equal(result.kind, 'final'); assert.equal(result.answer.citations.length, 3); assert.equal(MAX_PRODUCTS, 3);
  assert.deepEqual(result.citedSkus.sort(), ['PB-BMV080', 'PB96OLED', 'PBDHT11']); assert.match(result.answer.text, /github\.com\/adafruit/); assert.doesNotMatch(result.answer.text, menu);
});

test('invalid tool calls and citation ids are rejected back to the model, which can recover', async () => {
  const script = scripted([
    () => reply(call('delete_everything', {}), call('read_product', '{not json'), call('read_product', { sku: 'NOPE' })),
    () => reply(call('read_product', { sku: 'ESPXS3' })),
    () => reply(call('final_answer', { sourced: 'xS3 fact.', citations: ['E99'], general: '' })),
    () => reply(call('final_answer', { sourced: 'xS3 fact.', citations: [], general: '' })),
    () => reply(call('final_answer', { sourced: '', citations: [], general: 'It costs ₹450 and is in stock.' }), call('search_catalog', { query: 'x' })),
    m => { assert.deepEqual(toolErrors(m), ['unknown_tool', 'invalid_json', 'unknown_sku', 'unknown_citation', 'uncited_sourced', 'call_alone']);
      return reply(call('final_answer', { sourced: 'xS3 fact.', citations: [idsFor(m, 'ESPXS3')[0]], general: '' })); },
  ]);
  const result = await run('Tell me about the xS3', script);
  assert.equal(result.kind, 'final'); assert.equal(result.steps, MAX_STEPS); assert.equal(result.answer.citations.length, 1);
  assert.doesNotMatch(result.answer.text, new RegExp(GENERAL_HEADING.replace(/[()]/g, '\\$&')), 'no general part when general is empty');
});

test('a failing source read comes back to the model as unavailable instead of ending the turn', async () => {
  const d = deps({ readProduct: () => { throw Error('rpc down'); } });
  const script = scripted([() => reply(call('read_product', { sku: 'ESPXS3' })),
    m => { assert.deepEqual(toolErrors(m), ['unavailable']); return reply(call('final_answer', { sourced: '', citations: [], general: 'General ESP32-S3 guidance only.' })); }]);
  const result = await run('xS3?', script, d);
  assert.equal(result.answer.outcome, 'conversation'); assert.deepEqual(result.citedSkus, []);
});

test('price or stock in an answer is refused; a plain-text reply is accepted only as general guidance', async () => {
  const script = scripted([() => reply(call('final_answer', { sourced: '', citations: [], general: 'Price: Rs 450, in stock.' })), () => ({ content: 'General wiring advice only.', toolCalls: [], usage })]);
  const result = await run('wiring?', script);
  assert.equal(result.answer.outcome, 'conversation'); assert.equal(result.answer.text, 'General wiring advice only.');
  assert.deepEqual(toolErrors(script.seen[1].messages), ['price_or_stock']);
});

test('the step cap ends the turn honestly, offering only the finishing tools on the last step', async () => {
  const script = scripted(Array.from({ length: MAX_STEPS }, () => () => reply(call('search_catalog', { query: 'board' }))));
  const result = await run('loop forever', script);
  assert.equal(result.kind, 'stopped'); assert.equal(result.steps, MAX_STEPS); assert.equal(result.answer.outcome, 'insufficient'); assert.equal(result.answer.text, stepLimitText);
  assert.deepEqual(script.seen.at(-1).tools, ['ask_user', 'final_answer']);
  assert.equal(script.seen.at(-1).messages.filter(m => m.role === 'tool').length, MAX_STEPS - 1);
});

test('history compaction starts above 75% of the context budget, keeps recent turns verbatim and marks the summary as not evidence', () => {
  const turns = Array.from({ length: 8 }, (_, i) => ({ requestId: `0000000${i}-0000-4000-8000-000000000000`, question: `Question ${i} about the air quality build`, status: 'complete', createdAt: now,
    response: { outcome: 'conversation', text: `Answer ${i} ` + 'x'.repeat(3000), citations: [] } }));
  const read = { thread, messages: [], turns: [...turns, current] };
  const full = loopHistory(read, current.requestId, 0);
  const used = Buffer.byteLength(JSON.stringify(full.messages), 'utf8');
  assert.equal(full.compacted, false);
  assert.equal(loopHistory(read, current.requestId, Math.floor(CONTEXT_BYTES * COMPACT_AT) - used).compacted, false, 'exactly at 75% stays verbatim');
  const compacted = loopHistory(read, current.requestId, Math.floor(CONTEXT_BYTES * COMPACT_AT) - used + 1);
  assert.equal(compacted.compacted, true);
  assert.deepEqual(compacted.messages.filter(m => m.role === 'user').map(m => m.content), ['Question 5 about the air quality build', 'Question 6 about the air quality build', 'Question 7 about the air quality build']);
  assert.match(compacted.summary, /^- User: Question 0 about the air quality build \| Assistant: Answer 0/);
  assert.match(loopMessages(q2, compacted.messages, compacted.summary)[0].content, /compressed; context only, not evidence/);
  const tight = loopHistory(read, current.requestId, CONTEXT_BYTES * COMPACT_AT - 6000);
  assert.ok(tight.messages.length >= 2 && Buffer.byteLength(JSON.stringify(tight.messages), 'utf8') + Buffer.byteLength(tight.summary ?? '', 'utf8') <= 6000);
});

function harness({ script, read, unmetered = true, revalidate = true } = {}) {
  const calls = []; let state = null;
  const store = {
    state: async () => state && { ...state },
    begin: async (_t, _r, question) => { calls.push('begin'); state = { question, status: 'pending', claimed: false, cancelled: false }; return { ...read, admitted: true }; },
    claimUnmetered: async (_t, _r, hash) => { calls.push(['claim', hash]); state.claimed = true; return true; },
    receiptUnmetered: async (_t, _r, hash, answer, u) => { calls.push(['receipt', hash, answer, u]); return true; },
    finish: async (_t, _r, answer) => { calls.push(['finish', answer]); state.status = 'complete'; return read; },
    cancel: async () => read,
  };
  const policy = { enabled: async () => true, current: async () => true, dispatchCurrent: () => true, key: () => 'synthetic', isUnmetered: () => unmetered };
  const d = deps({ revalidate });
  const step = o => async (messages, tools) => {
    if (!calls.some(c => c[0] === 'claim')) assert.equal(await o.claim('e'.repeat(64)), true);
    assert.equal(await o.beforeSend(), true, 'every provider call is gated on the journal');
    return script.step(messages, tools);
  };
  const chat = createAgentLoopChat({ store, current: async () => true, policy, model: fastHostedModel.id, tools: d.tools, step });
  return { chat, calls, d };
}
const turn = { thread: thread.id, request: current.requestId, question: q2 };

test('the chat bridge claims once, records summed usage and step count, then saves the validated answer', async () => {
  const script = scripted([() => reply(call('read_product', { sku: 'PB-BMV080' })), m => reply(call('final_answer', { sourced: 'Fact.', citations: [idsFor(m, 'PB-BMV080')[0]], general: 'Plan.' }))]);
  const h = harness({ script, read: { thread, messages: [], turns: [...priorTurns, current] } });
  const result = await h.chat.start(turn, signal());
  assert.equal(result.status, 'saved'); assert.deepEqual(result.usage, { inputTokens: 2000, outputTokens: 400, contextWindow: 131072, model: fastHostedModel.id });
  assert.deepEqual(h.calls.map(c => Array.isArray(c) ? c[0] : c), ['begin', 'claim', 'receipt', 'finish']);
  assert.deepEqual(h.calls[2][3], { inputTokens: 2000, outputTokens: 400, costNanoUsd: 600, steps: 2 });
  assert.equal(h.calls[2][2].outcome, 'evidence'); assert.deepEqual(h.calls[3][1], h.calls[2][2]); assert.deepEqual(h.d.revalidated, ['PB-BMV080']);
});

test('ask_user saves a clarification after one step; changed sources and metered sessions are refused', async () => {
  const ask = scripted([() => reply(call('ask_user', { question: 'Which display size?', options: ['0.96 inch', '1.3 inch'] }))]);
  const h = harness({ script: ask, read: { thread, messages: [], turns: [current] } });
  assert.equal((await h.chat.start(turn, signal())).status, 'saved'); assert.equal(h.calls.at(-1)[1].outcome, 'clarification'); assert.equal(ask.seen.length, 1);

  const cite = scripted([() => reply(call('read_product', { sku: 'ESPXS3' })), m => reply(call('final_answer', { sourced: 'Fact.', citations: [idsFor(m, 'ESPXS3')[0]], general: '' }))]);
  const changed = harness({ script: cite, read: { thread, messages: [], turns: [current] }, revalidate: false });
  assert.equal((await changed.chat.start(turn, signal())).status, 'saved');
  assert.deepEqual(changed.calls.at(-1)[1], { outcome: 'insufficient', text: sourcesChangedText, citations: [] });

  const metered = harness({ script: ask, read: { thread, messages: [], turns: [current] }, unmetered: false });
  await assert.rejects(metered.chat.start(turn, signal()), { code: 'unavailable' }); assert.deepEqual(metered.calls, []);
});

test('a request already held by another journal stays there; new requests go to the loop', async () => {
  const log = [], bridge = (name, held) => ({ state: async () => held, status: async () => ({ status: name }), cancel: async () => ({ status: name }), start: async () => { log.push(name); return { status: 'saved' }; } });
  await withAgentLoop(bridge('base', true), bridge('loop', false)).start(turn, signal());
  await withAgentLoop(bridge('base', false), bridge('loop', false)).start(turn, signal());
  assert.deepEqual(log, ['base', 'loop']);
  const broken = { ...bridge('loop', false), state: async () => { throw Object.assign(Error('no journal'), { code: 'unavailable' }); } };
  assert.equal((await withAgentLoop(bridge('base', true), broken).status(turn, signal())).status, 'base', 'an unmigrated loop journal cannot break older turns');
});

test('store signs the proposed loop journal RPC', async () => {
  const calls = [], actor = { subject: 'fixture', client: { database: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { execute: true }, error: null }; } } } };
  assert.equal(await createAgentLoopStore(actor, 'a'.repeat(64)).claimUnmetered(thread.id, current.requestId, 'd'.repeat(64)), true);
  assert.equal(calls[0].name, 'panda_agent_loop_chat_v1'); const payload = JSON.parse(calls[0].args.p_payload);
  assert.equal(payload.action, 'loop_chat'); assert.deepEqual(payload.input, { op: 'claim_unmetered', thread: thread.id, request: current.requestId, bodyHash: 'd'.repeat(64) });
});

test('the OpenRouter step sends tools on the pinned zero-retention endpoint, claims once and refuses endpoints without tool calling', async () => {
  const endpoint = (tools = true) => ({ tag: 'groq', model_id: fastHostedModel.id, name: 'Groq | openai/gpt-oss-20b', provider_name: 'Groq', status: 0,
    pricing: { prompt: '0.000000075', completion: '0.0000003', input_cache_read: '0.0000000375', discount: 0 }, context_length: 131072, max_completion_tokens: 65536, max_prompt_tokens: null,
    supports_implicit_caching: true, supports_tool_choice: { none: true, auto: tools }, supported_parameters: ['reasoning', 'include_reasoning', 'max_tokens', 'response_format', 'tool_choice', ...(tools ? ['tools'] : [])] });
  const make = (tools, message) => {
    const wires = [], claims = [];
    const fetcher = async (url, init) => {
      if (url.endsWith('/endpoints/zdr')) return Response.json({ data: [{ model_id: fastHostedModel.id, tag: 'groq', safety_retention: false }] });
      if (url.endsWith('/endpoints')) return Response.json({ data: { id: fastHostedModel.id, architecture: { tokenizer: 'GPT' }, endpoints: [endpoint(tools)] } });
      wires.push(JSON.parse(init.body));
      return Response.json({ id: 'gen-SYNTHETIC', model: fastHostedModel.id, provider: 'Groq', choices: [{ index: 0, finish_reason: 'tool_calls', message }],
        usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940, cost: 0.00007 } });
    };
    const step = createOpenRouterStep({ model: fastHostedModel.id, apiKey: 'synthetic-secret-never-live', fetcher, policyCurrent: async () => true, dispatchCurrent: () => true,
      claim: async hash => { claims.push(hash); return true; }, beforeSend: async () => true, observe: () => {} });
    return { step, wires, claims };
  };
  const original = console.info; console.info = () => {};
  try {
    const good = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_catalog', arguments: '{"query":"oled"}' } }] };
    const f = make(true, good), messages = loopMessages('hi', [], null);
    const first = await f.step(messages, [], signal()); await f.step(messages, [], signal());
    assert.deepEqual(first.toolCalls, [{ id: 'call_1', name: 'search_catalog', arguments: '{"query":"oled"}' }]);
    assert.deepEqual(first.usage, { inputTokens: 900, outputTokens: 40, costNanoUsd: 70000 });
    assert.equal(f.claims.length, 1, 'one journal claim per turn'); assert.equal(f.wires.length, 2);
    assert.equal(f.wires[0].tool_choice, 'auto'); assert.equal(f.wires[0].stream, false);
    assert.deepEqual(f.wires[0].provider, { only: ['groq'], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: 0.075, completion: 0.3, request: 0, image: 0 } });
    await assert.rejects(make(false, good).step(messages, [], signal()), { code: 'not_admitted' });
    const bad = make(true, { role: 'assistant', content: null, tool_calls: [{ id: 'bad id!', type: 'function', function: { name: 'search_catalog', arguments: '{}' } }] });
    assert.deepEqual(await bad.step(messages, [], signal()), { content: null, toolCalls: [], usage: { inputTokens: 900, outputTokens: 40, costNanoUsd: 70000 } }, 'a malformed message still counts its usage');
  } finally { console.info = original; }
});

test('agent questions are plain text for the question panel; the catalog menu parser is unchanged', () => {
  const text = agentQuestionText('Use **PandaByte** boards?', ['[PandaByte](https://evil.example) boards', 'Search the web', 'General suggestion'], 0);
  assert.doesNotMatch(text, /\*\*|\[|\]/); assert.equal(parseClarificationOptions(text).options.length, 3);
  assert.equal(agentQuestionText('Pick?', ['same', 'Same']), null); assert.equal(agentQuestionText('Pick?', ['only one']), null);
  assert.ok(parseClarificationOptions(clarificationText(catalog)));
  assert.equal(parseClarificationOptions(text.replace('1. ', '2. ')), null);
  assert.equal(searchCatalog(catalog, 'zzzz').matched, false); assert.equal(searchCatalog(catalog, 'zzzz').products.length, catalog.length);
});
