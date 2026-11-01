import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatHandler } from '../src/server/chat-handler.ts';
import { NativeNotAdmittedError, NativeCompletedFailureError } from '../src/server/opencode-selector.ts';
const id = '11111111-1111-4111-8111-111111111111';
const rid = '22222222-2222-4222-8222-222222222222';
const mid = '33333333-3333-4333-8333-333333333333';
const now = '2026-10-31T00:00:00Z';
const thread = () => ({ id, title: 'Chat', updatedAt: now, status: 'idle', secret: 'strip' });
const endpoint = 'https://localhost:3000/api/chat';
const get = (suffix = '') => new Request(endpoint + suffix);
const post = (input, extra = {}) => new Request(endpoint, { method: 'POST', headers: { origin: 'https://localhost:3000', 'content-type': 'application/json', ...extra }, body: typeof input === 'string' ? input : JSON.stringify(input) });
function setup(extraDeps = {}) {
  const calls = [], turns = [], messages = [];
  let release; const gate = new Promise(resolve => { release = resolve; });
  let answerCalls = 0, behavior = 'ok', allowed = true, catalog = [{ sku: 'ESPXC3', title: 'PandaByte xC3 ESP32-C3 Development Board' }, { sku: 'ESPXC6', title: 'PandaByte xC6 ESP32-C6 Development Board' }];
  const shape = () => ({ thread: { ...thread(), status: turns.some(t => t.status === 'pending') ? 'pending' : 'idle' }, messages: structuredClone(messages), turns: structuredClone(turns) });
  const client = { database: { schema: () => ({ rpc: async (name, args) => {
    calls.push(name);
    if (!allowed && name !== 'panda_agent_chats_list') return { error: { code: 'P0001', message: 'Request failed', details: 'not_found' } };
    if (name === 'panda_agent_chats_list') return { data: { threads: [thread()] } };
    if (name === 'panda_agent_chat_create') return { data: { thread: thread() } };
    if (name === 'panda_agent_chat_read') return { data: shape() };
    if (name === 'panda_agent_chat_begin_v2') {
      const old = turns.find(t => t.requestId === args.p_request);
      if (old && (old.question !== args.p_question || old.webSearch !== args.p_web_search) || !old && turns.some(t => t.status === 'pending')) return { error: { code: 'P0001', message: 'Request failed', details: 'conflict' } };
      if (old) return { data: { ...shape(), admitted: false, turn: old } };
      const t = { requestId: args.p_request, question: args.p_question, webSearch: args.p_web_search, status: 'pending', response: null, createdAt: now };
      turns.push(t); messages.push({ id: mid, role: 'user', text: args.p_question, createdAt: now, citations: [], secret: 'strip' });
      return { data: { ...shape(), admitted: true, finishToken: 'a'.repeat(64), turn: t } };
    }
    if (name === 'panda_agent_chat_finish') {
      assert.equal(args.p_finish_token, 'a'.repeat(64)); const t = turns.find(t => t.requestId === args.p_request); t.status = 'complete'; t.response = args.p_response;
      messages.push({ id: '44444444-4444-4444-8444-444444444444', role: 'assistant', text: args.p_response.text, createdAt: now, citations: args.p_response.citations });
      return { data: shape() };
    }
    throw Error('unexpected');
  } }) } };
  const handler = createChatHandler({ authenticate: async () => ({ subject: 'private', client }), products: async () => catalog, answer: async (_actor, q, _request, progress) => { answerCalls++; calls.push(q.productSku); progress?.('reading_sources'); progress?.('reading_sources'); progress?.('not_allowed'); if (behavior === 'throw') throw Error('secret'); if (behavior === 'wait') await gate; return { outcome: 'insufficient', text: 'Not established.', citations: [] }; }, ...extraDeps });
  return { handler, calls, turns, messages, release, get answerCalls() { return answerCalls; }, set behavior(v) { behavior = v; }, set allowed(v) { allowed = v; }, set catalog(v) { catalog = v; } };
}

