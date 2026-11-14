import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDynamicProfile, profileFromEndpoint, parseModelRows, parseModelPatch, parseModelAdd, parseModelTest } from '../src/models/registry.ts';

const model = { id: 'acme/model-x', canonical_slug: 'acme/model-x-20261101', context_length: 200000, architecture: { tokenizer: 'GPT' } };
const endpoint = (over = {}) => ({ tag: 'azure/us', name: 'Azure | acme/model-x', provider_name: 'Azure', status: 0, context_length: 128000, max_completion_tokens: 16000,
 supports_implicit_caching: false, supports_tool_choice: { none: true, auto: true, required: true },
 supported_parameters: ['tools', 'tool_choice', 'max_tokens', 'reasoning', 'include_reasoning', 'response_format', 'temperature'],
 pricing: { prompt: '0.000000075', completion: '0.0000003', input_cache_read: '0.0000000375', discount: '0' }, ...over });
const built = (e, zdr = ['azure/us']) => profileFromEndpoint(model, e, zdr);

test('profileFromEndpoint: paid zero-retention endpoint derives the profile facts', () => {
 const r = built(endpoint());
 assert.equal(r.error, undefined);
 assert.equal(r.tier, 'paid');
 assert.equal(r.contextWindow, 128000);
 assert.deepEqual(r.profile.nano2, { prompt: 150, cached: 75, write: 150, completion: 600 });
 assert.deepEqual(r.profile.maxPrice, { prompt: 0.075, completion: 0.3 });
 assert.equal(r.profile.privacy, 'zdr');
 assert.deepEqual(r.profile.reported, ['acme/model-x', 'acme/model-x-20261101']);
 assert.deepEqual(r.profile.pricingKeys, ['prompt', 'completion', 'input_cache_read', 'discount']);
 assert.deepEqual(r.profile.params, ['response_format', 'reasoning', 'include_reasoning', 'tool_choice']);
 assert.deepEqual(r.profile.reasoning, { enabled: false });
 assert.equal(r.profile.tokenParam, 'max_tokens');
 assert.deepEqual(parseDynamicProfile(r.profile), r.profile);
});

test('profileFromEndpoint: free endpoint is logged unless zero retention, paid needs zero retention', () => {
 const free = endpoint({ tag: 'free-host', pricing: { prompt: '0', completion: '0', discount: '0' }, supported_parameters: ['tools', 'tool_choice', 'max_completion_tokens'] });
 const logged = built(free, []);
 assert.equal(logged.tier, 'free'); assert.equal(logged.profile.privacy, 'logged'); assert.equal(logged.profile.tokenParam, 'max_completion_tokens');
 assert.deepEqual(logged.profile.reasoning, {}); assert.deepEqual(logged.profile.nano2, { prompt: 0, cached: 0, write: 0, completion: 0 });
 assert.equal(built(free, ['free-host']).profile.privacy, 'zdr');
 assert.match(built(endpoint(), []).error, /zero-data-retention/);
});

test('profileFromEndpoint: needs tool calling and a healthy endpoint', () => {
 assert.match(built(endpoint({ supported_parameters: ['max_tokens'] })).error, /tool/);
 assert.match(built(endpoint({ supports_tool_choice: { none: true } })).error, /tool/);
 assert.match(built(endpoint({ status: -1 })).error, /healthy/);
 assert.match(built(endpoint({ tag: 'Azure US' })).error, /tag/);
});

test('profileFromEndpoint: cache prices and discount are carried', () => {
 const r = built(endpoint({ pricing: { prompt: '0.0000001', completion: '0.0000005', input_cache_write: '0.000000125', discount: '0.25' } }));
 assert.deepEqual(r.profile.nano2, { prompt: 200, cached: 200, write: 250, completion: 1000 });
 assert.equal(r.profile.discount, 0.25);
 assert.equal(r.profile.pricing.input_cache_read, undefined);
});

