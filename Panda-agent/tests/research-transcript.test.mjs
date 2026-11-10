import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

async function module() {
 let value;
 await assert.doesNotReject(async () => { value = await import('../src/opencode/research-transcript.ts'); }, 'native research projection must be implemented');
 return value;
}
const id = n => 'msg_' + n.toString(16).padStart(12, '0') + 'A'.repeat(14);
const question = 'Which public manufacturer documentation explains Wi-Fi setup?';
const expected = { messageID: id(10), promptHash: createHash('sha256').update(question).digest('hex') };
const tools = ['panda_web_search', 'panda_rag_search', 'todowrite', 'question', 'skill'];
const assistant = (n, content, completed) => ({ id: id(n), type: 'assistant', agent: 'panda', model: { providerID: 'panda-research', id: 'fixture' }, content, finish: 'stop', time: { created: n, completed } });
const tool = (name, call, n) => ({ type: 'tool', id: call, name, state: { status: 'completed', input: { query: 'public documentation' }, content: [{ type: 'text', text: '{"sources":["fixture"]}' }], metadata: { private: 'metadata-secret' } }, native: { private: 'native-secret' }, time: { created: n, ran: n + 1, completed: n + 2 } });
function fixture() {
 return { session: { outcome: 'succeeded', time: { created: 1, updated: 70, busy: 9, idle: 70 } }, active: false, messages: [
  { id: id(2), type: 'user', text: 'Older project details', time: { created: 2 } },
  assistant(3, [{ type: 'text', text: 'Old answer must not settle current turn.' }], 3.5),
  { id: id(4), type: 'idle', outcome: 'succeeded', time: { created: 4 } },
  { id: id(5), type: 'user', text: 'Another old turn', time: { created: 5 } },
  assistant(6, [{ type: 'text', text: 'Another older answer.' }], 6.5),
  { id: id(7), type: 'idle', outcome: 'succeeded', time: { created: 7 } },
  { id: expected.messageID, type: 'user', text: question, time: { created: 10 } },
  assistant(20, [{ type: 'reasoning', text: 'reasoning-secret' }, { type: 'text', text: 'Intermediate prose.' }, tool('panda_rag_search', 'call_rag', 21)], 25),
  assistant(30, [tool('panda_web_search', 'call_web', 31)], 35),
  { id: id(40), type: 'compaction', status: 'completed', reason: 'auto', summary: 'private-summary', native: { private: 'compaction-secret' }, cost: 999, time: { created: 40 } },
  assistant(50, [{ type: 'text', text: 'Use the cited manufacturer setup guide.' }], 60),
  { id: id(70), type: 'idle', outcome: 'succeeded', time: { created: 70 } },
 ] };
}
const read = (m, f, allow = tools) => m.projectResearchTurn(expected, f.session, f.active, f.messages, allow);

test('native multi-step current turn releases only the final answer and correlated private tools', async () => {
 const m = await module(), f = fixture(), r = read(m, f);
 assert.equal(r.state, 'terminal'); assert.equal(r.outcome, 'succeeded');
 assert.equal(r.text, 'Use the cited manufacturer setup guide.');
 assert.deepEqual(r.tools.map(t => [t.assistantMessageID, t.id, t.name, t.status]), [[id(20), 'call_rag', 'panda_rag_search', 'completed'], [id(30), 'call_web', 'panda_web_search', 'completed']]);
 assert.deepEqual(r.compactions, [{ id: id(40), status: 'completed', reason: 'auto', created: 40 }]);
 assert.deepEqual(r.todos, []);
 for (const secret of ['reasoning-secret', 'metadata-secret', 'native-secret', 'compaction-secret', 'private-summary', 'Intermediate prose', 'Older project']) assert.equal(JSON.stringify(r).includes(secret), false, secret);
 r.tools[0].input.query = 'changed'; assert.equal(f.messages[7].content[2].state.input.query, 'public documentation');
});

test('active execution and native failures never release partial text; restart busy time alone is not rejection', async () => {
 const m = await module();
 const active = fixture(); active.active = true; assert.deepEqual(read(m, active), { state: 'pending' });
 const absent = fixture(); delete absent.session.outcome; assert.deepEqual(read(m, absent), { state: 'pending' });
 for (const outcome of ['failed', 'interrupted']) {
  const f = fixture(); f.session.outcome = outcome; f.messages.at(-1).outcome = outcome;
  delete f.messages[10].time.completed; f.messages[7].content[2].state = { status: 'running', input: {}, metadata: {} };
  delete f.messages[7].content[2].time.completed;
  assert.deepEqual(read(m, f), { state: 'terminal', outcome });
 }
 const restarted = fixture(); restarted.session.time.busy = 45;
 assert.equal(read(m, restarted).outcome, 'succeeded');
});

