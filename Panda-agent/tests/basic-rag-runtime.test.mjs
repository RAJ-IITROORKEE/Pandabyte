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
const { createBasicRagPolicy, createLunaTestPolicy, createLunaPrototypePolicy } = await import('../src/server/basic-rag-runtime.ts');
const { createBasicRagCompletion, basicRagModel } = await import('../src/server/basic-rag-openrouter.ts');
const { createLunaRagCompletion, lunaRagModel, lunaRagReportedModel } = await import('../src/server/luna-rag-openrouter.ts');
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

function prototypeFixture(){
 const env={OPENROUTER_API_KEY:'synthetic',PANDA_AGENT_LIGHTWEIGHT_DB_KEY:'a'.repeat(64)},requests=[],grants=[];
 let active=true,present=true,enabled=true,remaining=990000000,reserve=true;
 const profile=async()=>present?{binding:'prototype-binding',budgetId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspaceSha256:hash('workspace'),expiresAt:'2099-01-01T00:00:00.000Z',dispatchCurrent:()=>active}:null;
 const budget=()=>({status:async()=>({enabled,limitNanoUsd:1000000000,reservedNanoUsd:1000000000-remaining,remainingNanoUsd:remaining,reservationNanoUsd:1597640,model:'openai/gpt-6-luna',provider:'azure/us'}),reserve:async input=>{grants.push(input);if(reserve)remaining-=1597640;return reserve;}});
 const policy=createLunaPrototypePolicy({env,subject:'owner',actor:{subject:'owner',client:{}},requestOrigin:'http://localhost:3001',current:async()=>true,profile,budget,fetcher:async url=>{requests.push(url);return Response.json(url.endsWith('/key')?{data:{workspace_id:'workspace'}}:{data:[{id:'openai/gpt-6-luna'}]});}});
 return {policy,requests,grants,setPresent:v=>present=v,setActive:v=>active=v,setEnabled:v=>enabled=v,setRemaining:v=>remaining=v,setReserve:v=>reserve=v};
}
test('prototype admission needs a present privacy lease and an enabled sufficient persistent allowance',async()=>{
 for(const kind of ['missing','disabled','exhausted']){const f=prototypeFixture();if(kind==='missing')f.setPresent(false);if(kind==='disabled')f.setEnabled(false);if(kind==='exhausted')f.setRemaining(1597639);assert.equal(await f.policy.enabled(),false);assert.equal(await f.policy.current(),false);assert.equal(f.requests.length,0);assert.equal(f.grants.length,0);}
});

test('prototype admission checks the local lease and allowance before any provider metadata request',async()=>{
 const f=prototypeFixture();assert.equal(await f.policy.enabled(),true);assert.equal(f.requests.length,0);assert.equal(f.policy.dispatchCurrent(),true);
 assert.equal(await f.policy.current(),true);assert.deepEqual(f.requests.map(url=>url.endsWith('/key')?'key':'models').sort(),['key','models']);
});

