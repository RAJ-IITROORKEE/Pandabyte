import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composerGates, recoveredDraft } from './composer-gates.ts';
import { ExternalStoreThreadRuntimeCore } from '@assistant-ui/core/internal';
import { enqueuePrompt } from './prompt-queue.ts';

const ready = { previewReadOnly: false, selectedArchived: false, modelUnavailable: false, capabilityLoading: false, loading: false, mutating: false, uncertain: false, status: 'idle', running: false };

test('Ready model with a pending or blocked chat keeps drafting available and sends blocked', () => {
  assert.deepEqual(composerGates(ready), { draftDisabled: false, sendDisabled: false, reason: null });
  for (const status of ['pending', 'blocked']) {
    const gates = composerGates({ ...ready, status });
    assert.equal(gates.draftDisabled, false);
    assert.equal(gates.sendDisabled, true);
    assert.match(gates.reason, /Check status.*cancel.*new chat/);
  }
});

test('unavailable, refreshing, loading, mutating and uncertain states only gate sending', () => {
  for (const key of ['modelUnavailable', 'capabilityLoading', 'loading', 'mutating', 'uncertain']) {
    const gates = composerGates({ ...ready, [key]: true });
    assert.equal(gates.draftDisabled, false, key);
    assert.equal(gates.sendDisabled, true, key);
    assert.match(gates.reason, /draft/, key);
  }
});

test('preview and archived chats remain read only, including during a run', () => {
  for (const key of ['previewReadOnly', 'selectedArchived']) {
    for (const running of [false, true]) {
      const gates = composerGates({ ...ready, [key]: true, running });
      assert.equal(gates.draftDisabled, true);
      assert.equal(gates.sendDisabled, true);
    }
  }
});

test('running capability refresh permits drafts while direct sends remain blocked', () => {
  const gates = composerGates({ ...ready, running: true, capabilityLoading: true });
  assert.equal(gates.draftDisabled, false);
  assert.equal(gates.sendDisabled, true);
});

test('recovery and cancellation restore a sent question only when the draft is empty', () => {
  assert.equal(recoveredDraft('my follow-up', 'original question'), 'my follow-up');
  assert.equal(recoveredDraft('', 'original question'), 'original question');
  assert.equal(recoveredDraft(' ', 'original question'), ' ');
});

test('installed runtime keeps drafts through recovery states and blocks programmatic sends', async () => {
  let sends = 0;
  const adapter = { messages: [], onNew: async () => { sends++; } };
  const thread = new ExternalStoreThreadRuntimeCore({ getModelContext: () => ({}) }, adapter);
  thread.composer.setText('my next question');
  for (const state of [
    { status: 'pending' }, { status: 'blocked' }, { uncertain: true },
    { capabilityLoading: true }, { modelUnavailable: true }, { loading: true },
  ]) {
    const gates = composerGates({ ...ready, ...state });
    thread.__internal_setAdapter({ ...adapter, isDisabled: gates.draftDisabled, isSendDisabled: gates.sendDisabled });
    assert.equal(thread.isDisabled, false);
    assert.equal(thread.composer.canSend, false);
    await thread.composer.send();
    assert.equal(sends, 0);
    assert.equal(thread.composer.text, 'my next question');
  }
  thread.__internal_setAdapter({ ...adapter, isDisabled: false, isSendDisabled: false });
  assert.equal(thread.composer.text, 'my next question');
  assert.equal(thread.composer.canSend, true);
});

test('running queue remains independent of direct-send gating and stops at three without losing the draft', async () => {
  let sends = 0;
  const gates = composerGates({ ...ready, running: true, capabilityLoading: true });
  const thread = new ExternalStoreThreadRuntimeCore({ getModelContext: () => ({}) }, {
    messages: [], isRunning: true, isDisabled: gates.draftDisabled, isSendDisabled: gates.sendDisabled,
    onNew: async () => { sends++; },
  });
  let queue = [];
  for (let i = 0; i < 3; i++) {
    thread.composer.setText(`follow-up ${i}`);
    queue = enqueuePrompt(queue, { id: String(i), threadId: 'chat', text: thread.composer.text, modelId: 'openai/gpt-6-luna' });
    thread.composer.setText('');
  }
  thread.composer.setText('fourth follow-up');
  assert.equal(enqueuePrompt(queue, { id: 'four', threadId: 'chat', text: thread.composer.text, modelId: 'openai/gpt-6-luna' }), queue);
  await thread.composer.send();
  assert.equal(thread.isDisabled, false);
  assert.equal(thread.composer.text, 'fourth follow-up');
  assert.equal(sends, 0);
  assert.equal(queue.length, 3);
});
