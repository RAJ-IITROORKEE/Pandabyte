import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream } from '../src/ui/chat-stream.ts';
const encode = new TextEncoder();
function stream(chunks) { return new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(typeof chunk === 'string' ? encode.encode(chunk) : chunk); c.close(); } }); }
const complete = 'data: {"type":"complete","data":{"thread":{},"messages":[]}}\n\n';
test('handles UTF-8 and CRLF split across chunks and ignores comments', async () => {
  const bytes = encode.encode(': ping\r\ndata: {"type":"activity","stage":"reading_sources"}\r\n\r\ndata: {"type":"complete","data":{"text":"é"}}\r\n\r\n');
  const seen = [];
  const result = await readChatStream(stream([...bytes].map(b => new Uint8Array([b]))), stage => seen.push(stage));
  assert.deepEqual(seen, ['reading_sources']); assert.equal(result.data.text, 'é');
});
test('rejects invalid, incomplete, duplicate and trailing events', async () => {
  for (const content of ['data: {"type":"activity","stage":"unknown"}\n\n', complete + complete, complete + 'data: {}\n\n', 'data: {"type":"complete"}', 'data: {}\n\n']) await assert.rejects(readChatStream(stream([content]), () => {}));
});
test('enforces event and response bounds', async () => {
  const activity = 'data: {"type":"activity","stage":"reading_sources"}\n\n';
  await assert.rejects(readChatStream(stream([activity.repeat(65) + complete]), () => {}));
  await assert.rejects(readChatStream(stream([new Uint8Array(4 * 1024 * 1024 + 1)]), () => {}));
});
test('accepts only the bounded web-search activity event', async () => {
  const seen = [];
  const activity = 'data: {"type":"activity","stage":"searching_web"}\n\n';
  const result = await readChatStream(stream([activity, complete]), stage => seen.push(stage));
  assert.deepEqual(seen, ['searching_web']); assert.equal(result.type, 'complete');
  await assert.rejects(readChatStream(stream(['data: {"type":"activity","stage":"searching_web","query":"private"}\n\n', complete]), () => {}));
});

test('context is a single bounded count-only event before the saved final', async () => {
  const summary = { fragments: 2, characters: 81, duplicatesRemoved: 1, limitCharacters: 20000 };
  const event = `data: ${JSON.stringify({ type: 'context', ...summary })}\n\n`;
  const contexts = [];
  const result = await readChatStream(stream([event, complete]), () => {}, value => contexts.push(value));
  assert.equal(result.type, 'complete'); assert.deepEqual(contexts, [summary]);
  assert.equal((await readChatStream(stream([event, complete]), () => {})).type, 'complete');
  for (const value of [{ ...summary, fragments: 9 }, { ...summary, characters: 20001 }, { ...summary, question: 'private' }, { ...summary, fragments: 1.5 }, { ...summary, limitCharacters: 30000 }, { ...summary, characters: 1 }]) {
    await assert.rejects(readChatStream(stream([`data: ${JSON.stringify({ type: 'context', ...value })}\n\n`, complete]), () => {}));
  }
  await assert.rejects(readChatStream(stream([event, event, complete]), () => {}));
  await assert.rejects(readChatStream(stream([complete, event]), () => {}));
});

const sse = value => `data: ${JSON.stringify(value)}\n\n`;
test('fragmented genuine deltas, reset and tool activity precede authoritative saved final', async () => {
  const text = sse({ type: 'text_delta', text: 'Hello é' }) + sse({ type: 'text_reset' }) + sse({ type: 'text_delta', text: 'New answer' }) + sse({ type: 'tool_activity', tool: 'rag_search', status: 'completed' }) + complete;
  const bytes = encode.encode(text), seen = [], tools = [];
  const result = await readChatStream(stream([...bytes].map(byte => new Uint8Array([byte]))), () => {}, undefined, { onText: value => seen.push(value), onReset: () => seen.push('reset'), onTool: value => tools.push(value) });
  assert.deepEqual(seen, ['Hello é', 'reset', 'New answer']);
  assert.deepEqual(tools, [{ tool: 'rag_search', status: 'completed' }]);
  assert.equal(result.type, 'complete'); assert.deepEqual(result.data.messages, []);
});
test('rejects unconfirmed, malformed, foreign and oversized provisional events', async () => {
  const delta = sse({ type: 'text_delta', text: 'hello' });
  for (const content of [delta, delta + 'data: {', sse({ type: 'text_reset', reason: 'private' }) + complete, sse({ type: 'text_delta', text: '' }) + complete, sse({ type: 'text_delta', text: '\ud800' }) + complete, sse({ type: 'tool_activity', tool: 'shell', status: 'started' }) + complete, sse({ type: 'tool_activity', tool: 'rag_search', status: 'started', args: 'private' }) + complete, sse({ type: 'text_delta', text: 'a'.repeat(4097) }) + complete, sse({ type: 'text_delta', text: 'a'.repeat(4000) }) + sse({ type: 'text_delta', text: 'b'.repeat(2001) }) + complete]) {
    await assert.rejects(readChatStream(stream([content]), () => {}));
  }
});
test('bounds total text across resets and independently bounds tool events', async () => {
  const delta = sse({ type: 'text_delta', text: 'a'.repeat(4096) }), reset = sse({ type: 'text_reset' });
  await assert.rejects(readChatStream(stream([(delta + reset).repeat(65) + complete]), () => {}));
  const tool = sse({ type: 'tool_activity', tool: 'web_search', status: 'started' });
  await assert.rejects(readChatStream(stream([tool.repeat(65) + complete]), () => {}));
});
