import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareGuideInput, messagePayload, guideDisabled } from '../src/ui/guide-input.ts';

test('guide input trims intent and enforces bounded, valid components', () => {
  assert.deepEqual(prepareGuideInput(' Goal ', ' Board ', ' ', ' Sensor \n Display ', 2), { goal: 'Goal', board: 'Board', components: ['Sensor', 'Display'], expectedVersion: 2 });
  assert.equal(prepareGuideInput('', 'Board', '', '', 0), null);
  assert.equal(prepareGuideInput('Goal', 'Board', '', Array(9).fill('part').join('\n'), 0), null);
  assert.equal(prepareGuideInput('Goal', 'Board', '', '\ud800', 0), null);
  assert.equal(prepareGuideInput('Goal', 'Board', '', '', -1), null);
});

test('only an explicit guide-disabled conflict is a known non-admission', () => {
  assert.equal(guideDisabled(409, { error: 'guide_disabled' }), true);
  assert.equal(guideDisabled(503, { error: 'guide_disabled' }), false);
  assert.equal(guideDisabled(409, { error: 'conflict' }), false);
  assert.equal(guideDisabled(409, null), false);
});

test('guide submission never includes question or web search', () => {
  const guide = { goal: 'Goal', board: 'Board', components: [], expectedVersion: 0 };
  assert.deepEqual(messagePayload('request', { guide }), { requestId: 'request', guide });
  assert.deepEqual(messagePayload('request', { question: 'What?', webSearch: false }), { requestId: 'request', question: 'What?' });
  assert.deepEqual(messagePayload('request', { question: 'What?', webSearch: true }), { requestId: 'request', question: 'What?', webSearch: true });
});
