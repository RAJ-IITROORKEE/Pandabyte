import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

// Runtime session authentication is outside this policy fixture and is never contacted.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === './lightweight-connection' && context.parentURL?.endsWith('/basic-rag-runtime.ts'))
    return { url: 'data:text/javascript,export%20async%20function%20currentLightweightSession()%7Breturn%20false%7D', shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { createBasicRagPolicy, createLunaTestPolicy } = await import('../src/server/basic-rag-runtime.ts');
const { createBasicRagCompletion, basicRagModel } = await import('../src/server/basic-rag-openrouter.ts');
const hash = v => createHash('sha256').update(v).digest('hex');
function fixture(options = {}) {
  const env = { OPENROUTER_API_KEY: 'synthetic' }, calls = [];
  let lease = { binding: 'a', expiresAt: '2099-01-01T00:00:00.000Z', workspaceSha256: hash('workspace') }, current = true, remaining = 1, eligible = true, workspace = 'workspace';
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/key')) return Response.json({ data: { workspace_id: workspace, free_model_daily_requests: { remaining } } });
    if (url.endsWith('/models/user')) return Response.json({ data: eligible ? [{ id: options.model ?? basicRagModel }] : [] });
    if (url.endsWith('/endpoints/zdr')) return Response.json({ data: [{ model_id: basicRagModel, tag: 'phala', safety_retention: false }] });
    if (url.endsWith('/endpoints')) return Response.json({ data: { endpoints: [{ tag: 'phala', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens', 'temperature', 'response_format', 'reasoning'] }] } });
    throw Error('unexpected provider POST');
  };
  const policy = createBasicRagPolicy({ env, subject: 'owner', requestOrigin: 'http://localhost:3001', current: async () => current, profile: async () => {
    const captured = lease; return captured && { ...captured, dispatchCurrent: () => lease === captured };
  }, fetcher, ...options });
  return { env, calls, policy, fetcher, setLease: v => lease = v, setCurrent: v => current = v, setRemaining: v => remaining = v, setEligible: v => eligible = v, setWorkspace: v => workspace = v };
}
test('admission binds the profile and reloads authenticated workspace, quota, model and session', async () => {
  const f = fixture();
  assert.equal(await f.policy.current(), false);
  assert.equal(await f.policy.enabled(), true);
  assert.equal(await f.policy.current(), true);
  assert.ok(f.calls.every(call => call.init.method === 'GET' && call.init.redirect === 'error' && call.init.cache === 'no-store'));
  f.setRemaining(0); assert.equal(await f.policy.current(), false);
  f.setRemaining(1); f.setEligible(false); assert.equal(await f.policy.current(), false);
  f.setEligible(true); f.setWorkspace('other'); assert.equal(await f.policy.current(), false);
  f.setWorkspace('workspace'); f.setCurrent(false); assert.equal(await f.policy.current(), false);
  f.setCurrent(true); f.env.OPENROUTER_API_KEY = 'rotated'; assert.equal(await f.policy.current(), false);
});
test('no profile means no metadata request, and revocation after claim prevents the actual dispatch', async () => {
  const f = fixture(); f.setLease(null);
  assert.equal(await f.policy.enabled(), false); assert.equal(f.calls.length, 0);
  f.setLease({ binding: 'a', expiresAt: '2099-01-01T00:00:00.000Z', workspaceSha256: hash('workspace') });
  assert.equal(await f.policy.enabled(), true);
  let claims = 0;
  const complete = createBasicRagCompletion({ apiKey: f.policy.key(), fetcher: f.fetcher, policyCurrent: f.policy.current,
    dispatchCurrent: f.policy.dispatchCurrent, claim: async () => { claims++; return true; } });
  await assert.rejects(complete({ question: 'fixture?', passages: [{ rank: 1, text: 'fixture passage' }] }, async () => { f.setLease(null); return true; }, new AbortController().signal));
  assert.equal(claims, 1); assert.equal(f.calls.filter(call => call.init.method === 'POST').length, 0);
});
test('changed profile binding is rejected even when the workspace remains the same', async () => {
  const f = fixture(); assert.equal(await f.policy.enabled(), true);
  f.setLease({ binding: 'b', expiresAt: '2099-01-01T00:00:00.000Z', workspaceSha256: hash('workspace') });
  assert.equal(await f.policy.current(), false);
});
test('paid metadata mode still requires the exact selected model and bound workspace', async () => {
  const f = fixture({ model: 'openai/gpt-6-luna', requireFreeQuota: false });
  f.setRemaining(0); assert.equal(await f.policy.enabled(), true);
  f.setEligible(false); assert.equal(await f.policy.current(), false);
  f.setEligible(true); f.setWorkspace('different'); assert.equal(await f.policy.current(), false);
});
test('a paid policy cannot admit or reserve without its explicit private budget and success profile', async () => {
  const policy = createLunaTestPolicy({ env: {}, subject: 'owner', requestOrigin: 'http://localhost:3001', current: async () => true });
  assert.equal(await policy.enabled(), false);
  assert.equal(await policy.current(), false);
  assert.equal(await policy.claimBudget(), false);
});
test('dispatch guard fails synchronously on expiry, key, path and environment changes', async () => {
  const f = fixture(); assert.equal(await f.policy.enabled(), true); assert.equal(f.policy.dispatchCurrent(), true);
  f.env.PANDA_AGENT_LUNA_BUDGET_FILE = 'changed'; assert.equal(f.policy.dispatchCurrent(), false);
  delete f.env.PANDA_AGENT_LUNA_BUDGET_FILE; f.env.CLERK_SECRET_KEY = 'changed'; assert.equal(f.policy.dispatchCurrent(), false);
  delete f.env.CLERK_SECRET_KEY; f.env.VERCEL = ''; assert.equal(f.policy.dispatchCurrent(), false);
  delete f.env.VERCEL; f.setLease({ binding: 'a', expiresAt: '2000-01-01T00:00:00.000Z', workspaceSha256: hash('workspace') });
  assert.equal(await f.policy.current(), true); assert.equal(f.policy.dispatchCurrent(), false);
});
test('a profile changed while provider metadata is in flight cannot be admitted', async () => {
  const env = { OPENROUTER_API_KEY: 'synthetic' };
  let live = true, profiles = 0, checks = 0;
  const policy = createBasicRagPolicy({ env, subject: 'owner', requestOrigin: 'http://localhost:3001', current: async () => { checks++; return true; },
    profile: async () => { profiles++; return { binding: 'a', expiresAt: '2099-01-01T00:00:00.000Z', workspaceSha256: hash('workspace'), dispatchCurrent: () => live }; },
    fetcher: async url => { live = false; return url.endsWith('/key')
      ? Response.json({ data: { workspace_id: 'workspace', free_model_daily_requests: { remaining: 1 } } })
      : Response.json({ data: [{ id: basicRagModel }] }); } });
  assert.equal(await policy.enabled(), false);
  assert.equal(profiles, 1); assert.equal(checks, 1); assert.equal(policy.dispatchCurrent(), false);
});
