import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createHostedRagPolicy, readHostedRagProfile } from '../src/server/hosted-rag-policy.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const subject = 'user_fixture_owner', workspace = 'workspace_fixture', origin = 'https://pandabyte-iot.vercel.app';
const apiKey = 'sk-or-v1-' + 'b'.repeat(64), signingKey = 'a'.repeat(64);
const input = { request: '64440e96-d0d7-4857-865d-18fe0cdd942a', surface: 'playground', fingerprint: hash('fixture evidence') };

function fixture() {
  const manifest = { version: 1, origin, ownerSubjectSha256: hash(subject), keySha256: hash(apiKey), workspaceSha256: hash(workspace),
    privacy: { logging: false, traces: true, dataDiscount: false, publicPrompts: false } };
  const env = { VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production', VERCEL_URL: 'panda-build-123.vercel.app',
    PANDA_AGENT_HOSTED_GROUNDED_ENABLED: 'true', PANDA_AGENT_HOSTED_GROUNDED_PROFILE: JSON.stringify(manifest),
    PANDA_AGENT_OPENROUTER_OBSERVABILITY: 'langsmith_metadata_only', OPENROUTER_API_KEY: apiKey, PANDA_AGENT_LIGHTWEIGHT_DB_KEY: signingKey };
  const state = { active: true, receipt: { execute: true }, metadata: { data: { workspace_id: workspace } } };
  const claims = [], requests = [];
  const options = { env, subject, requestOrigin: origin, current: async () => state.active,
    actor: { subject, sessionId: 'fixture', client: { database: { rpc: async (name, params) => {
      assert.equal(name, 'panda_agent_grounded_request_claim'); claims.push(params);
      return { data: state.receipt, error: null };
    } } } },
    fetcher: async (url, init) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/key'); assert.equal(init.method, 'GET');
      assert.equal(init.headers.Authorization, 'Bearer ' + apiKey); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
      requests.push(url); return Response.json(state.metadata);
    },
  };
  return { manifest, env, options, state, claims, requests };
}

test('profile binds production, exact Vercel origins, owner, both keys and metadata-only privacy', () => {
  const {options, env} = fixture();
  const profile = readHostedRagProfile(options);
  assert.match(profile.binding, /^[a-f0-9]{64}$/); assert.equal(profile.workspaceSha256, hash(workspace)); assert.ok(profile.dispatchCurrent());
  assert.ok(readHostedRagProfile({...options, requestOrigin: 'https://' + env.VERCEL_URL}));
  for (const requestOrigin of ['https://elsewhere.vercel.app', origin + '/', origin + '?q', 'http://pandabyte-iot.vercel.app',
    'https://name@pandabyte-iot.vercel.app', null]) assert.equal(readHostedRagProfile({...options, requestOrigin}), null);
  for (const deployment of ['host.vercel.app:443', 'host.vercel.app/other', 'a.b.vercel.app', 'name@host.vercel.app', 'host.vercel.app?']) {
    assert.equal(readHostedRagProfile({...options, env: {...env, VERCEL_URL: deployment}, requestOrigin: 'https://' + deployment}), null);
  }
  assert.equal(readHostedRagProfile({...options, subject: 'user_other'}), null);
  for (const change of [{VERCEL: '0'}, {VERCEL_ENV: 'preview'}, {NODE_ENV: 'test'}, {PANDA_AGENT_HOSTED_GROUNDED_ENABLED: 'false'},
    {PANDA_AGENT_OPENROUTER_OBSERVABILITY: 'off'}, {OPENROUTER_API_KEY: 'sk-or-v1-' + 'c'.repeat(64)}, {PANDA_AGENT_LIGHTWEIGHT_DB_KEY: 'bad'}]) {
    assert.equal(readHostedRagProfile({...options, env: {...env,...change}}), null);
  }
  env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY = 'c'.repeat(64); assert.equal(profile.dispatchCurrent(), false);
});

