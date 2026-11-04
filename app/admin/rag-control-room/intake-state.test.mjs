import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLineBreaks, omitBlankOptionalFields, reviewOutcome, uploadOutcome } from './intake-state.ts';

test('only a pending-review upload is reported saved', () => {
  assert.equal(uploadOutcome({ kind: 'upload', status: 'pending_review' }), 'saved');
  assert.equal(uploadOutcome({ kind: 'upload', status: 'upload_failed' }), 'failed');
  for (const value of [null, {}, { kind: 'upload', status: 'upload_outcome_unknown' }, { kind: 'upload', status: 'upload_pending' }, { kind: 'link', status: 'pending_review' }]) assert.equal(uploadOutcome(value), 'unknown');
});

test('multiline metadata is saved as spaces without changing other characters', () => {
  assert.equal(normalizeLineBreaks('one\r\ntwo\nthree\rfour'), 'one two three\rfour');
  assert.equal(normalizeLineBreaks(null), null);
});

test('review server failures are ambiguous while version and access rejections are known', () => {
  assert.equal(reviewOutcome(200), 'saved');
  assert.equal(reviewOutcome(409), 'rejected');
  assert.equal(reviewOutcome(403), 'rejected');
  assert.equal(reviewOutcome(503), 'unknown');
  assert.equal(reviewOutcome(502), 'unknown');
});

test('blank optional multipart metadata is omitted while supplied values remain', () => {
  const form = new FormData();
  form.set('title', 'Test'); form.set('publisher', '  '); form.set('purpose', 'Research'); form.set('rightsEvidence', '');
  omitBlankOptionalFields(form);
  assert.equal(form.get('title'), 'Test'); assert.equal(form.get('publisher'), null); assert.equal(form.get('purpose'), 'Research'); assert.equal(form.get('rightsEvidence'), null);
});
