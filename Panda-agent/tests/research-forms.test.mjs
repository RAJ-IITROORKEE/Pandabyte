import test from 'node:test';
import assert from 'node:assert/strict';
async function module() { let value; await assert.doesNotReject(async () => { value = await import('../src/opencode/research-forms.ts'); }, 'native question projection must be implemented'); return value; }
const nativeID = (prefix, n) => prefix + n.toString(16).padStart(12, '0') + 'A'.repeat(14);
const binding = { sessionID: nativeID('ses_', 1), expectedGeneration: 'a'.repeat(64), currentGeneration: 'a'.repeat(64), assistantMessageID: nativeID('msg_', 10), toolID: 'call_question' };
function detail() { return { id: nativeID('frm_', 20), sessionID: binding.sessionID, title: 'Choose the project constraints', metadata: { kind: 'question', tool: { messageID: binding.assistantMessageID, id: binding.toolID }, private: 'metadata-secret' }, fields: [
 { key: 'q0', type: 'string', title: 'Project name', required: true, custom: true, options: [{ value: 'GreenPanda', label: 'GreenPanda' }] },
 { key: 'q1', type: 'multiselect', title: 'Interfaces', required: true, minItems: 1, maxItems: 2, options: [{ value: 'wifi', label: 'Wi-Fi' }, { value: 'ble', label: 'Bluetooth' }] },
 ], state: { status: 'pending' } }; }
test('native Form.Detail becomes an owned question with explicit pending reply semantics', async () => {
 const m = await module(), raw = detail(), r = m.parseResearchQuestion(raw, binding);
 assert.equal(r.state, 'available'); assert.equal(r.question.state.status, 'pending');
 assert.equal(JSON.stringify(r).includes('metadata-secret'), false);
 const answer = { q0: 'GreenPanda', q1: ['wifi', 'ble'] };
 const copied = m.validateResearchAnswer(r.question, answer); assert.deepEqual(copied, answer);
 copied.q1.pop(); assert.equal(answer.q1.length, 2);
 assert.deepEqual(m.validateResearchAnswer(r.question, { q0: 'Owner-selected name', q1: ['wifi'] }), { q0: 'Owner-selected name', q1: ['wifi'] });
});
test('native question is unavailable on generation change; foreign and state-less forms are invalid', async () => {
 const m = await module();
 assert.deepEqual(m.parseResearchQuestion(detail(), { ...binding, currentGeneration: 'b'.repeat(64) }), { state: 'unavailable' });
 for (const mutate of [
  f => { f.sessionID = 'global'; }, f => { f.metadata.kind = 'authentication'; }, f => { f.metadata.tool.id = 'foreign'; },
  f => { f.metadata.tool.messageID = nativeID('msg_', 11); }, f => { delete f.state; }, f => { f.id = '../foreign'; },
  f => { f.fields[0].hidden = true; }, f => { f.fields[0].pattern = '.*'; }, f => { f.fields[0].format = 'uri'; },
  f => { f.fields[0].type = 'external'; }, f => { f.fields[0].minItems = 1; }, f => { f.fields[1].minLength = 1; },
  f => { f.fields[0].options.push({ value: 'GreenPanda', label: 'Duplicate' }); }, f => { f.fields[1].key = 'q0'; },
  f => { f.title = 'x'.repeat(301); }, f => { f.fields[0].title = '\ud800'; },
 ]) { const f = detail(); mutate(f); assert.deepEqual(m.parseResearchQuestion(f, binding), { state: 'invalid' }, mutate.toString()); }
 assert.deepEqual(m.parseResearchQuestion({ data: detail() }, binding), { state: 'invalid' });
});
test('reply validation enforces required values, option/custom rules, types, bounds and displayed keys', async () => {
 const m = await module(), q = m.parseResearchQuestion(detail(), binding).question;
 for (const answer of [{}, { q0: '  ', q1: ['wifi'] }, { q0: 'GreenPanda', q1: [] }, { q0: 'GreenPanda', q1: ['wifi', 'wifi'] }, { q0: 'GreenPanda', q1: ['secret-option'] }, { q0: true, q1: ['wifi'] }, { q0: 'GreenPanda', q1: 'wifi' }, { q0: 'GreenPanda', q1: ['wifi'], hidden: 'value' }, { q0: 'x'.repeat(2001), q1: ['wifi'] }, { q0: '\ud800', q1: ['wifi'] }]) assert.equal(m.validateResearchAnswer(q, answer), null);
 const locked = detail(); locked.fields[0].custom = false;
 assert.equal(m.validateResearchAnswer(m.parseResearchQuestion(locked, binding).question, { q0: 'Other', q1: ['wifi'] }), null);
});
test('answered native state uses the same validation and terminal forms cannot receive another reply', async () => {
 const m = await module(), f = detail(); f.state = { status: 'answered', answer: { q0: 'GreenPanda', q1: ['wifi'] } };
 const r = m.parseResearchQuestion(f, binding); assert.equal(r.state, 'available'); assert.equal(r.question.state.status, 'answered');
 assert.equal(m.validateResearchAnswer(r.question, f.state.answer), null);
 f.state.answer.q1 = ['foreign']; assert.deepEqual(m.parseResearchQuestion(f, binding), { state: 'invalid' });
 const cancelled = detail(); cancelled.state = { status: 'cancelled', message: 'private-cancellation-secret' };
 const c = m.parseResearchQuestion(cancelled, binding); assert.equal(c.state, 'available'); assert.deepEqual(c.question.state, { status: 'cancelled' });
 assert.equal(JSON.stringify(c).includes('private-cancellation-secret'), false); assert.equal(m.validateResearchAnswer(c.question, {}), null);
});

