// Explicit disposable development identities only. Never print state, tokens, passwords or IDs.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@insforge/sdk';

const mode=process.argv[2];
assert(process.argv.length===3 && ['--create','--check','--cleanup'].includes(mode),'explicit_mode_required');
if(process.env.PANDA_AGENT_DEV_ENV_FILE)process.loadEnvFile(process.env.PANDA_AGENT_DEV_ENV_FILE);
process.loadEnvFile('.env.local');
assert(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),'development_key_required');
assert(process.env.PANDA_AGENT_INSFORGE_BASE_URL==='https://feh4966v.us-east.insforge.app','verified_target_required');
assert(process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE==='insforge-pandabyte-migration','verified_template_required');
const base='http://localhost:3001',dir='Panda-agent/infra/lightweight/artifacts',statePath=dir+'/phase4-auth-state.json',summaryPath=dir+'/phase4-auth-integration.json';
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const checks=[];let state;
const ensure=(value,label)=>{assert(value,label);checks.push(label);};
const save=async()=>{await writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});await chmod(statePath,0o600);};
async function verified(actor){
 const user=await clerk.users.getUser(actor.userId);
 assert(user.privateMetadata?.purpose==='panda-lightweight-phase4' && user.privateMetadata?.runId===state.runId && user.emailAddresses.some(e=>e.emailAddress===actor.email),'fixture_identity_mismatch');
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
  const user=await clerk.users.createUser({emailAddress:[actor.email],password:actor.password,firstName:'Disposable',lastName:'Phase4 '+label,privateMetadata:{purpose:'panda-lightweight-phase4',runId:state.runId}});
  actor.userId=user.id;await save();await session(actor);await scopedClient(actor);checks.push('genuine_identity_'+label);
 }
 return {createdUsers:2,realClerk:true,realInsforge:true,ownerSessionChanged:false,credentialsStoredOnlyInIgnoredState:true};
}
async function createThread(actor,label){
 const response=await request(actor,'/api/panda-agent/chats','POST',{title:'Disposable Phase 4 '+label});
 assert(response.status===201&&response.data?.thread?.id,'chat_create_failed');actor.threads.push(response.data.thread.id);await save();return response.data.thread.id;
}
async function check(){
 assert(Array.isArray(state.actors)&&state.actors.length===2,'fixture_count');
 for(const actor of state.actors){await session(actor);await scopedClient(actor);checks.push('genuine_current_session_'+actor.label);}
 const [a,b]=state.actors;
 const client=await scopedClient(a),catalog=await client.database.rpc('panda_agent_guide_products');
 assert(!catalog.error && Array.isArray(catalog.data?.items),'guide_catalog_unavailable');
 const boards=catalog.data.items.filter(x=>/x8266/i.test(x.title));assert(boards.length===1 && typeof boards[0].sku==='string','fixture_board_ambiguous');
 for(const actor of [a,b]){
  const get=await request(actor,'/api/admin/panda-agent/skills');ensure(get.status===403,'nonadmin_skills_read_'+actor.label);
  const patch=await request(actor,'/api/admin/panda-agent/skills','PATCH',{skillId:'embedded-project-guide',action:'disable',bundleVersion:1,expectedVersion:0,reason:'Disposable denial check'});
  ensure(patch.status===403,'nonadmin_skills_change_'+actor.label);
 }
 const aid=await createThread(a,'guide'),bid=await createThread(b,'isolation');
 const guideTurn=randomUUID();state.guideTurn=guideTurn;await save();
 const body={requestId:guideTurn,guide:{goal:'Build a parking monitor',board:boards[0].sku,components:['distance sensor'],expectedVersion:0}};
 const first=await request(a,`/api/panda-agent/chats/${aid}/messages`,'POST',body);ensure(first.status===200,'guide_first_completed');
 const duplicate=await request(a,`/api/panda-agent/chats/${aid}/messages`,'POST',body);ensure(duplicate.status===200,'guide_same_attempt_replayed');
 const history=await request(a,`/api/panda-agent/chats/${aid}?requestId=${guideTurn}`);
 ensure(history.status===200 && history.data?.attemptStatus==='complete' && history.data.messages?.length===2 && history.data.projectMemory?.version===1 && history.data.projectMemory?.guideTurns===1,'single_saved_guide_and_memory');
 ensure(!('skill' in (history.data.projectMemory??{})) && !('digest' in (history.data.projectMemory??{})),'public_memory_minimal');
 for(const [actor,foreign,label] of [[a,bid,'a_to_b'],[b,aid,'b_to_a']]){
  const read=await request(actor,`/api/panda-agent/chats/${foreign}`);ensure(read.status===404 && read.data?.error==='not_found' && !read.raw.includes('Microcontroller: ESP8266'),'foreign_read_'+label);
  const write=await request(actor,`/api/panda-agent/chats/${foreign}/messages`,'POST',{requestId:randomUUID(),question:'Which MCU does the x8266 listing name?'});ensure(write.status===404,'foreign_write_'+label);
  const cancel=await request(actor,`/api/panda-agent/chats/${foreign}/cancel`,'POST',{});ensure(cancel.status===404,'foreign_cancel_'+label);
  const memory=await request(actor,`/api/panda-agent/chats/${foreign}?requestId=${guideTurn}`);ensure(memory.status===404&&!memory.raw.includes('projectMemory'),'foreign_memory_'+label);
 }
 const qa=await createThread(a,'qa'),question='Which MCU does the x8266 listing name?';
 const qaRun=await request(a,`/api/panda-agent/chats/${qa}/messages`,'POST',{requestId:randomUUID(),question});
 ensure(qaRun.status===200 && qaRun.data?.messages?.length===2 && qaRun.data.messages[1].citations?.length===1,'ordinary_product_qa_unchanged');
 const proof={passed:checks.length,checks,realClerk:true,realInsforge:true,actualBff:true,isolatedApiSessions:2,isolatedBrowserContexts:0,disposableUsersRetained:true,ownerSessionChanged:false,sourceRowsChanged:0};
 await writeFile(summaryPath,JSON.stringify(proof,null,2));return proof;
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
 else {state=JSON.parse(await readFile(statePath,'utf8'));assert(state?.runId && Array.isArray(state.actors),'fixture_state_invalid');console.log(JSON.stringify(mode==='--check'?await check():await cleanup()));}
}catch{
 await writeFile(dir+'/phase4-auth-stopped.json',JSON.stringify({mode,checks,stopped:true,cleanupRequired:true},null,2));
 console.error('Phase 4 disposable check stopped; inspect ignored fixture state and clean up only marker-verified identities.');process.exitCode=1;
}
