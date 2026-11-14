import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolFor, isTurnModelId } from '../src/models/turn-models.ts';
import { parseCapabilities, hostedModelChoices, hostedDisabledModelReasons } from '../src/ui/capabilities.ts';
import { hostedDirectModelIds } from '../src/hosted-model.ts';

const profile = privacy => ({ tag: 'p', providerName: 'P', endpointName: 'P | x', tokenizer: 'Other', reported: ['x'], pricing: { prompt: '0', completion: '0' }, pricingKeys: ['prompt', 'completion'],
  implicitCaching: false, params: ['tool_choice'], maxPrice: { prompt: 0, completion: 0 }, nano2: { prompt: 0, cached: 0, write: 0, completion: 0 }, reasoning: {}, privacy });
const row = (id, o = {}) => ({ id, label: id, tier: 'free', enabled: true, members: true, poolOrder: null, builtin: false, profile: profile('logged'), contextWindow: 131072, note: null, version: 1, updatedAt: '', ...o });

test('pool: the free choice is every enabled free model in pool order; one added or built-in model otherwise', () => {
  const rows = [row('b/two:free', { poolOrder: 2 }), row('a/one:free', { poolOrder: 1 }), row('c/late:free'), row('d/off:free', { enabled: false, poolOrder: 3 }),
    row('e/paid', { tier: 'paid', profile: profile('zdr') }), row('anthropic/claude-haiku-5.5', { tier: 'paid', builtin: true, profile: null })];
  assert.deepEqual(poolFor('panda/free', rows).map(e => e.id), ['a/one:free', 'b/two:free', 'c/late:free']);
  assert.equal(poolFor('panda/free', rows)[0].profile.id, 'a/one:free');
  assert.deepEqual(poolFor('e/paid', rows).map(e => e.id), ['e/paid']);
  assert.deepEqual(poolFor('anthropic/claude-haiku-5.5', rows), [{ id: 'anthropic/claude-haiku-5.5', contextWindow: 131072, tier: 'paid' }]);
  assert.ok(poolFor('panda/free', rows).every(e => e.tier === 'free'));
  assert.deepEqual(poolFor('d/off:free', rows), [], 'switched off'); assert.deepEqual(poolFor('x/unknown', rows), []);
  assert.deepEqual(poolFor('panda/free', rows.filter(r => r.tier !== 'free')), [], 'no free models, no pool');
  // The paid fallback answers last, only while it is switched on, and never alone.
  const fb = row('deepseek/deepseek-v4.1-flash-1017', { tier: 'paid', profile: profile('zdr') });
  assert.deepEqual(poolFor('panda/free', [...rows, fb]).map(e => [e.id, e.tier]).slice(-2), [['c/late:free', 'free'], [fb.id, 'paid']]);
  assert.equal(poolFor('panda/free', [...rows, { ...fb, enabled: false }]).at(-1).id, 'c/late:free');
  assert.deepEqual(poolFor('panda/free', [fb]), []);
  assert.ok(isTurnModelId('panda/free') && isTurnModelId('deepseek/deepseek-v4.1-flash-1017') && !isTurnModelId('bad id') && !isTurnModelId('x'.repeat(130) + '/y'));
});

test('capabilities: registry models after the built-in list are accepted only when well formed; Admin-disabled built-ins parse', () => {
  const base = { mode: 'direct_assistant', model: 'GPT-OSS 20B', status: 'ready', reason: null, rag: false, tools: [], skills: [], budget: null };
  const fixed = hostedModelChoices.map((m, i) => ({ id: m.id, label: m.label, enabled: hostedDirectModelIds.includes(m.id), reason: hostedDirectModelIds.includes(m.id) ? null : hostedDisabledModelReasons[i] }));
  const free = { id: 'panda/free', label: 'Free models (3)', enabled: true, reason: null, tier: 'free', privacy: 'logged' };
  const paid = { id: 'deepseek/deepseek-v4.1-flash-1017', label: 'DeepSeek V4.1 Flash', enabled: true, reason: null, tier: 'paid', privacy: 'zdr' };
  assert.ok(parseCapabilities({ ...base, models: fixed }));
  assert.ok(parseCapabilities({ ...base, models: [...fixed, free, paid] }));
  // Admin switched a built-in off: it stays listed, disabled with its usual reason.
  const off = fixed.map((m, i) => m.id === 'qwen/qwen3.8-27b' ? { ...m, enabled: false, reason: hostedDisabledModelReasons[i] } : m);
  assert.ok(parseCapabilities({ ...base, models: off }));
  for (const bad of [{ ...paid, privacy: 'logged' }, { ...paid, id: 'anthropic/claude-haiku-5.5' }, { ...free, extra: 1 }, { ...paid, enabled: false }, { ...paid, label: '' }])
    assert.equal(parseCapabilities({ ...base, models: [...fixed, bad] }), null, JSON.stringify(bad).slice(0, 80));
  assert.equal(parseCapabilities({ ...base, models: [...fixed, paid, paid] }), null, 'duplicate ids');
});

test('OpenRouter credit: low under $5 or a fifth of the limit; parsed from /key without the key', async () => {
  const { lowBalance, fetchOpenRouterKey } = await import('../src/models/openrouter-key.ts');
  assert.equal(lowBalance(35, 13.75), false); assert.equal(lowBalance(35, 6.9), true); assert.equal(lowBalance(10, 4.99), true);
  assert.equal(lowBalance(null, null), false, 'no key limit, no warning');
  let seen;
  const fetcher = async (url, init) => { seen = [url, init.headers.authorization]; return new Response(JSON.stringify({ data: { usage: 31.5, limit: 35, limit_remaining: 3.5, usage_daily: 0.56, usage_weekly: 6.11 } }), { status: 200 }); };
  assert.deepEqual(await fetchOpenRouterKey('k', fetcher), { usage: 31.5, limit: 35, remaining: 3.5, daily: 0.56, weekly: 6.11, low: true });
  assert.deepEqual(seen, ['https://openrouter.ai/api/v1/key', 'Bearer k']);
  await assert.rejects(fetchOpenRouterKey('k', async () => new Response('{}', { status: 401 })));
});