test('profile rejects malformed, extra or duplicate fields and privacy mismatches', () => {
  const {manifest,env,options} = fixture(); const checked = raw => readHostedRagProfile({...options, env: {...env, PANDA_AGENT_HOSTED_GROUNDED_PROFILE: raw}});
  for (const change of [{expiresAt:'later'}, {budget:1}, {model:'other'}, {origin:'https://other.vercel.app'}, {version:'1'}, {workspaceSha256:'bad'},
    ...Object.keys(manifest.privacy).map(k => ({privacy: {...manifest.privacy,[k]:!manifest.privacy[k]}})), {privacy:{...manifest.privacy,tools:true}}]) {
    assert.equal(checked(JSON.stringify({...manifest,...change})), null);
  }
  for (const raw of ['{','{}',' '.repeat(4097),JSON.stringify(manifest).replace('"version":1','"version":2,"version":1')]) assert.equal(checked(raw),null);
});

test('workspace admission, live actor checks and signed claim use only one metadata GET and one claim RPC', async () => {
  const {options,claims,requests,state} = fixture(); const policy = createHostedRagPolicy(options);
  assert.equal(policy.dispatchCurrent(), false); assert.equal(policy.key(), '');
  assert.equal(await policy.enabled(), true); assert.equal(policy.key(), apiKey);
  assert.equal(policy.binding(), readHostedRagProfile(options).binding); assert.equal(await policy.current(),true);
  const settled = await Promise.allSettled([policy.claimRequest(input),policy.claimRequest(input)]);
  assert.deepEqual(settled.map(r => r.status === 'fulfilled' ? r.value : r.reason.code).sort(),[true,'outcome_unknown'].sort());
  assert.equal(requests.length,1); assert.equal(claims.length,1);
  const {p_payload,p_mac} = claims[0]; const value=JSON.parse(p_payload);
  assert.deepEqual(value,{v:1,subject,exp:value.exp,...input});
  assert.ok(value.exp > Date.now()/1000+55 && value.exp <= Date.now()/1000+60);
  assert.equal(p_mac,createHmac('sha256',Buffer.from(signingKey,'hex')).update('panda-grounded-request-db-v1\n'+p_payload).digest('hex'));
  state.active=false; assert.equal(await policy.current(),false); assert.equal(policy.dispatchCurrent(),false); assert.equal(policy.key(),'');
});

test('wrong workspace, revoked actor, changed flags and malformed metadata cannot admit a dispatch',async()=>{
  for (const scenario of ['workspace','actor','owner','account-change','malformed','oversize']) {
    const {options,state,claims}=fixture();
    if(scenario==='workspace') state.metadata.data.workspace_id='other';
    if(scenario==='actor') state.active=false;
    if(scenario==='owner') options.actor.subject='other';
    if(scenario==='account-change') options.fetcher=async()=>{options.env.OPENROUTER_API_KEY='changed'; return Response.json(state.metadata);};
    if(scenario==='malformed') options.fetcher=async()=>new Response('<html>');
    if(scenario==='oversize') state.metadata.padding='a'.repeat(65536);
    const policy=createHostedRagPolicy(options);
    assert.equal(await policy.enabled(),false,scenario); assert.equal(policy.dispatchCurrent(),false);
    await assert.rejects(policy.claimRequest(input),{code:'not_admitted'}); assert.equal(claims.length,0);
  }
});

test('denied, ambiguous, or replayed durable claims are never retried',async()=>{
  for (const receipt of [{execute:false},{execute:'true'},{execute:true,extra:1},null]) {
    const {options,state,claims}=fixture();state.receipt=receipt;
    const policy=createHostedRagPolicy(options);assert.ok(await policy.enabled());
    await assert.rejects(policy.claimRequest(input),{code:'outcome_unknown'});
    await assert.rejects(policy.claimRequest(input),{code:'outcome_unknown'});assert.equal(claims.length,1);
  }
  const {options,claims}=fixture();const policy=createHostedRagPolicy(options);assert.ok(await policy.enabled());
  await assert.rejects(policy.claimRequest({...input,surface:'diagnostic'}),{code:'not_admitted'});assert.equal(claims.length,0);
  options.env.VERCEL_ENV='preview';assert.equal(await policy.current(),false);
  await assert.rejects(policy.claimRequest(input),{code:'not_admitted'});assert.equal(claims.length,0);
});
