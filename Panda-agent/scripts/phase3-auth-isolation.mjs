import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@insforge/sdk';

assert(['--run','--status','--cleanup'].includes(process.argv[2]),'explicit_run_status_or_cleanup_required');
if(process.env.PANDA_AGENT_DEV_ENV_FILE)process.loadEnvFile(process.env.PANDA_AGENT_DEV_ENV_FILE);
process.loadEnvFile('.env.local');
assert(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),'development_key_required');
assert(process.env.PANDA_AGENT_INSFORGE_BASE_URL==='https://feh4966v.us-east.insforge.app','verified_agent_target_required');
assert(process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE==='insforge-pandabyte-migration','verified_template_required');
const base='http://localhost:3001';
const directory='Panda-agent/infra/lightweight/artifacts';
const stateFile=directory+'/phase3-auth-state.json';
const summaryFile=directory+'/phase3-auth-isolation.json';
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const instance=await clerk.instance.get();
assert(instance.id==='ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI','development_instance_mismatch');
const checks=[];
let state;
const save=()=>writeFile(stateFile,JSON.stringify(state,null,2));
const ensure=(condition,label)=>{assert(condition,label);checks.push(label);};
async function request(actor,path,method='GET',body){
 const token=(await clerk.sessions.getToken(actor.sessionId)).jwt;
 const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${token}`,origin:base,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(45000)});
 const raw=await response.text();assert(Buffer.byteLength(raw)<=4*1024*1024,'bounded_response');
 let data;try{data=JSON.parse(raw);}catch{data=null;}
 return {status:response.status,data,raw};
}
async function verifiedUser(actor){
 const user=await clerk.users.getUser(actor.userId);
 assert(user.privateMetadata?.purpose==='panda-lightweight-phase3'&&user.privateMetadata?.runId===state.runId&&user.emailAddresses.some(x=>x.emailAddress===actor.email),'fixture_ownership_required');
 return user;
}
async function cleanup(){
 for(const actor of state.actors){
  if(actor.cleaned)continue;
  if(!actor.userId){
   const matches=await clerk.users.getUserList({emailAddress:[actor.email]});
   assert(matches.data.length<=1,'ambiguous_fixture_identity');
   if(!matches.data.length)continue;
   actor.userId=matches.data[0].id;await save();
  }
  await verifiedUser(actor);
  const session=await clerk.sessions.createSession({userId:actor.userId});actor.sessionId=session.id;await save();
  for(const id of actor.threads){
   const read=await request(actor,'/api/panda-agent/chats/'+id);
   if(read.status===404)continue;
   assert(read.status===200,'cleanup_read_unavailable');
   if(read.data.thread.status==='pending')await request(actor,'/api/panda-agent/chats/'+id+'/cancel','POST',{});
   const deleted=await request(actor,'/api/panda-agent/chats/'+id,'DELETE');
   assert(deleted.status===200,'fixture_chat_cleanup_unavailable');
   assert((await request(actor,'/api/panda-agent/chats/'+id)).status===404,'fixture_chat_cleanup_not_verified');
  }
  await verifiedUser(actor);
  await clerk.users.deleteUser(actor.userId);
  actor.cleaned=true;await save();
 }
}
try{
 if(process.argv[2]==='--status'){
  state=JSON.parse(await readFile(stateFile,'utf8'));
  const [a,b]=state.actors;await verifiedUser(a);await verifiedUser(b);
  const own='/api/panda-agent/chats/'+a.threads[0];
  const terminal=await request(a,own+'?requestId='+state.acceptedTurn);
  ensure(terminal.status===200&&terminal.data.attemptStatus==='complete'&&terminal.data.messages.length===2,'specific_terminal_attempt_confirmed');
  ensure(Object.keys(terminal.data).sort().join(',')==='attemptStatus,messages,thread','bounded_observational_projection');
  const absent=await request(a,own+'?requestId='+randomUUID());
  ensure(absent.status===200&&absent.data.attemptStatus==='absent','absence_not_misrepresented_as_terminal');
  const foreign=await request(a,'/api/panda-agent/chats/'+b.threads[0]+'?requestId='+state.acceptedTurn);
  ensure(foreign.status===404&&foreign.data?.error==='not_found','queried_foreign_thread_denied');
  for(const [query,label] of [
   ['?requestId='+state.acceptedTurn+'&requestId='+state.acceptedTurn,'duplicate_query_denied'],
   ['?requestId='+state.acceptedTurn+'&extra=true','extra_query_denied'],
   ['?requestId='+state.acceptedTurn.toUpperCase(),'noncanonical_query_denied'],
   ['?requestId=invalid','malformed_query_denied'],
  ])ensure((await request(a,own+query)).status===400,label);
  const proof={passed:checks.length,checks,realClerk:true,realInsforge:true,actualBff:true,selectorExecutionRequested:false,ownerSessionChanged:false};
  await writeFile(directory+'/phase3-auth-observation.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
 }else if(process.argv[2]==='--cleanup'){
  state=JSON.parse(await readFile(stateFile,'utf8'));await cleanup();
  console.log(JSON.stringify({cleanedUsers:state.actors.filter(x=>x.cleaned).length,ownerSessionChanged:false}));
 }else{
  await mkdir(directory,{recursive:true});
  state={runId:randomUUID(),actors:[]};
  await writeFile(stateFile,JSON.stringify(state,null,2),{flag:'wx'});
  for(const label of ['a','b']){
   const actor={label,email:`${state.runId}.${label}+clerk_test@example.com`,threads:[]};state.actors.push(actor);await save();
   const user=await clerk.users.createUser({emailAddress:[actor.email],firstName:'Disposable',lastName:'Phase3 '+label,privateMetadata:{purpose:'panda-lightweight-phase3',runId:state.runId},skipPasswordRequirement:true});
   actor.userId=user.id;await save();
   actor.sessionId=(await clerk.sessions.createSession({userId:user.id})).id;await save();
   const jwt=(await clerk.sessions.getToken(actor.sessionId,process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE)).jwt;
   const client=createClient({baseUrl:process.env.PANDA_AGENT_INSFORGE_BASE_URL,accessToken:jwt,timeout:8000,retryCount:0,debug:false});
   const identity=await client.database.rpc('requesting_user_id');ensure(!identity.error&&identity.data===actor.userId,'genuine_identity_'+label);
   const created=await request(actor,'/api/panda-agent/chats','POST',{title:'Disposable Phase 3 isolation '+label});
   ensure(created.status===201&&created.data?.thread?.id,'owner_chat_created_'+label);actor.threads.push(created.data.thread.id);await save();
  }
  const [a,b]=state.actors;const aid=a.threads[0],bid=b.threads[0];
  const anonymous=await fetch(base+'/api/panda-agent/chats/'+aid,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  const anonymousRaw=await anonymous.text();ensure(anonymous.status===401&&!anonymousRaw.includes('Microcontroller: ESP8266'),'anonymous_read_denied');
  const ownCancel=await request(b,'/api/panda-agent/chats/'+bid+'/cancel','POST',{});
  ensure(ownCancel.status===200&&ownCancel.data.messages.length===0,'own_empty_cancel_route_available');
  for(const [actor,other,label] of [[a,bid,'a_to_b'],[b,aid,'b_to_a']]){
   const read=await request(actor,'/api/panda-agent/chats/'+other);ensure(read.status===404&&read.data?.error==='not_found','foreign_read_'+label);
   const post=await request(actor,'/api/panda-agent/chats/'+other+'/messages','POST',{requestId:randomUUID(),question:'Which MCU does the x8266 listing name?'});ensure(post.status===404,'foreign_write_'+label);
   const cancel=await request(actor,'/api/panda-agent/chats/'+other+'/cancel','POST',{});ensure(cancel.status===404,'foreign_cancel_'+label);
  }
  const turn=randomUUID();state.acceptedTurn=turn;await save();
  const question='Which MCU does the x8266 listing name?';
  const token=(await clerk.sessions.getToken(a.sessionId)).jwt;
  const send=()=>fetch(base+'/api/panda-agent/chats/'+aid+'/messages',{method:'POST',headers:{authorization:`Bearer ${token}`,origin:base,'content-type':'application/json'},body:JSON.stringify({requestId:turn,question}),signal:AbortSignal.timeout(45000)});
  const duplicates=await Promise.all([send(),send()]);const statuses=duplicates.map(r=>r.status);await Promise.all(duplicates.map(r=>r.arrayBuffer()));
  ensure(statuses.includes(200),'duplicate_submit_has_success');
  const read=await request(a,'/api/panda-agent/chats/'+aid);
  ensure(read.status===200&&read.data.messages.length===2&&new Set(read.data.messages.map(m=>m.id)).size===2,'exactly_one_durable_answer');
  const answer=read.data.messages.find(m=>m.role==='assistant');ensure(answer?.citations?.length===1&&answer.citations[0].quote==='Microcontroller: ESP8266','real_grounded_citation');
  const protectedRead=await request(b,'/api/panda-agent/chats/'+aid);
  ensure(protectedRead.status===404&&protectedRead.data?.error==='not_found'&&!protectedRead.raw.includes('Microcontroller: ESP8266'),'foreign_grounded_history_withheld');
  const unchanged=await request(b,'/api/panda-agent/chats/'+bid);
  ensure(unchanged.status===200&&unchanged.data.messages.length===0,'foreign_attempts_created_no_own_messages');
  const oldToken=(await clerk.sessions.getToken(b.sessionId)).jwt;await clerk.sessions.revokeSession(b.sessionId);
  const denied=await fetch(base+'/api/panda-agent/chats/'+bid,{headers:{authorization:`Bearer ${oldToken}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
  const deniedRaw=await denied.text();ensure(denied.status!==200&&!deniedRaw.includes('Microcontroller: ESP8266'),'revoked_session_not_released');
  const proof={passed:checks.length,checks,realClerk:true,realInsforge:true,actualBff:true,isolatedApiSessions:2,isolatedBrowserContexts:0,duplicateHttpStatuses:statuses,ownerSessionChanged:false,sourceRowsChanged:0,fixtureUsersRetainedForBrowserChecks:true};
  await writeFile(summaryFile,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
 }
}catch{
 await writeFile(directory+'/phase3-auth-stopped.json',JSON.stringify({checks,stopped:true,cleanupRequired:true,ownerSessionChanged:false}));
 console.error('Phase 3 authentication check stopped; inspect private fixture state and clean only marked identities.');process.exitCode=1;
}
