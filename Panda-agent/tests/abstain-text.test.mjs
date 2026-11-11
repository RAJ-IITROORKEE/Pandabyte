import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerKind, needsProductText, noEvidenceText } from '../src/retrieval/abstain-text.ts';

test('abstention texts are classified and anything else is an answer', () => {
  assert.equal(answerKind(needsProductText), 'needs_product');
  assert.equal(answerKind(noEvidenceText), 'no_evidence');
  assert.equal(answerKind(`${noEvidenceText} More.`), 'answer');
  assert.equal(answerKind(''), 'answer');
});

test('the server saves the shared texts, not private copies', () => {
  const source = readFileSync(new URL('../src/server/basic-rag-chat-service.ts', import.meta.url), 'utf8');
  assert.match(source, /needsProductText/);
  assert.match(source, /noEvidenceText/);
  assert.doesNotMatch(source, /Please include one exact/);
});
