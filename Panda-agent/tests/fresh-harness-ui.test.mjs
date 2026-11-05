import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream } from '../src/ui/chat-stream.ts';
const event = value => 'data: ' + JSON.stringify(value) + '\n\n';
const stream = text => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
test('only saved answers follow actual evidence stages; provisional text is rejected', async () => {
  const seen = [];
  const final = event({ type: 'complete', data: { thread: {}, messages: [] } });
  const result = await readChatStream(stream(event({ type: 'activity', stage: 'selecting_evidence' }) + final), stage => seen.push(stage));
  assert.deepEqual(seen, ['selecting_evidence']);
  assert.equal(result.type, 'complete');
  await assert.rejects(readChatStream(stream(event({ type: 'text_delta', text: 'unsaved' }) + final), () => {}));
});
