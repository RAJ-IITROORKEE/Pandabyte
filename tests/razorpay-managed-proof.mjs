import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures } from './phase2-isolation.mjs';

const journal = new URL('../.bootstrap/razorpay-test/proof-fixtures.json', import.meta.url);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const save = (state, create = false) => writeFileSync(journal, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', ...(create ? { flag: 'wx' } : {}) });
const probe = context => context.admin.database.schema('public').from('razorpay_test_probes');
const requireOk = (value, label) => { if (!value) throw new Error(label); };
const resultFor = (client, receipt) => client.database.schema('public').rpc('razorpay_test_probe_result', { p_receipt: receipt });

// Keep provider diagnostics private while removing fields that could contain credentials.
function redact(value, seen = new WeakSet()) {
  if (typeof value === 'string') return value.replace(/(bearer\s+|(?:sk|rk)_(?:test|live)_)[^\s"']+/gi, '$1[redacted]');
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const entries = Object.getOwnPropertyNames(value).map(key => [key, /authorization|secret|token|password|api.?key/i.test(key) ? '[redacted]' : redact(value[key], seen)]);
  return Object.fromEntries(entries);
}
async function cleanup(context, state) {
  requireOk(state.purpose === 'pandabyte-managed-proof' && uuid.test(state.runId) && state.receipt === `PBTEST${state.runId.replaceAll('-', '')}` && Array.isArray(state.users) && state.users.length <= 2 && !state.cleaned, 'invalid_journal');
  for (const user of state.users) {
    requireOk(user.runId === state.runId, 'fixture_run_mismatch');
    await verifyFixtureOwnership(context.clerk, user);
  }
  const customer = state.users.find(user => user.role === 'customer');
  if (customer) {
    const result = await probe(context).delete().eq('subject', customer.userId).eq('receipt', state.receipt).eq('fixture_id', state.runId).eq('amount_paise', 100);
    requireOk(!result.error, 'probe_cleanup_failed');
  }
  if (state.users.length) await cleanFixtures(context, state.users, state.runId);
  state.cleaned = true;
  state.users = [];
  save(state);
}
async function inspect(client, state, customer) {
  const result = await resultFor(client, state.receipt);
  requireOk(!result.error && Array.isArray(result.data?.items) && result.data.items.length <= 1, 'managed_inspection_failed');
  const row = result.data.items[0];
  if (row) requireOk(row.environment === 'test' && row.subject_type === 'user' && row.subject_id === customer.userId && row.receipt === state.receipt && Number(row.amount) === 100 && row.currency.toLowerCase() === 'inr' && row.notes?.fixture === state.runId && row.notes?.purpose === state.purpose, 'managed_row_mismatch');
  return row;
}
async function main() {
  const args = process.argv.slice(2);
  requireOk(args.length === 0 || (args.length === 1 && args[0] === '--cleanup'), 'invalid_arguments');
  const context = await preflight();
  if (args.length) return cleanup(context, JSON.parse(readFileSync(journal, 'utf8')));
  const runId = randomUUID();
  const state = { purpose: 'pandabyte-managed-proof', runId, receipt: `PBTEST${runId.replaceAll('-', '')}`, users: [], cleaned: false, outcome: 'not_started' };
  assert.equal(state.receipt.length, 38);
  mkdirSync(new URL('../.bootstrap/razorpay-test/', import.meta.url), { recursive: true });
  save(state, true);
  try {
    const fixture = await createFixtures(context.clerk, runId, user => { state.users.push(user); save(state); });
    state.users = fixture.users;
    save(state);
    const customer = state.users.find(user => user.role === 'customer');
    requireOk(customer && state.users.some(user => user.role === 'staff'), 'fixtures_missing');
    const inserted = await probe(context).insert({ subject: customer.userId, receipt: state.receipt, fixture_id: runId, amount_paise: 100 });
    requireOk(!inserted.error, 'probe_insert_failed');
    const foreignRead = await resultFor(fixture.auth.staff.database, state.receipt);
    requireOk(foreignRead.error || (Array.isArray(foreignRead.data?.items) && foreignRead.data.items.length === 0), 'wrong_actor_read_allowed');
    const request = { amount: 100, currency: 'INR', receipt: state.receipt, subject: { type: 'user', id: customer.userId }, notes: { fixture: runId, purpose: state.purpose }, customerName: 'Disposable PandaByte Test', customerEmail: customer.email };
    state.outcome = 'wrong_actor_pending'; save(state);
    const wrong = await fixture.auth.staff.database.payments.razorpay.createOrder('test', request);
    state.wrongActorError = redact(wrong.error); save(state);
    requireOk(wrong.error, 'wrong_actor_allowed');
    requireOk(!(await inspect(fixture.auth.customer.database, state, customer)), 'wrong_actor_created_managed_row');
    state.outcome = 'creation_pending_unknown'; save(state);
    const result = await fixture.auth.customer.database.payments.razorpay.createOrder('test', request);
    if (result.error) { state.error = redact(result.error); state.outcome = 'creation_failed_unknown'; save(state); }
    const row = await inspect(fixture.auth.customer.database, state, customer);
    const foreignReadAfter = await resultFor(fixture.auth.staff.database, state.receipt);
    requireOk(foreignReadAfter.error || (Array.isArray(foreignReadAfter.data?.items) && foreignReadAfter.data.items.length === 0), 'wrong_actor_read_allowed');
    state.managed = row ? { status: row.status, providerOrderKnown: Boolean(row.order_id) } : { status: 'unobserved', providerOrderKnown: false };
    const order = result.data?.order;
    const proved = !result.error && row?.status === 'created' && Boolean(row.order_id) && order?.environment === 'test' && order?.status === 'created' && order.orderId === row.order_id && order.subjectId === customer.userId && order.receipt === state.receipt && order.amount === 100 && order.currency.toLowerCase() === 'inr';
    state.outcome = proved ? 'proved' : 'creation_failed_unknown'; save(state);
    console.log(JSON.stringify({ proved: Boolean(proved), amount: 100, currency: 'INR', status: state.managed.status }));
    if (!proved) process.exitCode = 1;
  } catch (error) {
    const labels = ['fixtures_missing', 'probe_insert_failed', 'wrong_actor_read_allowed', 'wrong_actor_allowed', 'wrong_actor_created_managed_row', 'managed_inspection_failed', 'managed_row_mismatch'];
    state.failure = labels.includes(error?.message) ? error.message : 'unexpected_failure';
    save(state);
    throw error;
  } finally {
    await cleanup(context, state);
  }
}
main().catch(() => { console.error('Managed proof stopped safely; inspect the private journal.'); process.exitCode = 1; });
