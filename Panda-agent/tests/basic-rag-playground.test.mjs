import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, chmod, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { claimBasicRagPlayground, createBasicRagPlayground } from '../src/server/basic-rag-playground.ts';
import { createBasicRagCompletion } from '../src/server/basic-rag-openrouter.ts';

const requestId = '12345678-1234-4234-8234-123456789abc';
const profile = { binding:'a'.repeat(64), expiresAt:'2099-01-01T00:00:00.000Z', workspaceSha256:'b'.repeat(64) };
const claim = { subject:'user_disposable', requestId, binding:profile.binding, question:'Which MCU?', sourceDigest:'c'.repeat(64) };
const input = { requestId, question:claim.question, context:{digest:claim.sourceDigest, passages:[{rank:1,text:'The board uses TEST8266.'}]}, documents:[] };
const model = 'xingchen-agi/xing4.0-29b-a4b:free';
function adapter(overrides={}) {
 const calls=[]; let count=0;
 const fetcher=async(url,init)=>{calls.push({url,init});if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:model,tag:'phala',safety_retention:false}]});if(url.endsWith('/endpoints'))return Response.json({data:{endpoints:[{tag:'phala',pricing:{prompt:'0',completion:'0'},supported_parameters:['max_tokens','temperature','response_format','reasoning']}]}});return overrides.response?.() ?? Response.json({model,provider:'Phala',choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'TEST8266.',evidence:[{rank:1,quote:'TEST8266',reason:'The named MCU.'}]})}}],usage:{prompt_tokens:2,completion_tokens:3,cost:0}});};
 const generate=createBasicRagPlayground({subject:claim.subject,requestOrigin:'http://localhost:3001',env:{OPENROUTER_API_KEY:'synthetic'},profile,availability:overrides.availability??{enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=>profile.binding},claim:overrides.claim??(async()=>{count++;return true;}),completion:opts=>createBasicRagCompletion({...opts,fetcher})});
 return {generate,calls,get claims(){return count;}};
}
const signal=()=>new AbortController().signal;
test('adapter returns grounded evaluation and verified zero usage',async()=>{const f=adapter();const r=await f.generate(input,async()=>true,signal());assert.equal(r.evaluation.answer,'TEST8266.');assert.deepEqual(r.usage,{inputTokens:2,outputTokens:3,costNanoUsd:0});assert.equal(f.claims,1);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);});
test('changed profile, revoked session or source blocks POST',async()=>{
 for(const setup of [()=>({availability:{enabled:async()=>false,current:async()=>false,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=>profile.binding}}),()=>({availability:{enabled:async()=>true,current:async()=>false,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=>profile.binding}}),()=>({availability:{enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=> 'd'.repeat(64)}})]){const f=adapter(setup());await assert.rejects(f.generate(input,async()=>true,signal()),e=>e.code==='not_admitted');assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);}
 const f=adapter();await assert.rejects(f.generate(input,async()=>false,signal()),e=>e.code==='not_admitted');assert.equal(f.claims,1);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
 let n=0;const g=adapter({availability:{enabled:async()=>true,current:async()=>++n<3,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=>profile.binding}});await assert.rejects(g.generate(input,async()=>true,signal()),e=>e.code==='not_admitted');assert.equal(g.claims,1);assert.equal(g.calls.filter(c=>c.init.method==='POST').length,0);
});
test('definite 429 is quota and ambiguous provider result is unknown',async()=>{for(const [response,code] of [[()=>Response.json({error:{code:429}},{status:429}),'quota'],[()=>{throw Error('private');},'outcome_unknown']]){const f=adapter({response});await assert.rejects(f.generate(input,async()=>true,signal()),e=>e.code===code&&!e.message.includes('private'));assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);}});
test('persistent claim binds owner, question, source and profile and refuses reuse', {timeout:60000},async()=>{
 const original=process.cwd();await mkdir(path.join(original,'tmp'),{recursive:true});const parent=await realpath(path.join(original,'tmp'));const root=await mkdtemp(path.join(parent,'playground-claim-test-'));const dir=path.join(root,'private','basic-rag-activation');
 try{await mkdir(dir,{recursive:true});if(process.platform==='win32'){const script="$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$r=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);[System.IO.Directory]::SetAccessControl($p,$a)";execFileSync(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{input:dir,windowsHide:true});}else await chmod(dir,0o700);process.chdir(root);
 assert.equal(await claimBasicRagPlayground(claim),true);const files=await readdir(dir);assert.equal(files.length,1);const receipt=JSON.parse(await readFile(path.join(dir,files[0]),'utf8'));assert.equal(receipt.binding,claim.binding);assert.equal(receipt.sourceDigest,claim.sourceDigest);assert.ok(!JSON.stringify(receipt).includes(claim.question));assert.ok(!JSON.stringify(receipt).includes(claim.subject));
 for(const changed of [claim,{...claim,question:'Different'}, {...claim,binding:'d'.repeat(64)}])await assert.rejects(claimBasicRagPlayground(changed),e=>e.code==='outcome_unknown');
 }finally{process.chdir(original);const actual=await realpath(root);assert.equal(path.dirname(actual).toLowerCase(),parent.toLowerCase());assert.match(path.basename(actual),/^playground-claim-test-/);await rm(actual,{recursive:true,force:true});}
});

