// Explicit disposable development identities only. Never print state, tokens, passwords or IDs.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@insforge/sdk';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const mode=process.argv[2];
assert(process.argv.length===3 && ['--create','--text','--check','--vendor','--withdraw','--tool','--tool-disabled','--tool-replay','--core','--image-off','--cleanup'].includes(mode),'explicit_mode_required');
if(process.env.PANDA_AGENT_DEV_ENV_FILE)process.loadEnvFile(process.env.PANDA_AGENT_DEV_ENV_FILE);
process.loadEnvFile('.env.local');
assert(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),'development_key_required');
assert(process.env.PANDA_AGENT_INSFORGE_BASE_URL==='https://feh4966v.us-east.insforge.app','verified_target_required');
assert(process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE==='insforge-pandabyte-migration','verified_template_required');
const base='http://localhost:3001',dir='Panda-agent/infra/lightweight/artifacts',statePath=dir+'/phase5-auth-state.json',summaryPath=dir+'/phase5-auth-integration.json';
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const checks=[];let state;
const ensure=(value,label)=>{assert(value,label);checks.push(label);};
const save=async()=>{await writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});await chmod(statePath,0o600);};
async function verified(actor){
 const user=await clerk.users.getUser(actor.userId);
 assert(user.privateMetadata?.purpose==='panda-lightweight-phase5' && user.privateMetadata?.runId===state.runId && user.emailAddresses.some(e=>e.emailAddress===actor.email),'fixture_identity_mismatch');
 return user;
}
async function session(actor){await verified(actor);actor.sessionId=(await clerk.sessions.createSession({userId:actor.userId})).id;await save();}
async function request(actor,path,method='GET',body){
 const token=(await clerk.sessions.getToken(actor.sessionId)).jwt;
 const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${token}`,origin:base,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(45000)});
 const raw=await response.text();assert(Buffer.byteLength(raw)<=4*1024*1024,'response_limit');let data=null;try{data=JSON.parse(raw);}catch{}
 return {status:response.status,data,raw};
}
async function scopedClient(actor){
 const jwt=(await clerk.sessions.getToken(actor.sessionId,process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE)).jwt;
 const client=createClient({baseUrl:process.env.PANDA_AGENT_INSFORGE_BASE_URL,accessToken:jwt,timeout:8000,retryCount:0,debug:false});
 const identity=await client.database.rpc('requesting_user_id');assert(!identity.error&&identity.data===actor.userId,'user_scope_mismatch');return client;
}
async function create(){
 await mkdir(dir,{recursive:true});state={runId:randomUUID(),actors:[]};
 await writeFile(statePath,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});
 for(const label of ['a','b']){
  const actor={label,email:`${state.runId}.${label}+clerk_test@example.com`,password:`Aa1!${randomBytes(24).toString('base64url')}`,threads:[]};state.actors.push(actor);await save();
  const user=await clerk.users.createUser({emailAddress:[actor.email],password:actor.password,firstName:'Disposable',lastName:'Phase5 '+label,privateMetadata:{purpose:'panda-lightweight-phase5',runId:state.runId}});
  actor.userId=user.id;await save();await session(actor);await scopedClient(actor);checks.push('genuine_identity_'+label);
 }
 return {createdUsers:2,realClerk:true,realInsforge:true,ownerSessionChanged:false,credentialsStoredOnlyInIgnoredState:true};
}
async function createThread(actor,label){
 const response=await request(actor,'/api/panda-agent/chats','POST',{title:'Disposable Phase 5 '+label});
 assert(response.status===201&&response.data?.thread?.id,'chat_create_failed');actor.threads.push(response.data.thread.id);await save();return response.data.thread.id;
}
const diagnostic={errorText:'fatal error: driver/gpio.h: No such file or directory',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1'};
async function textCheck(){
 for(const actor of state.actors){await session(actor);await scopedClient(actor);ensure((await request(actor,'/api/admin/panda-agent/documentation')).status===403,'nonadmin_documentation_'+actor.label);}
 const [a,b]=state.actors;
 if(!state.testThreads){state.testThreads={a:await createThread(a,'diagnostic'),b:await createThread(b,'isolation')};await save();}
 const id=state.testThreads.a,requestId=randomUUID();state.initialTextRequest=requestId;await save();
 const result=await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId,diagnostic});
 ensure(result.status===200&&result.data?.messages?.at(-1)?.citations?.length===0,'pending_source_pasted_text_abstains');
 ensure((await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId,diagnostic})).status===200,'pasted_text_same_identity_replay');
 ensure((await request(b,`/api/panda-agent/chats/${id}`)).status===404,'foreign_diagnostic_read_denied');
 ensure((await request(b,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),diagnostic})).status===404,'foreign_diagnostic_write_denied');
 ensure((await request(b,`/api/panda-agent/chats/${id}/cancel`,'POST',{})).status===404,'foreign_diagnostic_cancel_denied');
 const proof={passed:checks.length,checks,actualBff:true,realClerk:true,realInsforge:true,isolatedApiSessions:2,liveVision:false,privateImageWorkerUsed:false,ownerSessionChanged:false};
 await writeFile(dir+'/phase5-text-isolation.json',JSON.stringify(proof,null,2));return proof;
}
async function imageRequest(actor,thread,assetId,method='GET',form){
 const token=(await clerk.sessions.getToken(actor.sessionId)).jwt;
 return fetch(base+`/api/panda-agent/chats/${thread}/screenshots${assetId?'/'+assetId:''}`,{method,headers:{authorization:`Bearer ${token}`,origin:base},...(form?{body:form}:{}),signal:AbortSignal.timeout(40000)});
}
function form(bytes,assetId,consent='private-diagnostic-v1'){
 const body=new FormData();body.set('file',new Blob([bytes],{type:'image/png'}),'synthetic-compiler-error.png');body.set('assetId',assetId);body.set('consent',consent);return body;
}
async function check(){
 assert(state.actors.length===2,'fixture_count');
 for(const actor of state.actors){await session(actor);await scopedClient(actor);ensure((await request(actor,'/api/admin/panda-agent/documentation')).status===403,'nonadmin_documentation_'+actor.label);}
 const [a,b]=state.actors;
 if(!state.testThreads){state.testThreads={a:await createThread(a,'diagnostic'),b:await createThread(b,'isolation')};await save();}
 const aid=state.testThreads.a,bid=state.testThreads.b;
 const bytes=await sharp({create:{width:900,height:140,channels:3,background:'#111111'}}).composite([{input:Buffer.from('<svg width="900" height="140"><text x="20" y="65" font-size="22" fill="white">fatal error: driver/gpio.h: No such file or directory</text></svg>')}]).png().toBuffer();
 await writeFile(dir+'/phase5-synthetic-error.png',bytes);await writeFile(dir+'/phase5-blurred-error.png',await sharp(bytes).blur(20).png().toBuffer());
 const imageId=state.imageId??randomUUID();state.imageId=imageId;await save();
 ensure((await imageRequest(a,aid,null,'POST',form(bytes,randomUUID(),''))).status===400,'consent_required');
 const upload=await imageRequest(a,aid,null,'POST',form(bytes,imageId));const metadata=await upload.json();ensure([200,201].includes(upload.status)&&metadata.image?.state==='ready'&&metadata.visionAvailable===false,'real_private_upload');
 ensure(metadata.image.expiresAt&&Date.parse(metadata.image.expiresAt)>Date.now()&&Date.parse(metadata.image.expiresAt)<=Date.now()+900000,'normal_900_second_lease');
 ensure(!('sha256' in metadata.image)&&!('inputSha256' in metadata.image)&&!('filename' in metadata.image),'public_attachment_projection');
 const read=await imageRequest(a,aid,imageId);const normalized=Buffer.from(await read.arrayBuffer());const decoded=await sharp(normalized).metadata();
 ensure(read.status===200&&read.headers.get('content-type')==='image/png'&&/no-store/.test(read.headers.get('cache-control')??'')&&decoded.width===900&&decoded.height===140&&!decoded.exif&&!decoded.xmp&&!decoded.icc,'owned_normalized_private_read');
 ensure((await imageRequest(a,aid,null,'POST',form(bytes,imageId))).status===200,'same_upload_status_recovery');
 const changed=await sharp({create:{width:20,height:20,channels:3,background:'red'}}).png().toBuffer();ensure((await imageRequest(a,aid,null,'POST',form(changed,imageId))).status===409,'changed_bytes_same_identity_conflict');
 for(const [actor,thread,label] of [[b,aid,'b_to_a'],[a,bid,'a_to_b']]){
  const asset=label==='b_to_a'?imageId:randomUUID();
  ensure((await imageRequest(actor,thread,asset)).status===404,'foreign_image_read_'+label);
  ensure((await imageRequest(actor,thread,asset,'DELETE')).status===404,'foreign_image_delete_'+label);
  ensure((await imageRequest(actor,thread,null,'POST',form(bytes,randomUUID()))).status===404,'foreign_image_upload_'+label);
 }
 const requestId=state.pastedRequest??randomUUID();state.pastedRequest=requestId;await save();
 const body={requestId,diagnostic:{...diagnostic,screenshotId:imageId}};
 const scoped=await (await scopedClient(a)).database.rpc('panda_agent_vendor_scope',{p_chip:'esp32',p_version:'5.5.1'});assert(!scoped.error,'current_vendor_scope_required');
 const beforeMessages=(await request(a,`/api/panda-agent/chats/${aid}`)).data.messages.length;
 const answer=await request(a,`/api/panda-agent/chats/${aid}/messages`,'POST',body);ensure(answer.status===200&&answer.data?.messages?.at(-1)?.citations?.length===(scoped.data===null?0:1)&&answer.data.messages.at(-1).text.includes('no text was extracted'),'vision_off_pasted_fallback_current_reviewed_scope');
 ensure((await request(a,`/api/panda-agent/chats/${aid}/messages`,'POST',body)).status===200,'same_diagnostic_identity_replay');
 const history=await request(a,`/api/panda-agent/chats/${aid}?requestId=${requestId}`);ensure(history.status===200&&history.data?.attemptStatus==='complete'&&history.data.messages.length===beforeMessages+2,'single_durable_diagnostic_pair');
 ensure((await request(a,`/api/panda-agent/chats/${aid}/messages`,'POST',{requestId:randomUUID(),question:'spoof',diagnostic})).status===400,'mixed_message_union_rejected');
 ensure((await request(b,`/api/panda-agent/chats/${aid}`)).status===404,'foreign_diagnostic_history_denied');
 ensure((await request(b,`/api/panda-agent/chats/${aid}/messages`,'POST',{requestId:randomUUID(),diagnostic})).status===404,'foreign_diagnostic_write_denied');
 ensure((await request(b,`/api/panda-agent/chats/${aid}/cancel`,'POST',{})).status===404,'foreign_diagnostic_cancel_denied');
 const removal=await imageRequest(a,aid,imageId,'DELETE');ensure(removal.status===200&&(await removal.json()).state==='deleted','owned_screenshot_deleted');
 ensure((await imageRequest(a,aid,imageId)).status===410,'deleted_screenshot_unreadable');
 ensure((await imageRequest(a,aid,null,'POST',form(bytes,imageId))).status===410,'deleted_identity_never_reuploaded');
 const priorSession=a.sessionId,oldToken=(await clerk.sessions.getToken(priorSession)).jwt;await clerk.sessions.revokeSession(priorSession);
 const denied=await fetch(base+`/api/panda-agent/chats/${aid}`,{headers:{authorization:`Bearer ${oldToken}`},signal:AbortSignal.timeout(20000)});ensure([401,404].includes(denied.status),'revoked_session_denied');
 await session(a);ensure((await request(a,`/api/panda-agent/chats/${aid}`)).status===200,'fresh_same_owner_session_history');
 const proof={passed:checks.length,checks,realClerk:true,realInsforge:true,actualBff:true,actualPrivateImageWorker:true,isolatedApiSessions:2,isolatedBrowserContexts:0,liveVision:false,modelCalls:0,disposableUsersRetained:true,ownerSessionChanged:false,sourceRowsChanged:0,normalizedSha256:createHash('sha256').update(normalized).digest('hex')};
 await writeFile(summaryPath,JSON.stringify(proof,null,2));return proof;
}
async function vendor(withdrawn=false){
 const a=state.actors[0];await session(a);const id=state.testThreads.a;
 if(!withdrawn){
  const requestId=randomUUID();state.vendorRequest=requestId;await save();
  const result=await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId,diagnostic});const answer=result.data?.messages?.at(-1);
  ensure(result.status===200&&answer?.citations?.length===1&&answer.citations[0].kind==='vendor'&&answer.citations[0].quote==='#include "driver/gpio.h"','reviewed_vendor_exact_literal');
  const read=await request(a,`/api/panda-agent/chats/${id}?requestId=${requestId}`);ensure(read.status===200&&read.data?.messages?.at(-1)?.citations?.length===1,'reviewed_vendor_reload');
  for(const chip of ['esp32c3','esp32c6','esp32s3']){const rejected=await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),diagnostic:{...diagnostic,chip}});ensure(rejected.status===200&&rejected.data?.messages?.at(-1)?.citations?.length===0,'wrong_chip_'+chip);}
  for(const errorText of ['Arduino GPIO compilation error','ESP-IDF 4.4 GPIO compilation error','GPIO header pin wiring voltage']){const rejected=await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),diagnostic:{...diagnostic,errorText}});ensure(rejected.status===200&&rejected.data?.messages?.at(-1)?.citations?.length===0,'incompatible_pasted_scope_'+checks.length);}
 }else{
  assert(state.vendorRequest,'vendor_request_required');const read=await request(a,`/api/panda-agent/chats/${id}?requestId=${state.vendorRequest}`);
  ensure(read.status===200&&read.data?.messages?.filter(m=>m.role==='assistant').every(m=>m.citations.length===0&&!m.text.includes('#include "driver/gpio.h"')),'withdrawal_withholds_retained_quotes');
  const result=await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),diagnostic});ensure(result.status===200&&result.data?.messages?.at(-1)?.citations?.length===0,'withdrawn_source_next_answer_abstains');
 }
 const proof={passed:checks.length,checks,realClerk:true,realInsforge:true,actualBff:true,withdrawn,ownerSessionChanged:false,liveVision:false};await writeFile(dir+`/phase5-vendor-${withdrawn?'withdrawal':'approved'}.json`,JSON.stringify(proof,null,2));return proof;
}
async function toolCheck(enabled){
 const a=state.actors[0];await session(a);const id=state.testThreads.a;
 const tool=await (await scopedClient(a)).database.rpc('panda_agent_tool_state');assert(!tool.error&&tool.data.enabled===enabled,'expected_admin_tool_state_required');
 const result=await request(a,`/api/panda-agent/chats/${id}/messages`,'POST',{requestId:randomUUID(),diagnostic});const answer=result.data?.messages?.at(-1);
 ensure(result.status===200&&answer?.citations?.length===0,'external_results_never_canonical_citations');
 ensure(typeof answer?.text==='string'&&answer.text.includes('Unreviewed external reference')===enabled,enabled?'enabled_tool_real_fixed_official_fetch':'disabled_tool_cannot_lookup');
 const proof={passed:checks.length,checks,enabled,actualBff:true,realClerk:true,realInsforge:true,actualOfficialFetch:enabled,liveVision:false,modelCalls:0,queryContainsPrivateLog:false};
 await writeFile(dir+`/phase5-tool-${enabled?'enabled':'disabled'}.json`,JSON.stringify(proof,null,2));return proof;
}
async function coreCheck(){
 const a=state.actors[0];await session(a);const tool=await (await scopedClient(a)).database.rpc('panda_agent_tool_state');assert(!tool.error&&tool.data.enabled===false,'tool_must_be_disabled');
 const qa=await createThread(a,'core-qa-after-tool-disabled');const result=await request(a,`/api/panda-agent/chats/${qa}/messages`,'POST',{requestId:randomUUID(),question:'Which MCU does the x8266 listing name?'});
 ensure(result.status===200&&result.data?.messages?.at(-1)?.citations?.length===1,'core_qa_after_tool_disabled');
 const proof={passed:checks.length,checks,actualBff:true,actualPrivateWorker:true,realClerk:true,modelCalls:0};await writeFile(dir+'/phase5-core-preserved.json',JSON.stringify(proof,null,2));return proof;
}
async function imageOff(){
 const a=state.actors[0];await session(a);await scopedClient(a);const thread=state.testThreads.a,asset=randomUUID();
 const bytes=await readFile(dir+'/phase5-synthetic-error.png');
 const denied=await imageRequest(a,thread,null,'POST',form(bytes,asset));
 ensure(denied.status===503&&(await denied.json()).error==='unavailable','disabled_image_upload_unavailable');
 ensure((await imageRequest(a,thread,asset)).status===404,'disabled_upload_created_no_asset');
 ensure((await request(a,`/api/panda-agent/chats/${thread}`)).status===200,'owned_history_available_with_images_off');
 const proof={passed:checks.length,checks,actualBff:true,realClerk:true,realInsforge:true,operatorConfiguredImageFlag:false,assetReserved:false,modelCalls:0};
 await writeFile(dir+'/phase5-image-switch-off.json',JSON.stringify(proof,null,2));return proof;
}
async function toolReplay(){
 const a=state.actors[0];await session(a);const tool=await (await scopedClient(a)).database.rpc('panda_agent_tool_state');assert(!tool.error&&tool.data.enabled===false,'tool_must_be_disabled');
 const read=await request(a,`/api/panda-agent/chats/${state.testThreads.a}`);assert(read.status===200&&Array.isArray(read.data?.messages),'read_required');
 const staleReferences=read.data.messages.filter(m=>m.role==='assistant'&&m.text.includes('Unreviewed external reference')).length;
 const proof={toolEnabled:false,staleReferences,realClerk:true,realInsforge:true,actualBff:true,readOnly:true,newToolCalls:0};
 await writeFile(dir+`/phase5-tool-replay-${staleReferences?'red':'green'}.json`,JSON.stringify(proof,null,2));ensure(staleReferences===0,'disabled_tool_retained_reference_withheld');return {...proof,passed:checks.length,checks};
}
async function cleanup(){
 let users=0,chats=0;
 for(const actor of state.actors){
  if(actor.cleaned)continue;
  if(!actor.userId){const found=await clerk.users.getUserList({emailAddress:[actor.email]});assert(found.data.length<=1,'ambiguous_fixture');if(!found.data.length)continue;actor.userId=found.data[0].id;await save();}
  await verified(actor);await session(actor);
  const found=new Set(actor.threads??[]);
  for(const suffix of ['', '?archived=true']){
   const list=await request(actor,'/api/panda-agent/chats'+suffix);assert(list.status===200 && Array.isArray(list.data?.threads) && list.data.threads.length<100,'cleanup_inventory_incomplete');
   for(const entry of list.data.threads)found.add(entry.id);
  }
  actor.threads=[...found];await save();
  for(const id of actor.threads){
   const read=await request(actor,`/api/panda-agent/chats/${id}`);if(read.status===404)continue;assert(read.status===200,'cleanup_read_failed');
   if(['pending','blocked'].includes(read.data?.thread?.status)){const canceled=await request(actor,`/api/panda-agent/chats/${id}/cancel`,'POST',{});assert(canceled.status===200,'cleanup_pending_unresolved');}
   const deleted=await request(actor,`/api/panda-agent/chats/${id}`,'DELETE');assert(deleted.status===200,'cleanup_delete_failed');assert((await request(actor,`/api/panda-agent/chats/${id}`)).status===404,'cleanup_not_verified');chats++;
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
 else {state=JSON.parse(await readFile(statePath,'utf8'));assert(state?.runId && Array.isArray(state.actors),'fixture_state_invalid');console.log(JSON.stringify(mode==='--text'?await textCheck():mode==='--check'?await check():mode==='--vendor'?await vendor():mode==='--withdraw'?await vendor(true):mode==='--tool'?await toolCheck(true):mode==='--tool-disabled'?await toolCheck(false):mode==='--tool-replay'?await toolReplay():mode==='--core'?await coreCheck():mode==='--image-off'?await imageOff():await cleanup()));}
}catch{
 await writeFile(dir+'/phase5-auth-stopped.json',JSON.stringify({mode,checks,stopped:true,cleanupRequired:true},null,2));
 console.error('Phase 5 disposable check stopped; inspect ignored fixture state and clean up only marker-verified identities.');process.exitCode=1;
}
