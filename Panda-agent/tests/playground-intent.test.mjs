import assert from 'node:assert/strict';
import { cases } from '../evaluation/playground/mini-cases.mjs';
import { matchApprovedPlaygroundCase, parsePlaygroundIntent } from '../src/control-room/playground-intent.ts';
const requestId = '11111111-1111-4111-8111-111111111111';
for (const item of cases) {
  const input = { requestId, question: item.question, productSku: item.productSku };
  assert.equal(matchApprovedPlaygroundCase(input), item.id);
  assert.deepEqual(parsePlaygroundIntent(input), { ...input, caseId: item.id });
  assert.equal(parsePlaygroundIntent({ ...input, requestId: 'bad' }), null);
  assert.equal(parsePlaygroundIntent({ ...input, question: item.question + ' ' }), null);
  assert.equal(parsePlaygroundIntent({ ...input, productSku: 'espx8266' }), null);
  assert.equal(parsePlaygroundIntent({ ...input, physicalRevision: 'other' }), null);
}
assert.equal(matchApprovedPlaygroundCase({ question: 'other', productSku: 'ESPX8266' }), null);
assert.equal(parsePlaygroundIntent(null), null);
assert.equal(parsePlaygroundIntent([]), null);
assert.equal(parsePlaygroundIntent({ requestId }), null);
console.log('Playground frozen intent checks passed; provider calls: 0');
