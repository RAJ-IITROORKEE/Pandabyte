import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestRequest, prepareTest, safeTestDto, verifyTest } from '../lib/checkout/razorpay-test-core.ts';

const requestKey = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const dto = { state: 'creating', reference: `TST-${attemptId}`, totalPaise: 100, mode: 'cart', items: [{ variantId: requestKey, quantity: 1 }] };
const claim = { ...dto, createProvider: true, requestKey, attemptId, nonce: requestKey, receipt: `PBRZ${'a'.repeat(32)}` };
test('creation uses the database amount once and recovers an uncertain result without a retry', async () => {
  const calls = [];
  const rpc = async (name) => { calls.push(name); if (name.endsWith('prepare')) return claim; if (name.endsWith('recover')) return { ...claim, state: 'unknown' }; throw Error('unexpected'); };
  let created = 0;
  const provider = { createOrder: async (_, input) => { created++; assert.equal(input.amount, 100); return { error: 'uncertain' }; } };
  const result = await prepareTest(rpc, provider, { idempotencyKey: requestKey, expectedSubtotalPaise: 999 }, 'proof', 'rzp_test_key', 'owner');
  assert.equal(created, 1); assert.deepEqual(calls, ['razorpay_test_prepare', 'razorpay_test_recover']);
  assert.equal(result.state, 'unknown'); assert.equal('nonce' in result, false); assert.equal('receipt' in result, false); assert.equal('createProvider' in result, false);
  await prepareTest(async () => dto, provider, { idempotencyKey: requestKey }, 'proof', 'rzp_test_key', 'owner');
  assert.equal(created, 1);
});
test('a different owner or request cannot invoke provider verification', async () => {
  let verified = false;
  const provider = { verifyOrder: async () => { verified = true; return { error: null }; } };
  await assert.rejects(verifyTest(async () => ({ requestKey: attemptId }), provider, { requestKey, orderId: 'order_123', paymentId: 'pay_123', signature: 'a'.repeat(64) }));
  assert.equal(verified, false);
});
test('matching managed order is bound once before returning checkout details', async () => {
  const calls = [];
  const rpc = async (name, args) => { calls.push([name, args]); return name.endsWith('prepare') ? claim : { ...dto, state: 'ready', key: 'rzp_test_key', providerOrderId: 'order_123' }; };
  const provider = { createOrder: async (_, input) => ({ error: null, data: { order: { environment: 'test', amount: input.amount, currency: 'inr', receipt: input.receipt, subjectType: 'user', subjectId: input.subject.id, orderId: 'order_123' }, checkoutOptions: { key: 'rzp_test_key', order_id: 'order_123', amount: 100, currency: 'inr' } } }) };
  const result = await prepareTest(rpc, provider, { idempotencyKey: requestKey }, 'proof', 'rzp_test_key', 'owner');
  assert.equal(result.state, 'ready'); assert.deepEqual(calls.map(c => c[0]), ['razorpay_test_prepare', 'razorpay_test_bind']);
});
test('strict inputs and response allowlist', () => {
  assert.ok(parseTestRequest({ requestKey }));
  assert.equal(parseTestRequest({ requestKey, extra: true }), null);
  assert.equal(parseTestRequest({ requestKey, orderId: 'order_1', paymentId: 'pay_1', signature: 'wrong' }, true), null);
  assert.deepEqual(safeTestDto({ ...dto, state: 'ready', key: 'rzp_test_123', providerOrderId: 'order_1', notes: 'private', items: [{ variantId: requestKey, quantity: 1, secret: true }] }), { ...dto, state: 'ready', key: 'rzp_test_123', providerOrderId: 'order_1' });
  assert.deepEqual(safeTestDto({ state: 'not_created', nonce: 'secret' }), { state: 'not_created' });
  for (const bad of [{ ...dto, reference: 'bad' }, { ...dto, totalPaise: 0 }, { ...dto, items: [dto.items[0], dto.items[0]] }, { ...dto, state: 'ready', providerOrderId: 'order_1', key: 'rzp_live_123' }, { ...dto, key: 'rzp_test_123' }]) assert.throws(() => safeTestDto(bad));
});
test('malformed claims never call the provider', async () => {
  let called = false;
  const provider = { createOrder: async () => { called = true; } };
  for (const bad of [{ ...claim, nonce: 'bad' }, { ...claim, items: [] }, { ...claim, state: 'not_created' }]) await assert.rejects(prepareTest(async () => bad, provider, { idempotencyKey: requestKey }, 'proof', 'rzp_test_key', 'owner'));
  assert.equal(called, false);
});
