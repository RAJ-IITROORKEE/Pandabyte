import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatPresentation } from '../src/server/chat-presentation.ts';

test('coalesces real deltas behind fresh authorization and preserves Unicode boundaries', async () => {
  const events = []; let release; let checks = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const p = createChatPresentation(async () => { checks++; await gate; return true; }, e => events.push(e));
  p.callbacks.onText('a'.repeat(4095)); p.callbacks.onText('😀'); p.callbacks.onText('end');
  assert.equal(events.length, 0); release(); await p.drain();
  assert.equal(checks, 2);
  assert.equal(events.map(e => e.text).join(''), 'a'.repeat(4095) + '😀end');
  assert.ok(events.every(e => e.text.isWellFormed() && e.text.length <= 4096)); p.close();
});

test('revocation or closure while authorization waits cannot leak text', async () => {
  for (const closed of [false, true]) {
    let release; const events = []; const gate = new Promise(resolve => { release = resolve; });
    const p = createChatPresentation(async () => gate, e => events.push(e));
    p.callbacks.onText('private draft'); if (closed) p.close(); release(false); await p.drain();
    assert.deepEqual(events, closed ? [] : [{ type: 'text_reset' }]);
    p.callbacks.onText('late'); await p.drain(); assert.equal(events.some(e => e.type === 'text_delta'), false);
  }
});

test('malformed and overflowing native drafts reset without changing execution', async () => {
  for (const value of [undefined, '', '\ud800', 'x'.repeat(4097)]) {
    const events = []; const p = createChatPresentation(async () => true, e => events.push(e));
    assert.doesNotThrow(() => p.callbacks.onText(value)); await p.drain();
    assert.deepEqual(events, [{ type: 'text_reset' }]);
  }
  const events = []; const p = createChatPresentation(async () => true, e => events.push(e));
  p.callbacks.onText('x'.repeat(4000)); p.callbacks.onText('x'.repeat(2001)); await p.drain();
  assert.deepEqual(events, [{ type: 'text_reset' }]);
});

test('presentation send failures cannot reject a terminal execution', async () => {
  const p = createChatPresentation(async () => true, () => { throw Error('closed consumer'); });
  p.callbacks.onText('real native text'); await p.drain(); p.callbacks.onTextReset(); await p.drain();
});