test('parseDynamicProfile is strict', () => {
 const good = built(endpoint()).profile;
 assert.ok(parseDynamicProfile(good));
 assert.equal(parseDynamicProfile({ ...good, extra: 1 }), null);
 assert.equal(parseDynamicProfile({ ...good, tag: 'Bad Tag' }), null);
 assert.equal(parseDynamicProfile({ ...good, tag: 'a/b/c' }), null);
 assert.equal(parseDynamicProfile({ ...good, privacy: 'logged' }), null, 'logged with non-zero price');
 assert.equal(parseDynamicProfile({ ...good, params: ['tools'] }), null);
 assert.equal(parseDynamicProfile({ ...good, nano2: { ...good.nano2, prompt: 1.5 } }), null);
 assert.equal(parseDynamicProfile({ ...good, pricing: { ...good.pricing, prompt: 'abc' } }), null);
 assert.equal(parseDynamicProfile({ ...good, reasoning: { nested: {} } }), null);
 assert.equal(parseDynamicProfile(null), null);
 const { tag, ...missing } = good; void tag;
 assert.equal(parseDynamicProfile(missing), null);
});

test('parseModelRows drops malformed rows and keeps built-ins profile-less', () => {
 const base = { label: 'Model', tier: 'paid', enabled: true, members: true, poolOrder: null, contextWindow: 1000000, note: null, version: 1, updatedAt: '2026-11-14T00:00:00Z' };
 const added = { ...base, id: 'acme/model-x', builtin: false, profile: built(endpoint()).profile, usage30d: { turns: 3, costNano: '120', inputTokens: 5, outputTokens: 6, failovers: 0, failures: 1 } };
 const rows = parseModelRows([
  { ...base, id: 'anthropic/claude-haiku-5.5', builtin: true, profile: {} }, added,
  { ...base, id: 'anthropic/claude-haiku-5.5', builtin: true, profile: { tag: 'x' } },
  { ...added, id: 'acme/bad', profile: { tag: 'x' } }, { ...base, id: 'Not Valid', builtin: true, profile: {} }, { ...base, id: 'a/b', builtin: true, profile: {}, tier: 'cheap' }, 'x']);
 assert.deepEqual(rows.map(r => r.id), ['anthropic/claude-haiku-5.5', 'acme/model-x']);
 assert.equal(rows[0].profile, null);
 assert.equal(rows[1].usage30d.costNano, 120);
 assert.deepEqual(parseModelRows('nope'), []);
});

test('PATCH, add and test bodies are exact', () => {
 const id = 'acme/model-x';
 assert.deepEqual(parseModelPatch({ action: 'set', id, enabled: true, members: false, poolOrder: 2, expectedVersion: 3 }), { action: 'set', id, enabled: true, members: false, poolOrder: 2, expectedVersion: 3 });
 assert.ok(parseModelPatch({ action: 'set', id, enabled: true, members: true, poolOrder: null, expectedVersion: 1 }));
 assert.equal(parseModelPatch({ action: 'set', id, enabled: true, members: true, poolOrder: 51, expectedVersion: 1 }), null);
 assert.equal(parseModelPatch({ action: 'set', id, enabled: 'yes', members: true, poolOrder: null, expectedVersion: 1 }), null);
 assert.equal(parseModelPatch({ action: 'set', id, enabled: true, members: true, poolOrder: null, expectedVersion: 0 }), null);
 assert.equal(parseModelPatch({ action: 'set', id, enabled: true, members: true, poolOrder: null, expectedVersion: 1, profile: {} }), null);
 assert.deepEqual(parseModelPatch({ action: 'rename', id, label: ' New ', note: null, expectedVersion: 2 }), { action: 'rename', id, label: 'New', note: null, expectedVersion: 2 });
 assert.equal(parseModelPatch({ action: 'rename', id, label: 'x', note: null, expectedVersion: 2 }), null);
 assert.equal(parseModelPatch({ action: 'rename', id, label: 'Fine', note: 'n'.repeat(301), expectedVersion: 2 }), null);
 assert.deepEqual(parseModelPatch({ action: 'remove', id, expectedVersion: 4 }), { action: 'remove', id, expectedVersion: 4 });
 assert.equal(parseModelPatch({ action: 'remove', id: 'NoSlash', expectedVersion: 4 }), null);
 assert.equal(parseModelPatch({ action: 'drop', id, expectedVersion: 4 }), null);
 assert.deepEqual(parseModelAdd({ id, tag: 'azure/us', label: 'Model X' }), { id, tag: 'azure/us', label: 'Model X' });
 assert.equal(parseModelAdd({ id, tag: 'azure/us', label: 'Model X', profile: {} }), null);
 assert.deepEqual(parseModelTest({ id }), { id });
 assert.equal(parseModelTest({ id, x: 1 }), null);
});