test('literal types and explicit null properties cannot be normalized into an accepted field', async () => {
 const m = await module();
 for (const mutate of [f => { f.fields[0].type = ['string']; }, f => { f.fields[0].options = null; },
  f => { f.fields[0].minLength = null; }, f => { f.fields[0].maxLength = null; }, f => { f.fields[1].minItems = null; }, f => { f.fields[1].maxItems = null; }]) {
  const f = detail(); mutate(f); assert.deepEqual(m.parseResearchQuestion(f, binding), { state: 'invalid' }, mutate.toString());
 }
});

test('inherited array serializers and iterators never execute during native JSON validation', async () => {
 const m = await module(); let touched = false;
 class ExecutableArray extends Array { toJSON() { touched = true; return []; } }
 const f = detail(); f.fields = new ExecutableArray(...f.fields);
 assert.deepEqual(m.parseResearchQuestion(f, binding), { state: 'invalid' }); assert.equal(touched, false);
 const custom = detail(); Object.setPrototypeOf(custom.fields, { *[Symbol.iterator]() { touched = true; } });
 assert.deepEqual(m.parseResearchQuestion(custom, binding), { state: 'invalid' }); assert.equal(touched, false);
});

test('closed options reject empty strings while absent options preserve native free text', async () => {
 const m = await module(), f = detail(); f.fields[0].required = false; f.fields[0].custom = false;
 const closed = m.parseResearchQuestion(f, binding).question;
 assert.equal(m.validateResearchAnswer(closed, { q0: '', q1: ['wifi'] }), null);
 f.state = { status: 'answered', answer: { q0: '', q1: ['wifi'] } };
 assert.deepEqual(m.parseResearchQuestion(f, binding), { state: 'invalid' });
 const open = detail(); delete open.fields[0].options; delete open.fields[0].custom;
 const q = m.parseResearchQuestion(open, binding).question;
 assert.deepEqual(m.validateResearchAnswer(q, { q0: 'Ordinary free text', q1: ['wifi'] }), { q0: 'Ordinary free text', q1: ['wifi'] });
});

test('native producer-shaped questions and exact multibyte serialized reply limits are supported', async () => {
 const m = await module(), f = detail();
 for (const field of f.fields) { field.custom = true; delete field.required; delete field.minItems; delete field.maxItems; }
 const r = m.parseResearchQuestion(f, binding); assert.equal(r.state, 'available'); assert.equal(r.question.fields[0].required, false);
 const exact = { q0: '😀'.repeat(997) + 'x'.repeat(3) }; assert.equal(Buffer.byteLength(JSON.stringify(exact)), 4000);
 assert.deepEqual(m.validateResearchAnswer(r.question, exact), exact);
 assert.equal(m.validateResearchAnswer(r.question, { q0: exact.q0 + 'x' }), null);
 for (const bad of [{ ...binding, expectedGeneration: 'not-a-generation' }, { ...binding, assistantMessageID: '../foreign' }, { ...binding, sessionID: 'global' }, { ...binding, toolID: '' }]) assert.deepEqual(m.parseResearchQuestion(f, bad), { state: 'invalid' });
});