test('stream projects one valid context summary without source or request identifiers', async () => {
  const context = { fragments: 2, characters: 400, duplicatesRemoved: 1, limitCharacters: 20000 };
  const x = setup({ answer: async (_actor, _q, _request, progress) => {
    progress('searching_sources', { ...context, handles: ['private'] });
    progress('reading_sources', context);
    progress('searching_sources', context);
    progress('searching_sources', context);
    return { outcome: 'insufficient', text: 'Not established.', citations: [] };
  } });
  const reply = await x.handler.messagePOST(post({requestId:rid,question:'xC3'}, {accept:'text/event-stream'}),id);
  const events = (await reply.text()).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
  assert.deepEqual(events.filter(e => e.type === 'context'), [{ type: 'context', ...context }]);
  assert.equal(events.filter(e => e.type === 'activity' && e.stage === 'searching_sources').length, 1);
  assert.equal(events.at(-1).type, 'complete');
  assert.doesNotMatch(JSON.stringify(events), /private|handles|finishToken/);
});
test('general conversation persists without a SKU and bounds history', async () => {
  const x = setup({ products: async () => { throw Error('catalog must not be read'); }, converse: async (history, question) => { assert.ok(history.reduce((n,m)=>n+m.text.length,0)<=20000); assert.equal(question,'hi'); return {outcome:'conversation',text:'Hello! How can I help?',citations:[]}; } });
  assert.equal((await x.handler.messagePOST(post({requestId:rid,question:'hi'}),id)).status,200);
  assert.equal(x.answerCalls,0); assert.equal(x.turns[0].status,'complete');
});

test('general chat activity describes routing without claiming product retrieval', async () => {
  const x = setup({converse:async()=>({outcome:'conversation',text:'Hello!',citations:[]})});
  const reply = await x.handler.messagePOST(post({requestId:rid,question:'hi'}, {accept:'text/event-stream'}),id);
  const events = (await reply.text()).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
  assert.deepEqual(events.filter(e => e.type === 'activity').map(e => e.stage), ['routing_question','saving_answer']);
  assert.ok(events.every(e => e.type !== 'context'));
});

test('only clearly general turns receive genuine authorized provisional callbacks', async () => {
  for (const question of ['hi', 'Explain a pull-up resistor without a particular board.']) {
    const x = setup({ authorizePresentation: async () => true, converse: async (_history, _question, _request, _progress, presentation) => {
      assert.equal(!!presentation, question === 'hi');
      presentation?.onText('Hello'); presentation?.onText('!');
      return {outcome:'conversation',text:'Hello!',citations:[]};
    } });
    const reply = await x.handler.messagePOST(post({requestId:rid,question}, {accept:'text/event-stream'}),id);
    const events = (await reply.text()).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
    assert.equal(events.filter(e=>e.type==='text_delta').map(e=>e.text).join(''), question === 'hi' ? 'Hello!' : '');
    assert.equal(events.at(-1).type,'complete');
  }
  const x = setup({authorizePresentation:async()=>true,converse:async()=>{throw Error('must not converse for product');}});
  const reply = await x.handler.messagePOST(post({requestId:rid,question:'xC3'}, {accept:'text/event-stream'}),id);
  assert.doesNotMatch(await reply.text(), /text_delta/);
});

