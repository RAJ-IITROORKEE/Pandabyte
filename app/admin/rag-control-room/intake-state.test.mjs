import test from 'node:test';
import assert from 'node:assert/strict';
import { isPreparedDocument, normalizeLineBreaks, omitBlankOptionalFields, parsePendingPreparation, preparationStatus, reviewOutcome, uploadOutcome, validateIntakeFile } from './intake-state.ts';

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

test('preparation succeeds only for a correlated completed document', () => {
  assert.equal(isPreparedDocument({ status:'prepared', reference:'r1', version:1, chunkCount:2 }, 'r1'), true);
  for (const value of [null, { status:'processing', reference:'r1', version:1 }, { status:'prepared', reference:'other', version:1 }, { status:'prepared', reference:'r1', version:0 }]) assert.equal(isPreparedDocument(value, 'r1'), false);
});

test('preparation recovery requires correlated fresh status and server-authorized retry', () => {
  const pending = { reference:'123e4567-e89b-42d3-a456-426614174000', expectedVersion:2 };
  assert.deepEqual(parsePendingPreparation(pending), pending);
  assert.equal(parsePendingPreparation({...pending, text:'private'}), null);
  const status = { reference:pending.reference, sourceVersion:2, status:'processing', canRetry:false };
  assert.equal(preparationStatus(status, pending), 'waiting');
  assert.equal(preparationStatus({...status, canRetry:true}, pending), 'retry');
  assert.equal(preparationStatus({...status, sourceVersion:1, canRetry:true}, pending), 'unknown');
  assert.equal(preparationStatus({...status, status:'prepared', version:1, chunkCount:3}, pending), 'prepared');
  assert.equal(preparationStatus({...status, status:'prepared', version:1, chunkCount:3, canRetry:true}, pending), 'unknown');
});

test('file picker and drop validation enforce one supported bounded file', () => {
  const text = { name:'document.txt', type:'text/plain', size:3 };
  assert.equal(validateIntakeFile([text]), '');
  assert.equal(validateIntakeFile([{ name:'guide.md', type:'text/markdown', size:3145728 }]), '');
  assert.notEqual(validateIntakeFile([]), '');
  assert.notEqual(validateIntakeFile([text, text]), '');
  assert.notEqual(validateIntakeFile([{ ...text, size:3145729 }]), '');
  assert.notEqual(validateIntakeFile([{ ...text, type:'application/pdf' }]), '');
});

test('blank optional multipart metadata is omitted while supplied values remain', () => {
  const form = new FormData();
  form.set('title', 'Test'); form.set('publisher', '  '); form.set('purpose', 'Research'); form.set('rightsEvidence', '');
  omitBlankOptionalFields(form);
  assert.equal(form.get('title'), 'Test'); assert.equal(form.get('publisher'), null); assert.equal(form.get('purpose'), 'Research'); assert.equal(form.get('rightsEvidence'), null);
});