test('paid Playground requires a durable UUID and shared budget claim before dispatch',async()=>{
 for(const [uuidClaim,budgetClaim,expected] of [[false,true,false],[true,false,false],[true,true,true]]){
  const events=[];const availability={enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=>profile.binding,claimBudget:async()=>{events.push('budget');return budgetClaim;}};
  const generate=createBasicRagPlayground({subject:claim.subject,requestOrigin:'http://localhost:3001',env:{OPENROUTER_API_KEY:'synthetic'},profile,mode:'luna',availability,claim:async()=>{events.push('uuid');return uuidClaim;},completion:options=>async(_input,beforeSend)=>{if(!await options.policyCurrent()||!await options.claim()||!await beforeSend()||!await options.policyCurrent()||!options.dispatchCurrent())throw new (await import('../src/server/basic-rag-openrouter.ts')).BasicRagProviderError('not_admitted');events.push('post');return {evaluation:{answer:'',evidence:[]},usage:{inputTokens:2,outputTokens:2,costNanoUsd:42}};}});
  if(expected){const r=await generate(input,async()=>true,signal());assert.equal(r.usage.costNanoUsd,42);}else await assert.rejects(generate(input,async()=>true,signal()),e=>e.code==='not_admitted');
  assert.equal(events.includes('post'),expected);assert.deepEqual(events,uuidClaim?(budgetClaim?['uuid','budget','post']:['uuid','budget']):['uuid']);
 }
});

test('last synchronous availability check denies dispatch after source validation',async()=>{
 let valid=true,posts=0;const generate=createBasicRagPlayground({subject:claim.subject,requestOrigin:'http://localhost:3001',env:{OPENROUTER_API_KEY:'synthetic'},profile,availability:{enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>valid,key:()=> 'synthetic',binding:()=>profile.binding},claim:async()=>true,completion:options=>async(_input,beforeSend)=>{if(!await options.policyCurrent()||!await options.claim()||!await beforeSend()||!options.dispatchCurrent())throw new (await import('../src/server/basic-rag-openrouter.ts')).BasicRagProviderError('not_admitted');posts++;return {evaluation:{},usage:{inputTokens:1,outputTokens:1,costNanoUsd:0}};}});
 await assert.rejects(generate(input,async()=>{valid=false;return true;},signal()),e=>e.code==='not_admitted');assert.equal(posts,0);
});

test('prototype Playground uses the shared database reservation without a private test marker',async()=>{
 const reservations=[];let posts=0;const availability={enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=>profile.binding,claimBudget:async value=>{reservations.push(value);return true;}};
 const generate=createBasicRagPlayground({subject:claim.subject,requestOrigin:'http://localhost:3001',env:{OPENROUTER_API_KEY:'synthetic'},profile,mode:'prototype',availability,claim:async()=>{throw Error('Old marker must not be touched');},completion:options=>async(_input,beforeSend)=>{assert.equal(await options.claim(),true);assert.equal(await beforeSend(),true);posts++;return {evaluation:{answer:'',evidence:[]},usage:{inputTokens:1,outputTokens:1,costNanoUsd:10}};}});
 await generate(input,async()=>true,signal());assert.equal(posts,1);assert.deepEqual(reservations,[{request:requestId,surface:'playground',fingerprint:input.context.digest}]);
});