test('authorized draft arrives before completion and the saved answer follows', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const x = setup({ authorizePresentation: async () => true, converse: async (_h, _q, _r, _p, presentation) => {
    presentation.onText('Hello');
    await gate;
    presentation.onText('!');
    return { outcome: 'conversation', text: 'Hello!', citations: [] };
  } });
  const reply = await x.handler.messagePOST(post({ requestId: rid, question: 'hi' }, { accept: 'text/event-stream' }), id);
  const reader = reply.body.getReader(), decoder = new TextDecoder();
  let received = '';
  try {
    while (!received.includes('"type":"text_delta"')) {
      const part = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(Error('draft was not delivered')), 2000))]);
      assert.equal(part.done, false);
      received += decoder.decode(part.value, { stream: true });
    }
    assert.match(received, /"text":"Hello"/);
    assert.doesNotMatch(received, /"type":"complete"/);
    assert.equal(x.turns[0].status, 'pending');
    finish();
    while (true) { const part = await reader.read(); if (part.done) break; received += decoder.decode(part.value, { stream: true }); }
    const events = received.trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
    assert.equal(events.filter(event => event.type === 'text_delta').map(event => event.text).join(''), 'Hello!');
    assert.equal(events.at(-1).type, 'complete');
    assert.equal(x.turns[0].status, 'complete');
  } finally { finish(); reader.releaseLock(); }
});

test('revocation before final publication preserves known result without sending history', async () => {
  const checks=[];
  const x=setup({authorizePresentation:async(_actor,_id,_request,stage)=>{checks.push(stage);return stage==='draft';},converse:async(_h,_q,_r,_p,presentation)=>{presentation.onText('Hello!');return {outcome:'conversation',text:'Hello!',citations:[]};}});
  const reply=await x.handler.messagePOST(post({requestId:rid,question:'hi'},{accept:'text/event-stream'}),id);
  const events=(await reply.text()).trim().split('\n\n').map(frame=>JSON.parse(frame.slice(6)));
  assert.equal(x.turns[0].status,'complete');
  assert.ok(checks.includes('final')); assert.ok(!events.some(e=>e.type==='complete'));
  assert.deepEqual(events.at(-1),{type:'error',error:'unauthenticated'});
});

