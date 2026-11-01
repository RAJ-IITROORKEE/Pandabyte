import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeNativeText } from '../src/server/native-events.ts';
const sessionID = `ses_${'f'.repeat(12)}${'A'.repeat(14)}`;
const message = `msg_${'a'.repeat(12)}${'B'.repeat(14)}`;
const ev = (type, data, id = Math.random().toString()) => ({ type, data, id });
const start = () => [ev('session.execution.started', { sessionID }), ev('session.text.started', { sessionID, assistantMessageID: message, ordinal: 0 })];
const delta = text => ev('session.text.delta', { sessionID, assistantMessageID: message, ordinal: 0, delta: text });
const end = text => ev('session.text.ended', { sessionID, assistantMessageID: message, ordinal: 0, text });
async function setup(events, cb = () => {}) {
  let controller, resets = 0, text = '';
  const body = new ReadableStream({ start(c) { controller = c; } });
  const fetcher = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  const pending = observeNativeText({ endpoint: 'http://127.0.0.1:1234', authorization: 'fixture', fetcher, sessionID, deadline: Date.now()+10000, onText: s => { text += s; cb(s); }, onTextReset: () => { resets++; } });
  const send = values => { const bytes = new TextEncoder().encode(values.map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join('')); for (const b of bytes) controller.enqueue(Uint8Array.of(b)); };
  await new Promise(resolve => setTimeout(resolve, 0));
  send([{ type: 'server.connected', data: {} }]);
  const observer = await pending;
  send(events);
  await new Promise(resolve => setTimeout(resolve, 20));
  return { observer, controller, get text() { return text; }, get resets() { return resets; }, send };
}
test('fragmented UTF-8 and CRLF forward only matching text and reconcile', async () => {
  const f = await setup([ev('session.text.delta', { sessionID: 'foreign', delta: 'secret' }), ...start(), ev('session.reasoning.delta', { sessionID, delta: 'secret' }), delta('Hi 😀'), end('Hi 😀')]);
  assert.equal(f.text, 'Hi 😀'); f.observer.reconcile('Hi 😀'); assert.equal(f.resets, 0); f.observer.close();
});
test('gaps, duplicates, ordinals, callback failures and disconnect discard provisional output', async () => {
  for (const events of [ [...start(), delta('a'), end('ab')], [...start(), delta('a'), ev('session.text.delta', { sessionID, assistantMessageID: message, ordinal: 2, delta: 'b' })], (() => { const d = delta('a'); return [...start(), d, d]; })() ]) {
    const f = await setup(events); assert.equal(f.text, 'a'); assert.equal(f.resets, 1); f.observer.close();
  }
  const f = await setup([...start(), delta('a')], () => { throw Error(); }); assert.equal(f.resets, 1); f.observer.close();
  const g = await setup([...start(), delta('a')]); g.controller.close(); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(g.resets, 1); g.observer.close();
});
test('final mismatch and bounded text discard provisional output', async () => {
  const f = await setup([...start(), delta('a'), end('a')]); f.observer.reconcile('b'); assert.equal(f.resets, 1); f.observer.close();
  const g = await setup([...start(), delta('a'), delta('x'.repeat(6000))]); assert.equal(g.text, 'a'); assert.equal(g.resets, 1); g.observer.close();
});