test('stale, foreign, unresolved and malformed native records cannot complete the current prompt', async () => {
 const m = await module();
 const mutations = [
  f => { f.messages[6].text = 'Different prompt'; },
  f => { f.messages[6].id = id(11); },
  f => { f.messages.pop(); },
  f => { f.messages.at(-1).outcome = 'failed'; },
  f => { f.messages.push({ id: id(80), type: 'user', text: 'Steering is not this admitted prompt', time: { created: 80 } }); },
  f => { f.messages[10].time.completed = 71; },
  f => { f.session.time.idle = 59; },
  f => { f.messages[7].content[2].name = 'shell'; },
  f => { f.messages[7].content[2].time.completed = 29; },
  f => { f.messages[7].content[2].state.input = 'not an object'; },
  f => { f.messages[7].content[2].state.content = [{ type: 'file', uri: 'file:///private', mime: 'text/plain' }]; },
  f => { f.messages[7].content.push(structuredClone(f.messages[7].content[2])); },
  f => { f.messages[8].retry = { attempt: 1 }; },
  f => { f.messages[8].error = { message: 'provider-secret' }; },
  f => { f.messages[10].finish = 'length'; },
  f => { f.messages[10].content.push(tool('panda_web_search', 'late-tool', 51)); },
  f => { f.messages[9].status = 'running'; },
  f => { f.messages[9].status = 'failed'; },
  f => { f.messages[8].type = 'shell'; },
  f => { f.messages[8].type = 'model-switched'; },
  f => { f.messages[7].content[2].state.status = 'running'; delete f.messages[7].content[2].time.completed; },
  f => { f.messages[10].content = [{ type: 'text', text: '\ud800' }]; },
 ];
 for (const mutate of mutations) { const f = fixture(); mutate(f); assert.deepEqual(read(m, f), { state: 'unknown' }, mutate.toString()); }
});

test('settled tool errors are represented without raw failure details; native todos are projected, not generated', async () => {
 const m = await module(), f = fixture();
 f.messages[7].content[2].state = { status: 'error', input: {}, error: { message: 'provider-secret' }, content: [{ type: 'text', text: 'error-secret' }] };
 const todo = tool('todowrite', 'call_todo', 31); todo.state.metadata = { todos: [{ content: 'Inspect manufacturer evidence', status: 'completed' }], secret: 'do-not-project' };
 f.messages[8].content.push(todo);
 const r = read(m, f); assert.equal(r.outcome, 'succeeded');
 assert.deepEqual(r.tools[0].content, []); assert.equal(r.tools[0].status, 'error');
 assert.deepEqual(r.todos, [{ content: 'Inspect manufacturer evidence', status: 'completed' }]);
 assert.equal(JSON.stringify(r).includes('secret'), false);
 todo.state.metadata.todos[0].status = 'made-up'; assert.deepEqual(read(m, f), { state: 'unknown' });
});

test('bounds reject oversized, cyclic, executable and deeply nested input without evaluating accessors', async () => {
 const m = await module();
 for (const mutate of [
  f => { f.messages[10].content = [{ type: 'text', text: 'x'.repeat(24001) }]; },
  f => { let input = {}, cursor = input; for (let i = 0; i < 15; i++) cursor = cursor.deep = {}; f.messages[7].content[2].state.input = input; },
  f => { f.messages[7].state = f.messages; },
  f => { f.messages[7].content[2].state.input = { toJSON() { throw Error('must not execute'); } }; },
 ]) { const f = fixture(); mutate(f); assert.deepEqual(read(m, f), { state: 'unknown' }); }
 let touched = false; const f = fixture(); Object.defineProperty(f.messages[7], 'secret', { enumerable: true, get() { touched = true; return 'secret'; } });
 assert.deepEqual(read(m, f), { state: 'unknown' }); assert.equal(touched, false);
 assert.deepEqual(read(m, fixture(), ['panda_web_search', 'panda_web_search']), { state: 'unknown' });
});

test('terminal failure still requires tool chronology, and idle cannot predate completed work', async () => {
 const m = await module();
 const cancelled = fixture(); cancelled.session.outcome = 'interrupted'; cancelled.messages.at(-1).outcome = 'interrupted';
 delete cancelled.messages[7].time.completed; cancelled.messages[7].content[2].time.completed = 80;
 assert.deepEqual(read(m, cancelled), { state: 'unknown' });
 const prematureIdle = fixture(); prematureIdle.session.time.idle = 80; prematureIdle.session.time.updated = 80; prematureIdle.messages[10].time.completed = 75;
 assert.deepEqual(read(m, prematureIdle), { state: 'unknown' });
 const foreignClock = fixture(); foreignClock.session.time.created = 11; foreignClock.session.time.busy = 45;
 assert.deepEqual(read(m, foreignClock), { state: 'unknown' });
});

test('an idle marker from before the latest busy period and tools started after step completion are unknown', async () => {
 const m = await module(), stale = fixture(); stale.session.time.busy = 75; stale.session.time.idle = 80; stale.session.time.updated = 80;
 assert.deepEqual(read(m, stale), { state: 'unknown' });
 for (const outcome of ['failed', 'interrupted']) {
  const f = fixture(); f.session.outcome = outcome; f.messages.at(-1).outcome = outcome;
  f.messages[7].content[2].state = { status: 'running', input: {}, metadata: {} };
  f.messages[7].content[2].time = { created: 21, ran: 26 };
  assert.deepEqual(read(m, f), { state: 'unknown' });
 }
});

test('native enum fields are literal strings without array coercion', async () => {
 const m = await module();
 const compaction = fixture(); compaction.messages[9].reason = ['auto']; assert.deepEqual(read(m, compaction), { state: 'unknown' });
 const active = fixture(); active.active = true; active.messages[7].content[2].state.status = ['running']; assert.deepEqual(read(m, active), { state: 'unknown' });
 const f = fixture(), item = tool('todowrite', 'todo', 31); item.state.metadata = { todos: [{ content: 'Task', status: ['completed'] }] }; f.messages[8].content.push(item);
 assert.deepEqual(read(m, f), { state: 'unknown' });
});