test('completed replay also checks current publication authority without re-executing', async () => {
  let allowed = true, executions = 0;
  const x = setup({ authorizePresentation: async () => allowed, converse: async () => { executions++; return {outcome:'conversation',text:'Known result.',citations:[]}; } });
  const input = { requestId: rid, question: 'hi' };
  assert.equal((await x.handler.messagePOST(post(input), id)).status, 200);
  allowed = false;
  const replay = await x.handler.messagePOST(post(input), id);
  assert.equal(replay.status, 401); assert.doesNotMatch(await replay.text(), /Known result|messages/);
  assert.equal(executions, 1);
});
test('known final answer is saved even when client disconnects during native work', async () => {
  const controller = new AbortController();
  const x = setup({converse:async()=>{controller.abort();return {outcome:'conversation',text:'Known completed answer.',citations:[]};}});
  const request = new Request(post({requestId:rid,question:'hi'}),{signal:controller.signal});
  assert.equal((await x.handler.messagePOST(request,id)).status,200);
  assert.equal(x.turns[0].status,'complete');
});
test('known native pre-admission rejection completes safely without wedging the chat',async()=>{
  const x=setup({converse:async()=>{throw new NativeNotAdmittedError();}});
  assert.equal((await x.handler.messagePOST(post({requestId:rid,question:'hi'}),id)).status,200);
  assert.equal(x.turns[0].status,'complete'); assert.match(x.turns[0].response.text,/did not start model work/);
});
test('known terminal failure saves a non-evidence reply and allows the next turn',async()=>{
  let count=0;
  const x=setup({converse:async()=>{if(count++===0)throw new NativeCompletedFailureError();return {outcome:'conversation',text:'Hello!',citations:[]};}});
  assert.equal((await x.handler.messagePOST(post({requestId:rid,question:'hi'}),id)).status,200);
  assert.equal(x.turns[0].status,'complete');assert.equal(x.turns[0].response.outcome,'insufficient');assert.deepEqual(x.turns[0].response.citations,[]);
  assert.equal((await x.handler.messagePOST(post({requestId:'55555555-5555-4555-8555-555555555555',question:'hello'}),id)).status,200);
  assert.equal(x.turns[1].status,'complete');
});
test('web search needs explicit consent, sends only the current question and binds replay mode',async()=>{
  let searches=0;
  const x=setup({webSearch:async(question)=>{searches++;assert.equal(question,'ESP32-C3 official WiFi');return {outcome:'insufficient',text:'No usable source.',citations:[]};}});
  const payload={requestId:rid,question:'ESP32-C3 official WiFi',webSearch:true};
  assert.equal((await x.handler.messagePOST(post(payload),id)).status,200);
  assert.equal((await x.handler.messagePOST(post(payload),id)).status,200);
  assert.equal(searches,1);assert.equal(x.answerCalls,0);
  assert.equal((await x.handler.messagePOST(post({...payload,webSearch:false}),id)).status,409);
  const y=setup(); assert.equal((await y.handler.messagePOST(post({...payload,webSearch:'true'}),id)).status,400);
  assert.equal((await y.handler.messagePOST(post({...payload,question:'a'.repeat(401)}),id)).status,400);
});
test('authentication, same origin, exact keys, bounded bodies, strict query and UUID', async () => {
  const h = createChatHandler({ authenticate: async () => null, products: async () => [], answer: async () => null });
  assert.equal((await h.listGET(get())).status, 401);
  const x = setup();
  assert.equal((await x.handler.createPOST(post({}))).status, 201);
  assert.equal((await x.handler.createPOST(post({ title: 'x'.repeat(101) }))).status, 400);
  x.calls.length = 0;
  for (const [req, status] of [[post({ question: 'xC3', requestId: rid }, { origin: 'https://evil.test' }), 403], [post({ question: 'xC3', requestId: rid, role: 'admin' }), 400], [post('x'.repeat(8193)), 413], [post({ question: 'x'.repeat(2001), requestId: rid }), 400]]) assert.equal((await x.handler.messagePOST(req, id)).status, status);
  assert.equal((await x.handler.readGET(get('?foo=1'), id)).status, 400);
  assert.equal((await x.handler.readGET(get(), 'bad')).status, 400);
  assert.equal(x.calls.length, 0);
});
test('ownership checked before admission and output excludes internal data', async () => {
  const x = setup(); x.allowed = false;
  assert.equal((await x.handler.messagePOST(post({ requestId: rid, question: 'xC3' }), id)).status, 404);
  assert.deepEqual(x.calls, ['panda_agent_chat_read']); assert.equal(x.answerCalls, 0);
  x.allowed = true;
  const r = await x.handler.messagePOST(post({ requestId: rid, question: 'xC3' }), id);
  assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /no-store/);
  const text = await r.text(); assert.doesNotMatch(text, /turns|requestId|secret|private|finishToken|aaaaaaaaaaaaaaaa/);
});
test('complete replay does not answer twice, changed payload conflicts', async () => {
  const x = setup(); const payload = { requestId: rid, question: 'xC3' };
  assert.equal((await x.handler.messagePOST(post(payload), id)).status, 200);
  assert.equal((await x.handler.messagePOST(post(payload), id)).status, 200);
  assert.equal(x.answerCalls, 1);
  assert.equal((await x.handler.messagePOST(post({ ...payload, question: 'xC6' }), id)).status, 409);
});
test('unknown answer leaves pending and retries do not invoke answer', async () => {
  const x = setup(); x.behavior = 'throw'; const payload = { requestId: rid, question: 'xC3' };
  const r = await x.handler.messagePOST(post(payload), id);
  assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /secret/);
  assert.equal((await x.handler.messagePOST(post(payload), id)).status, 409);
  assert.equal((await x.handler.messagePOST(post({ ...payload, requestId: '55555555-5555-4555-8555-555555555555' }), id)).status, 409);
  assert.equal(x.answerCalls, 1);
});
test('follow-up uses re-resolved saved questions and current catalog, never assistant text', async () => {
  const x = setup();
  assert.equal((await x.handler.messagePOST(post({ requestId: rid, question: 'Tell me about xC3' }), id)).status, 200);
  x.turns[0].response.text = 'xC6';
  const next = { requestId: '55555555-5555-4555-8555-555555555555', question: 'What about its pins?' };
  assert.equal((await x.handler.messagePOST(post(next), id)).status, 200);
  assert.equal(x.calls.filter(c => c === 'ESPXC3').length, 2);
  x.catalog = [{ sku: 'ESPXC6', title: 'PandaByte xC6 ESP32-C6 Development Board' }];
  const third = { ...next, requestId: '66666666-6666-4666-8666-666666666666' };
  assert.equal((await x.handler.messagePOST(post(third), id)).status, 200);
  assert.equal(x.answerCalls, 2);
});
test('invalid stored citations fail closed without leaking them', async () => {
  const x = setup(); x.messages.push({ id: mid, role: 'assistant', text: 'bad', createdAt: now, citations: [{ id: 'S1', title: 'title', sourceUrl: 'https://evil.test/product-page/a', capturedAt: now, quote: 'bad', sectionPath: [] }] });
  const r = await x.handler.readGET(get(), id); assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /evil/);
});