test('prototype metadata and actor checks overlap, and stale actor or profile blocks current policy',async()=>{
 let actorStarted=false,release,started;const gate=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
 const env={OPENROUTER_API_KEY:'synthetic'}, profile=async()=>({binding:'a',expiresAt:'2099-01-01T00:00:00.000Z',workspaceSha256:hash('workspace'),dispatchCurrent:()=>true});
 let local=true;const policy=createBasicRagPolicy({env,subject:'owner',requestOrigin:'http://localhost:3001',profile,localAdmissionOnly:true,
  current:async()=>{if(local)return true;actorStarted=true;started();await gate;return false;},
  fetcher:async url=>{await begun;assert.equal(actorStarted,true);release();return url.endsWith('/key')?Response.json({data:{workspace_id:'workspace',free_model_daily_requests:{remaining:1}}}):Response.json({data:[{id:basicRagModel}]});}});
 const pending=policy.enabled(),early=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('timeout'),500))]);
 if(early==='timeout'){started();release();await pending;assert.fail('local admission waited on provider metadata');}
 assert.equal(early,true);local=false;assert.equal(await policy.current(),false);assert.equal(policy.dispatchCurrent(),false);
});
test('the last available prototype reservation remains authorized after its allowance is reserved',async()=>{
 const f=prototypeFixture();f.setRemaining(1597640);assert.equal(await f.policy.enabled(),true);assert.equal(f.policy.allowance().remainingNanoUsd,1597640);
 const input={request:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',surface:'chat',fingerprint:'f'.repeat(64)};
 assert.equal(await f.policy.claimBudget(input),true);assert.deepEqual(f.grants,[input]);assert.equal(await f.policy.current(),true);assert.equal(f.policy.dispatchCurrent(),true);assert.equal(f.policy.allowance().remainingNanoUsd,0);
 await assert.rejects(f.policy.claimBudget(input),e=>e.code==='outcome_unknown');assert.equal(f.grants.length,1);
});
test('ambiguous or replayed prototype reservations never grant another POST and revocation fails closed',async()=>{
 const f=prototypeFixture();assert.equal(await f.policy.enabled(),true);f.setReserve(false);await assert.rejects(f.policy.claimBudget({request:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',surface:'playground',fingerprint:'f'.repeat(64)}),e=>e.code==='outcome_unknown');
 const g=prototypeFixture();assert.equal(await g.policy.enabled(),true);g.setActive(false);assert.equal(g.policy.dispatchCurrent(),false);assert.equal(await g.policy.claimBudget({request:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',surface:'chat',fingerprint:'f'.repeat(64)}),false);assert.equal(g.grants.length,0);
});

test('prototype dispatch reads fresh provider metadata once after claim and fences revocation',async()=>{
 for(const scenario of ['valid','before_claim_profile','after_claim_actor','after_claim_budget']){
  const env={OPENROUTER_API_KEY:'synthetic',PANDA_AGENT_LIGHTWEIGHT_DB_KEY:'a'.repeat(64)}, requests=[];
  let profileCurrent=true,actorCurrent=true,budgetEnabled=true,claims=0,statusReads=0,actorReads=0;
  const profile=async()=>({binding:'bound',budgetId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspaceSha256:hash('workspace'),expiresAt:'2099-01-01T00:00:00.000Z',dispatchCurrent:()=>profileCurrent});
  const budget=()=>({status:async()=>{statusReads++;return {enabled:budgetEnabled,limitNanoUsd:1000000000,reservedNanoUsd:10000000,remainingNanoUsd:990000000,reservationNanoUsd:1597640,model:lunaRagModel,provider:'azure/us'};},
   reserve:async()=>{claims++;if(scenario==='after_claim_actor')actorCurrent=false;if(scenario==='after_claim_budget')budgetEnabled=false;return true;}});
  const endpoint={tag:'azure/us',model_id:lunaRagModel,name:'Azure | '+lunaRagReportedModel,provider_name:'Azure',status:0,supports_implicit_caching:false,
   pricing:{prompt:'0.00000011',completion:'0.00000055',discount:0},context_length:12000,max_completion_tokens:700,max_prompt_tokens:null,
   supports_tool_choice:{none:true},supported_parameters:['max_completion_tokens','response_format','reasoning','include_reasoning','tool_choice']};
  const fetcher=async(url,init)=>{requests.push({url,method:init.method});
   if(url.endsWith('/key'))return Response.json({data:{workspace_id:'workspace'}});
   if(url.endsWith('/models/user'))return Response.json({data:[{id:lunaRagModel}]});
   if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:false}]});
   if(url.endsWith('/endpoints')){if(scenario==='before_claim_profile')profileCurrent=false;return Response.json({data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[endpoint]}});}
   return Response.json({model:lunaRagModel,provider:'Azure',choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'TEST8266',evidence:[{rank:1,quote:'TEST8266',reason:'Names it.'}]})}}],usage:{prompt_tokens:20,completion_tokens:8,cost:0.0000066}});
  };
  const policy=createLunaPrototypePolicy({env,subject:'owner',actor:{subject:'owner',client:{}},requestOrigin:'http://localhost:3001',current:async()=>{actorReads++;return actorCurrent;},profile,budget,fetcher});
  assert.equal(await policy.enabled(),true);assert.equal(requests.length,0,scenario);
  const complete=createLunaRagCompletion({apiKey:policy.key(),policyCurrent:policy.current,dispatchCurrent:policy.dispatchCurrent,preClaimCurrent:policy.dispatchCurrent,
   claim:()=>policy.claimBudget({request:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',surface:'chat',fingerprint:'f'.repeat(64)}),fetcher});
  const pending=complete({question:'Which MCU?',passages:[{rank:1,text:'The MCU is TEST8266.'}]},async()=>actorCurrent,new AbortController().signal);
  if(scenario==='valid'){
   const result=await pending;assert.equal(result.usage.inputTokens,20);assert.equal(claims,1);assert.equal(statusReads,2);assert.equal(actorReads,2);
   assert.equal(requests.filter(r=>r.url.endsWith('/key')).length,1);assert.equal(requests.filter(r=>r.url.endsWith('/models/user')).length,1);assert.equal(requests.filter(r=>r.method==='POST').length,1);
  } else {
   await assert.rejects(pending);assert.equal(requests.filter(r=>r.method==='POST').length,0,scenario);
   assert.equal(claims,scenario==='before_claim_profile'?0:1,scenario);
  }
 }
});
