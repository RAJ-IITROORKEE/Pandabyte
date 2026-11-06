// Explicit disposable development identities only; never print credentials or private response bodies.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chmod,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@insforge/sdk';
import {createInsforgeAdapters} from '../src/retrieval/insforge-adapters.ts';
import {buildPlan} from '../src/agentic/plan.ts';

const mode=process.argv[2];
assert(process.argv.length===3&&['--create','--inspect','--observe','--cancel-pending','--core-guards','--check','--cleanup'].includes(mode),'explicit_mode_required');
if(process.env.PANDA_AGENT_DEV_ENV_FILE)process.loadEnvFile(process.env.PANDA_AGENT_DEV_ENV_FILE);
process.loadEnvFile('.env.local');
assert(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),'development_key_required');
assert(process.env.PANDA_AGENT_INSFORGE_BASE_URL==='https://feh4966v.us-east.insforge.app','verified_target_required');
assert(process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE==='insforge-pandabyte-migration','verified_template_required');
const dir='Panda-agent/infra/lightweight/artifacts',path=dir+'/phase6-auth-state.json',base='http://localhost:3001',purpose='panda-lightweight-phase6';
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const checks=[];let state;
const ensure=(condition,label)=>{assert(condition,label);checks.push(label);};
const save=async()=>{await writeFile(path,JSON.stringify(state,null,2),{mode:0o600});await chmod(path,0o600);};
const marker=()=>`Disposable Phase6 ${state.runId} `;
async function verified(actor){
 const user=await clerk.users.getUser(actor.userId);
 assert(user.privateMetadata?.purpose===purpose&&user.privateMetadata?.runId===state.runId&&user.emailAddresses.some(e=>e.emailAddress===actor.email),'fixture_identity_mismatch');
 return user;
}
async function session(actor){await verified(actor);actor.sessionId=(await clerk.sessions.createSession({userId:actor.userId})).id;await save();}
async function request(actor,route,method='GET',value){
 const token=(await clerk.sessions.getToken(actor.sessionId)).jwt;
 const response=await fetch(base+route,{method,headers:{authorization:`Bearer ${token}`,origin:base,...(value===undefined?{}:{'content-type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)}),redirect:'manual',signal:AbortSignal.timeout(45000)});
 const raw=await response.text();assert(Buffer.byteLength(raw)<=1024*1024,'response_limit');let data=null;try{data=JSON.parse(raw);}catch{}
 return {status:response.status,data};
}
async function scopedClient(actor){
 const jwt=(await clerk.sessions.getToken(actor.sessionId,process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE)).jwt;
 const client=createClient({baseUrl:process.env.PANDA_AGENT_INSFORGE_BASE_URL,accessToken:jwt,timeout:8000,retryCount:0,debug:false});
 const identity=await client.database.rpc('requesting_user_id');assert(!identity.error&&identity.data===actor.userId,'user_scope_mismatch');return client;
}
async function create(){
 await mkdir(dir,{recursive:true});state={purpose,runId:randomUUID(),actors:[]};
 await writeFile(path,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});
 for(const label of ['a','b']){
  const actor={label,email:`${state.runId}.${label}+clerk_test@example.com`,password:`Aa1!${randomBytes(24).toString('base64url')}`,threads:[]};state.actors.push(actor);await save();
  const user=await clerk.users.createUser({emailAddress:[actor.email],password:actor.password,firstName:'Disposable',lastName:'Phase6 '+label,privateMetadata:{purpose,runId:state.runId}});
  actor.userId=user.id;await save();await session(actor);await scopedClient(actor);checks.push('genuine_identity_'+label);
 }
 return {createdUsers:2,realClerk:true,realInsforge:true,checks,ownerSessionChanged:false,credentialsOnlyInIgnoredState:true};
}
async function createThread(actor,label){
 const title=marker()+label;assert(title.length<=100,'title_bound');
 const response=await request(actor,'/api/panda-agent/chats','POST',{title});
 assert(response.status===201&&response.data?.thread?.id,'chat_create_failed');actor.threads.push({id:response.data.thread.id,title});await save();return response.data.thread.id;
}
async function getSku(actor){
 const {data,error}=await (await scopedClient(actor)).database.rpc('panda_agent_runtime_products');
 assert(!error&&Array.isArray(data?.items)&&data.items.length<=42,'catalog_unavailable');
 const matches=data.items.filter(p=>typeof p?.title==='string'&&/\bx8266\b/i.test(p.title)&&typeof p.sku==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(p.sku));
 assert(matches.length===1,'catalog_identity_ambiguous');return matches[0].sku;
}
async function runCase(actor,label,payload,verify){
 const thread=await createThread(actor,label),requestId=randomUUID();
 const before=await request(actor,`/api/panda-agent/chats/${thread}`);assert(before.status===200&&Array.isArray(before.data?.messages),'initial_history_unavailable');
 const input={requestId,...payload};const first=await request(actor,`/api/panda-agent/chats/${thread}/messages`,'POST',input);
 assert(first.status===200&&Array.isArray(first.data?.messages),'case_unavailable');
 const answer=first.data.messages.at(-1);assert(answer?.role==='assistant'&&typeof answer.text==='string'&&Array.isArray(answer.citations),'answer_invalid');verify(answer);
 const replay=await request(actor,`/api/panda-agent/chats/${thread}/messages`,'POST',input);
 ensure(replay.status===200&&JSON.stringify(replay.data?.messages)===JSON.stringify(first.data.messages),label+'_same_request_replay');
 const read=await request(actor,`/api/panda-agent/chats/${thread}?requestId=${requestId}`);
 ensure(read.status===200&&read.data?.attemptStatus==='complete'&&read.data.messages.length===before.data.messages.length+2&&JSON.stringify(read.data.messages)===JSON.stringify(first.data.messages),label+'_one_saved_pair');
 return {thread,requestId};
}
async function check(){
 assert(state.actors.length===2&&state.actors.every(a=>!a.cleaned&&a.userId),'fixture_count');
 for(const actor of state.actors){
  await session(actor);const client=await scopedClient(actor);
  for(const [route,label] of [['/api/admin/panda-agent/skills','skills'],['/api/admin/panda-agent/tools','tools']])ensure((await request(actor,route)).status===403,'nonadmin_'+label+'_'+actor.label);
  for(const [rpc,label] of [['panda_agent_skills_read','skills'],['panda_agent_composite_tools_read','tools']]){const {error}=await client.database.rpc(rpc);ensure(!!error&&error.details==='forbidden','rpc_nonadmin_'+label+'_'+actor.label);}
 }
 const [a,b]=state.actors,sku=state.compoundSku??await getSku(a);
 const conversion={skillId:'panda-documented-firmware-help',question:'Convert 1000 mV to V.',products:[],frameworkVersion:null,task:'unit-conversion',conversion:{value:1000,from:'mV',to:'V'}};
 const unit=await runCase(a,'unit',{agentic:conversion},answer=>{ensure(answer.text.includes('1000 mV = 1 V.')&&answer.citations.length===0,'unit_conversion_result');ensure(answer.toolCards?.some(c=>c.toolId==='convert_units'&&c.state==='complete'),'unit_conversion_tool');});
 const gpio={skillId:'panda-documented-firmware-help',question:'ESP32 ESP-IDF 5.5.1 GPIO header',products:[],frameworkVersion:'5.5.1',task:'firmware-gpio'};
 await runCase(a,'firmware',{agentic:gpio},answer=>{ensure(answer.text.includes('#include "driver/gpio.h"')||answer.text.includes('Unreviewed external reference'),'firmware_reviewed_or_external_result');ensure(answer.toolCards?.some(c=>c.state==='complete'&&['panda_scoped_rag','fetch_public_docs_mcp'].includes(c.toolId)),'firmware_tool_observed');});
 const compound={...gpio,question:`Which MCU does ${sku} use, and show the official ESP32 GPIO documentation for ESP-IDF 5.5.1?`,products:[sku]};
 await runCase(a,'compound',{agentic:compound},answer=>{ensure(answer.citations.some(c=>/^(?:MCU|Microcontroller):\s*[A-Za-z0-9_-]+$/.test(c.quote)),'compound_literal_mcu');ensure(answer.toolCards?.some(c=>c.toolId==='panda_scoped_rag'&&c.state==='complete'),'compound_canonical_tool');ensure(answer.text.includes('#include "driver/gpio.h"')||answer.text.includes('Unreviewed external reference'),'compound_gpio_result');});
 await runCase(a,'ordinary',{question:`Which MCU does ${sku} use?`},answer=>ensure(answer.citations.length===1&&/^(?:MCU|Microcontroller):\s*[A-Za-z0-9_-]+$/.test(answer.citations[0].quote),'ordinary_mcu_literal'));
 const bthread=await createThread(b,'isolation');
 for(const [actor,id,label] of [[b,unit.thread,'b_to_a'],[a,bthread,'a_to_b']]){
  ensure((await request(actor,`/api/panda-agent/chats/${id}`)).status===404,'foreign_read_'+label);
  ensure((await request(actor,`/api/panda-agent/chats/${id}`,'DELETE')).status===404,'foreign_delete_'+label);
  ensure((await request(actor,`/api/panda-agent/chats/${id}/cancel`,'POST',{})).status===404,'foreign_cancel_'+label);
  ensure((await request(actor,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),agentic:conversion})).status===404,'foreign_write_'+label);
 }
 const foreignRequest=await request(b,`/api/panda-agent/chats/${bthread}?requestId=${unit.requestId}`);
 ensure(foreignRequest.status===200&&foreignRequest.data?.attemptStatus==='absent','foreign_request_absent');
 const missing=randomUUID();ensure((await request(a,`/api/panda-agent/chats/${missing}`)).status===404,'unknown_chat_denied');
 ensure((await request(a,`/api/panda-agent/chats/${missing}/cancel`,'POST',{})).status===404,'unknown_chat_cancel_denied');
 const invalid=await request(a,`/api/panda-agent/chats/${unit.thread}/messages`,'POST',{requestId:randomUUID(),agentic:{...conversion,conversion:{value:1,from:'V',to:'m'}}});
 ensure([400,409,429,503].includes(invalid.status)&&!invalid.data?.messages,'invalid_or_unavailable_bounded');
 return {passed:checks.length,checks,realClerk:true,realInsforge:true,actualBff:true,isolatedApiSessions:2,providerCostAndModelCalls:'not observable through public response',ownerSessionChanged:false,sourceRowsChanged:0};
}
async function inspect(){
 const actor=state.actors.find(a=>a.label==='a'&&!a.cleaned);assert(actor,'live_fixture_required');await verified(actor);
 const client=await scopedClient(actor),sku=await getSku(actor),adapters=createInsforgeAdapters(client,async()=>{throw Error('inspection_does_not_select');});
 const identity=await adapters.resolveIdentity({subject:actor.userId},{question:`Which MCU does ${sku} use?`,productSku:sku});assert(identity.kind==='resolved','inspection_identity');
 const scope=await adapters.currentScope({subject:actor.userId},identity.product);assert(scope?.sealed&&scope.engineeringVerified&&scope.manifestVerified&&scope.generationCurrent,'inspection_scope');
 const eligible=scope.chunks.filter(c=>!c.blocked),units=eligible.reduce((n,c)=>n+c.text.length,0);
 const primaryPlan=buildPlan({skillId:'panda-documented-firmware-help',question:`Which MCU does ${sku} use, and show the official ESP32 GPIO documentation for ESP-IDF 5.5.1?`,products:[sku],frameworkVersion:'5.5.1',task:'firmware-gpio'});
 if(eligible.length<=8&&units<=20000&&primaryPlan.kind==='planned'){state.compoundSku=sku;await save();}
 const candidates=[];const catalog=await client.database.rpc('panda_agent_runtime_products');assert(!catalog.error&&Array.isArray(catalog.data?.items),'inspection_catalog');
 for(const model of ['xLoRa','xC3','xC5','Maker UNO']){
  const rows=catalog.data.items.filter(p=>typeof p.title==='string'&&new RegExp('\\b'+model+'\\b','i').test(p.title));if(rows.length!==1){candidates.push({model,unique:false});continue;}
  const item=rows[0],id=await adapters.resolveIdentity({subject:actor.userId},{question:`Which MCU does ${item.sku} use?`,productSku:item.sku});if(id.kind!=='resolved')continue;
  const current=await adapters.currentScope({subject:actor.userId},id.product);if(!current)continue;const chunks=current.chunks.filter(c=>!c.blocked),count=chunks.length,size=chunks.reduce((n,c)=>n+c.text.length,0);
  const mcu=chunks.flatMap(c=>c.text.split(/\r?\n/)).filter(line=>/^\s*(?:[-*•]\s*)?(?:MCU|Microcontroller):\s*[A-Za-z0-9][A-Za-z0-9_-]{0,63}(?:\s|$)/i.test(line));
  const plan=buildPlan({skillId:'panda-documented-firmware-help',question:`Which MCU does ${item.sku} use, and show the official ESP32 GPIO documentation for ESP-IDF 5.5.1?`,products:[item.sku],frameworkVersion:'5.5.1',task:'firmware-gpio'});
  const fits=count<=8&&size<=20000&&mcu.length===1&&plan.kind==='planned';candidates.push({model,unique:true,eligibleFragments:count,contextUtf16Units:size,oneMcuField:mcu.length===1,finitePlanAccepted:plan.kind==='planned',listingPlusMetadataReferenceBudgetFits:fits});
  if(fits&&!state.compoundSku){state.compoundSku=item.sku;await save();}
 }
 return {evidenceClass:'genuine disposable Clerk session and current approved canonical adapter; readonly preflight, no answer execution',x8266:{eligibleFragments:eligible.length,contextUtf16Units:units,listingPlusMetadataReferenceWithinLimits:eligible.length<=8&&units<=20000,finitePlanAccepted:primaryPlan.kind==='planned'},externalMetadataContext:{fragments:0,units:0,bodyHeaderDiscarded:true},candidates,selectedCompoundCandidate:!!state.compoundSku,modelCalls:0,sourceMutation:false,ownerSessionChanged:false};
}
async function coreGuards(){
 assert(state.actors.length===2&&state.actors.every(a=>a.userId&&!a.cleaned),'live_fixtures_required');
 for(const actor of state.actors){
  await verified(actor);const client=await scopedClient(actor);
  for(const name of ['panda_agent_skills_read','panda_agent_composite_tools_read']){const {error}=await client.database.rpc(name);ensure(error?.details==='forbidden','genuine_nonadmin_'+name+'_'+actor.label);}
  const raw=await client.database.rpc('panda_agent_composite_execution',{p_payload:'{}',p_mac:'0'.repeat(64)});ensure(!!raw.error&&!raw.data,'genuine_unsigned_recovery_denied_'+actor.label);
  const rows=await client.database.from('panda_agent_composite_calls').select('call_id').limit(1);ensure(!!rows.error,'genuine_private_call_table_denied_'+actor.label);
 }
 const [a,b]=state.actors,sku=await getSku(a);
 const own=await runCase(a,'core-guards',{question:`Which MCU does ${sku} use?`},answer=>ensure(answer.citations.length===1&&/^(?:MCU|Microcontroller):\s*ESP8266$/i.test(answer.citations[0].quote),'genuine_core_literal_after_schema'));
 const other=await createThread(b,'core-isolation');
 for(const [actor,id,label] of [[b,own.thread,'b_to_a'],[a,other,'a_to_b']]){
  ensure((await request(actor,`/api/panda-agent/chats/${id}`)).status===404,'core_foreign_read_'+label);
  ensure((await request(actor,`/api/panda-agent/chats/${id}`,'DELETE')).status===404,'core_foreign_delete_'+label);
  ensure((await request(actor,`/api/panda-agent/chats/${id}/cancel`,'POST',{})).status===404,'core_foreign_cancel_'+label);
  ensure((await request(actor,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),question:`Which MCU does ${sku} use?`})).status===404,'core_foreign_write_'+label);
 }
 const requestProbe=await request(b,`/api/panda-agent/chats/${other}?requestId=${own.requestId}`);ensure(requestProbe.status===200&&requestProbe.data?.attemptStatus==='absent','core_foreign_request_not_visible');
 return {evidenceClass:'genuine independent Clerk API sessions, current Phase5 app/private runtime after additive Phase6 SQL; not enabled composite acceptance',passed:checks.length,checks,isolatedApiSessions:2,realClerk:true,realInsforge:true,sourceMutation:false,ownerSessionChanged:false};
}
async function observe(cancelPending=false){
 const observed=[];let cancellations=0;
 for(const actor of state.actors){if(actor.cleaned)continue;await verified(actor);
  for(const thread of actor.threads){assert(thread.title.startsWith(marker()),'observation_marker');let r=await request(actor,`/api/panda-agent/chats/${thread.id}`);assert(r.status===200&&r.data?.thread?.title===thread.title,'observation_owner_guard');
   if(cancelPending&&['pending','blocked'].includes(r.data.thread.status)){assert((await request(actor,`/api/panda-agent/chats/${thread.id}/cancel`,'POST',{})).status===200,'explicit_pending_cancel_unconfirmed');cancellations++;r=await request(actor,`/api/panda-agent/chats/${thread.id}`);assert(r.status===200&&r.data.thread.status==='idle','explicit_pending_cancel_not_terminal');}
   const answer=r.data.messages?.at(-1);
   observed.push({actor:actor.label,status:r.data.thread.status,messages:r.data.messages?.length??null,terminalReason:answer?.terminalReason??null,outcome:answer?.outcome??null,toolCards:answer?.toolCards??[],hasValidatedMcu:r.data.messages?.some(m=>m.role==='assistant'&&m.citations?.some(c=>/^(?:MCU|Microcontroller):\s*ESP8266$/i.test(c.quote)))??false});
  }
 }
 return {evidenceClass:cancelPending?'explicit cancellation of marker-owned test attempts; no re-execution':'owned status-only observation; no re-execution',observed,confirmedCancellations:cancellations};
}
async function cleanup(){
 let users=0,chats=0;
 for(const actor of state.actors){
  if(actor.cleaned)continue;
  if(!actor.userId){const found=await clerk.users.getUserList({emailAddress:[actor.email]});assert(found.data.length<=1,'ambiguous_fixture');if(!found.data.length){actor.cleaned=true;await save();continue;}actor.userId=found.data[0].id;await save();}
  await verified(actor);await session(actor);
  const found=new Map((actor.threads??[]).map(t=>[t.id,t.title]));
  for(const suffix of ['', '?archived=true']){
   const list=await request(actor,'/api/panda-agent/chats'+suffix);assert(list.status===200&&Array.isArray(list.data?.threads)&&list.data.threads.length<100,'cleanup_inventory_incomplete');
   for(const thread of list.data.threads)if(typeof thread.title==='string'&&thread.title.startsWith(marker()))found.set(thread.id,thread.title);
  }
  for(const [id,title] of found){
   assert(typeof title==='string'&&title.startsWith(marker()),'cleanup_marker_required');
   const read=await request(actor,`/api/panda-agent/chats/${id}`);if(read.status===404)continue;
   assert(read.status===200&&read.data?.thread?.title===title,'cleanup_thread_mismatch');
   if(['pending','blocked'].includes(read.data.thread.status))assert((await request(actor,`/api/panda-agent/chats/${id}/cancel`,'POST',{})).status===200,'cleanup_pending_unresolved');
   assert((await request(actor,`/api/panda-agent/chats/${id}`,'DELETE')).status===200,'cleanup_delete_failed');
   assert((await request(actor,`/api/panda-agent/chats/${id}`)).status===404,'cleanup_not_verified');chats++;
  }
  await verified(actor);await clerk.users.deleteUser(actor.userId);
  try{await clerk.users.getUser(actor.userId);throw Error('delete_not_verified');}catch(e){assert(e?.status===404,'delete_not_verified');}
  actor.cleaned=true;delete actor.password;delete actor.sessionId;await save();users++;
 }
 return {cleanedUsers:users,cleanedChats:chats,ownerSessionChanged:false};
}
try{
 assert((await clerk.instance.get()).id==='ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI','development_instance_mismatch');
 if(mode==='--create')console.log(JSON.stringify(await create()));
 else{
  state=JSON.parse(await readFile(path,'utf8'));
  assert(state?.purpose===purpose&&/^[0-9a-f-]{36}$/.test(state.runId)&&Array.isArray(state.actors)&&state.actors.length<=2,'fixture_state_invalid');
  console.log(JSON.stringify(mode==='--check'?await check():mode==='--inspect'?await inspect():mode==='--observe'?await observe():mode==='--cancel-pending'?await observe(true):mode==='--core-guards'?await coreGuards():await cleanup()));
 }
}catch(e){
 const label=e?.code==='ERR_ASSERTION'&&/^[a-z0-9_]+$/.test(e.message)?e.message:'external_or_runtime_error';
 await writeFile(dir+'/phase6-auth-last-failure.json',JSON.stringify({mode,label,passed:checks,actors:state?.actors?.map(a=>({label:a.label,threads:a.threads?.length??0,cleaned:!!a.cleaned}))??[]},null,2),{mode:0o600});
 console.error(JSON.stringify({result:'stopped',label,passedChecks:checks.length}));process.exitCode=1;
}
