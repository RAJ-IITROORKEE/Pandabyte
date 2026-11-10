import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostedDirectPolicy } from '../src/server/hosted-direct-policy.ts';
const hash=v=>createHash('sha256').update(v).digest('hex');
const owner='fixture-owner',key='sk-or-v1-'+'a'.repeat(64),workspace='fixture-workspace',budgetId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(){
 const profile={version:1,origin:'https://pandabyte-iot.vercel.app',ownerSubjectSha256:hash(owner),keySha256:hash(key),workspaceSha256:hash(workspace),budgetId,privacy:{logging:false,traces:'langsmith_metadata_only',dataDiscount:false,publicPrompts:false},reviewedAt:'2026-01-01T00:00:00.000Z'};
 const env={VERCEL:'1',VERCEL_ENV:'production',PANDA_AGENT_DIRECT_ASSISTANT_ENABLED:'true',PANDA_AGENT_HOSTED_DIRECT_PROFILE:JSON.stringify(profile),OPENROUTER_API_KEY:key,PANDA_AGENT_LIGHTWEIGHT_DB_KEY:'b'.repeat(64),CLERK_SECRET_KEY:'fixture'};
 let session=true,remaining=1000000000,enabled=true,model=true,accountWorkspace=workspace,reserveCalls=0;
 const actor={subject:owner,client:{database:{}}};
 const fetcher=async url=>Response.json(url.endsWith('/key')?{data:{workspace_id:accountWorkspace}}:{data:model?[{id:'openai/gpt-6-luna'}]:[]});
 const budget=()=>({status:async()=>({enabled,limitNanoUsd:1000000000,reservedNanoUsd:1000000000-remaining,remainingNanoUsd:remaining,reservationNanoUsd:1597640,model:'openai/gpt-6-luna',provider:'azure/us'}),reserve:async()=>{reserveCalls++;return true;}});
 const make=(overrides={})=>createHostedDirectPolicy({env,actor,requestOrigin:'https://pandabyte-iot.vercel.app',current:async()=>session,fetcher,budget,...overrides});
 return {env,profile,make,setSession:v=>session=v,setRemaining:v=>remaining=v,setEnabled:v=>enabled=v,setModel:v=>model=v,setWorkspace:v=>accountWorkspace=v,reserves:()=>reserveCalls};
}

function unmeteredFixture(){
 const f=fixture();let budgetReads=0,admin=true;
 Object.assign(f.env,{NODE_ENV:'production',PANDA_AGENT_MAIN_CHAT_UNCAPPED:'true',PANDA_AGENT_HOSTED_GROUNDED_ENABLED:'true',PANDA_AGENT_OPENROUTER_OBSERVABILITY:'langsmith_metadata_only'});
 const p={version:1,origin:f.profile.origin,ownerSubjectSha256:f.profile.ownerSubjectSha256,keySha256:f.profile.keySha256,workspaceSha256:f.profile.workspaceSha256,
  privacy:{logging:false,traces:true,dataDiscount:false,publicPrompts:false}};
 f.env.PANDA_AGENT_HOSTED_GROUNDED_PROFILE=JSON.stringify(p);
 const actor={subject:owner,client:{database:{rpc:async name=>{assert.equal(name,'panda_agent_control_room_admission');return {data:{subject:owner,admin},error:null};}}}};
 const policy=f.make({actor,budget:()=>{budgetReads++;throw Error('Uncapped mode must not consult the ledger');}});
 return {...f,policy,budgetReads:()=>budgetReads,setAdmin:value=>admin=value};
}

test('explicit Production owner Admin mode works after the local ledger is exhausted without budget access',async()=>{
 const f=unmeteredFixture();f.setRemaining(0);f.setEnabled(false);
 assert.equal(await f.policy.enabled(),true);assert.equal(f.policy.isUnmetered(),true);
 assert.equal(f.policy.budgetRefs(),null);assert.equal(f.policy.allowance(),null);assert.equal(f.budgetReads(),0);
 assert.equal(await f.policy.current(),true);assert.equal(f.budgetReads(),0);
});

test('uncapped mode requires its own profile, fresh Admin and an unchanged explicit flag',async()=>{
 for(const change of [f=>f.setAdmin(false),f=>delete f.env.PANDA_AGENT_HOSTED_GROUNDED_PROFILE,f=>f.env.VERCEL_ENV='preview']){
  const f=unmeteredFixture();change(f);assert.equal(await f.policy.enabled(),false);assert.equal(f.budgetReads(),0);
 }
 const f=unmeteredFixture();assert.equal(await f.policy.enabled(),true);f.setAdmin(false);assert.equal(await f.policy.current(),false);
 const g=unmeteredFixture();assert.equal(await g.policy.enabled(),true);g.env.PANDA_AGENT_MAIN_CHAT_UNCAPPED='false';
 assert.equal(g.policy.dispatchCurrent(),false);assert.equal(g.policy.isUnmetered(),false);assert.equal(await g.policy.current(),false);
});
test('reviewed profile, owner session, account model and shared budget are required without policy reservation',async()=>{
 const f=fixture(),p=f.make();assert.equal(await p.enabled(),true);assert.equal(p.dispatchCurrent(),true);assert.equal(p.budgetRefs().budgetId,budgetId);assert.equal(f.reserves(),0);
 f.setRemaining(0);assert.equal(await p.current(),true);assert.equal(f.reserves(),0);f.setEnabled(false);assert.equal(await p.current(),false);assert.equal(p.dispatchCurrent(),false);
});
test('wrong origin, unreviewed privacy, workspace, model, session, or initial budget fail closed',async()=>{
 for(const change of [f=>f.env.VERCEL_ENV='preview',f=>f.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED='false',f=>{f.profile.privacy.logging=true;f.env.PANDA_AGENT_HOSTED_DIRECT_PROFILE=JSON.stringify(f.profile);},f=>f.setWorkspace('foreign'),f=>f.setModel(false),f=>f.setSession(false),f=>f.setRemaining(1597639)]) {const f=fixture();change(f);const p=f.make();assert.equal(await p.enabled(),false);assert.equal(p.dispatchCurrent(),false);}
 const f=fixture();assert.equal(await f.make({requestOrigin:'https://other.example'}).enabled(),false);
});
test('revocation, profile or credential changes invalidate admitted policy',async()=>{
 for(const change of [f=>f.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED='false',f=>f.env.OPENROUTER_API_KEY='sk-or-v1-'+'c'.repeat(64),f=>f.env.PANDA_AGENT_HOSTED_DIRECT_PROFILE+=' ',f=>f.setSession(false)]){
  const f=fixture(),p=f.make();assert.equal(await p.enabled(),true);change(f);assert.equal(await p.current(),false);assert.equal(p.dispatchCurrent(),false);assert.equal(p.budgetRefs(),null);
 }
});