test('admitted SSE exposes allowlisted progress and only the saved public result', async () => {
  const x = setup(); const payload = { requestId: rid, question: 'xC3' };
  const r = await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id);
  assert.match(r.headers.get('content-type'), /^text\/event-stream/);
  const text = await r.text();
  assert.match(text, /"stage":"reading_sources"/);
  assert.equal((text.match(/"stage":"reading_sources"/g) ?? []).length, 1);
  assert.match(text, /"type":"complete"/);
  assert.doesNotMatch(text, /not_allowed|turns|requestId|secret|private|finishToken|aaaaaaaaaaaaaaaa/);
  const replay = await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id);
  assert.match(replay.headers.get('content-type'), /^application\/json/); assert.equal(x.answerCalls, 1);
});
test('SSE preflight failures stay JSON and unknown outcome remains pending', async () => {
  const x = setup(); const payload = { requestId: rid, question: 'xC3' };
  const invalid = await x.handler.messagePOST(post(payload, { accept: 'text/event-stream', origin: 'https://evil.test' }), id);
  assert.equal(invalid.status, 403); assert.match(invalid.headers.get('content-type'), /^application\/json/);
  x.allowed = false; assert.equal((await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id)).status, 404);
  x.allowed = true; x.behavior = 'throw';
  const r = await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id);
  const text = await r.text(); assert.match(text, /"type":"error","error":"unavailable"/); assert.doesNotMatch(text, /secret/);
  assert.equal((await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id)).status, 409);
  assert.equal(x.answerCalls, 1); assert.equal((await x.handler.readGET(get(), id)).status, 200);
});

test('anonymous SSE remains private JSON and does not start work', async () => {
  const h = createChatHandler({ authenticate: async () => null, products: async () => { throw Error('unexpected'); }, answer: async () => null });
  const r = await h.messagePOST(post({ requestId: rid, question: 'xC3' }, { accept: 'text/event-stream' }), id);
  assert.equal(r.status, 401); assert.match(r.headers.get('cache-control'), /no-store/); assert.match(r.headers.get('content-type'), /^application\/json/);
});
test('stream cancellation does not retry or interrupt admitted work', async () => {
  const x = setup(); x.behavior = 'wait'; const payload = { requestId: rid, question: 'xC3' };
  const r = await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id);
  const reader = r.body.getReader(); await reader.read(); await reader.cancel();
  x.release();
  for (let i = 0; i < 100 && x.turns[0].status !== 'complete'; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(x.turns[0].status, 'complete'); assert.equal(x.answerCalls, 1);
  const read = await x.handler.readGET(get(), id); assert.equal(read.status, 200);
  assert.equal((await x.handler.messagePOST(post(payload, { accept: 'text/event-stream' }), id)).status, 200); assert.equal(x.answerCalls, 1);
});
