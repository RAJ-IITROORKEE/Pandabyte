// Opt-in disposable development identity check. Never print tokens, IDs, hashes or fixture state.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,chmod,rename} from 'node:fs/promises';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@insforge/sdk';
import sharp from 'sharp';

const mode=process.argv[2];
assert(process.argv.length===3&&['--prepare','--status','--verify'].includes(mode),'explicit_mode_required');
if(process.env.PANDA_AGENT_DEV_ENV_FILE)process.loadEnvFile(process.env.PANDA_AGENT_DEV_ENV_FILE);
process.loadEnvFile('.env.local');
assert(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),'development_key_required');
assert(process.env.PANDA_AGENT_INSFORGE_BASE_URL==='https://feh4966v.us-east.insforge.app','verified_target_required');
assert(process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE==='insforge-pandabyte-migration','verified_template_required');
const dir='Panda-agent/infra/lightweight/artifacts',statePath=dir+'/phase5-auth-state.json',filePath=dir+'/phase5-synthetic-error.png',base='http://localhost:3001';
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const hash=b=>createHash('sha256').update(b).digest('hex');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
let state;
async function save(){const temp=statePath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});await chmod(temp,0o600);await rename(temp,statePath);}
async function fetchBounded(path,token,options={}){
 const response=await fetch(base+path,{...options,headers:{authorization:`Bearer ${token}`,origin:base,...options.headers},redirect:'manual',signal:AbortSignal.timeout(45000)});
 const reader=response.body?.getReader();let total=0;const parts=[];
 if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;assert(total<=2*1024*1024,'response_limit');parts.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
 return {status:response.status,headers:response.headers,bytes:Buffer.concat(parts)};
}
function parsed(r){try{return JSON.parse(r.bytes.toString('utf8'));}catch{return null;}}
async function freshActor(){
 assert((await clerk.instance.get()).id==='ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI','development_instance_mismatch');
 assert(uuid(state?.runId)&&Array.isArray(state.actors)&&state.actors.length===2,'fixture_state_invalid');
 const actor=state.actors.find(x=>x.label==='a');assert(actor?.userId&&actor.email===`${state.runId}.a+clerk_test@example.com`&&!actor.cleaned,'fixture_actor_invalid');
 const user=await clerk.users.getUser(actor.userId);
 assert(user.privateMetadata?.purpose==='panda-lightweight-phase5'&&user.privateMetadata?.runId===state.runId&&user.emailAddresses.some(e=>e.emailAddress===actor.email),'fixture_identity_mismatch');
 actor.sessionId=(await clerk.sessions.createSession({userId:actor.userId})).id;await save();
 const jwt=(await clerk.sessions.getToken(actor.sessionId,process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE)).jwt;
 const client=createClient({baseUrl:process.env.PANDA_AGENT_INSFORGE_BASE_URL,accessToken:jwt,timeout:8000,retryCount:0,debug:false});
 const identity=await client.database.rpc('requesting_user_id');assert(!identity.error&&identity.data===actor.userId,'user_scope_mismatch');
 return (await clerk.sessions.getToken(actor.sessionId)).jwt;
}
async function history(token,thread){
 const r=await fetchBounded(`/api/panda-agent/chats/${thread}`,token);const d=parsed(r);
 assert(r.status===200&&d?.thread?.id===thread&&Array.isArray(d?.messages),'owned_history_unavailable');
 return hash(Buffer.from(JSON.stringify({messages:d.messages,...(d.projectMemory===undefined?{}:{projectMemory:d.projectMemory})}),'utf8'));
}
function form(bytes,assetId){const data=new FormData();data.set('file',new Blob([bytes],{type:'image/png'}),'synthetic-compiler-error.png');data.set('assetId',assetId);data.set('consent','private-diagnostic-v1');return data;}
async function ready(token,record,response){
 const d=parsed(response);assert([200,201].includes(response.status)&&d?.image?.id===record.assetId&&d.image.state==='ready'&&d.visionAvailable===false,'upload_not_ready');
 const expiry=Date.parse(d.image.expiresAt),started=Date.parse(record.startedAt);assert(Number.isFinite(expiry)&&Number.isFinite(started)&&expiry>Date.now()&&expiry>=started+870000&&expiry<=started+930000,'normal_lease_required');
 const read=await fetchBounded(`/api/panda-agent/chats/${record.threadId}/screenshots/${record.assetId}`,token);
 assert(read.status===200&&read.headers.get('content-type')==='image/png'&&/no-store/.test(read.headers.get('cache-control')??''),'normalized_read_failed');
 const metadata=await sharp(read.bytes).metadata();assert(metadata.format==='png'&&!metadata.exif&&!metadata.xmp&&!metadata.icc,'normalization_invalid');
 record.expiresAt=d.image.expiresAt;record.normalizedSha256=hash(read.bytes);record.status='ready';await save();
}
async function prepare(token){
 assert(!state.imageRestart,'existing_restart_fixture_needs_status_or_cleanup');
 const threadId=state.testThreads?.a;assert(uuid(threadId),'fixture_thread_required');
 const historySha256=await history(token,threadId),bytes=await readFile(filePath);assert(bytes.length>0&&bytes.length<=2097152,'synthetic_fixture_invalid');
 const assetId=randomUUID();state.imageRestart={threadId,assetId,inputSha256:hash(bytes),historySha256,status:'pending',startedAt:new Date().toISOString()};await save();
 const record=state.imageRestart;
 // This is the sole upload attempt. Any ambiguous outcome leaves the persisted pending marker.
 const response=await fetchBounded(`/api/panda-agent/chats/${threadId}/screenshots`,token,{method:'POST',body:form(bytes,assetId)});
 await ready(token,record,response);
 return {actualBff:true,realClerk:true,realInsforge:true,syntheticImage:true,normal900SecondLease:true,normalizedRead:true,uploadAttempts:1,modelCalls:0,ownerSessionChanged:false};
}
async function status(token){
 const record=state.imageRestart;assert(record?.status==='pending'&&uuid(record.threadId)&&uuid(record.assetId),'pending_fixture_required');
 const r=await fetchBounded(`/api/panda-agent/chats/${record.threadId}/screenshots/${record.assetId}?status=1`,token);
 if(r.status===200&&parsed(r)?.image?.state==='ready'){await ready(token,record,r);return {status:'ready',uploadAttempts:0};}
 return {status:[202,404,409,410,503].includes(r.status)?'unresolved':'unexpected',httpStatus:r.status,uploadAttempts:0};
}
async function verify(token){
 const record=state.imageRestart;assert(record?.status==='ready'&&uuid(record.threadId)&&uuid(record.assetId)&&/^[0-9a-f]{64}$/.test(record.normalizedSha256??'')&&/^[0-9a-f]{64}$/.test(record.inputSha256??''),'ready_fixture_required');
 assert(Date.parse(record.expiresAt)>Date.now(),'lease_expired_restart_not_proved');
 const bytes=await readFile(filePath);assert(hash(bytes)===record.inputSha256,'source_fixture_changed');
 const p=`/api/panda-agent/chats/${record.threadId}/screenshots/${record.assetId}`;
 assert((await fetchBounded(p,token)).status===410,'restart_read_not_expired');
 assert((await fetchBounded(p+'?status=1',token)).status===410,'restart_status_not_expired');
 const same=await fetchBounded(`/api/panda-agent/chats/${record.threadId}/screenshots`,token,{method:'POST',body:form(bytes,record.assetId)});
 assert(same.status===410,'restart_identity_resurrected');
 assert(await history(token,record.threadId)===record.historySha256,'chat_history_changed');
 record.status='verified';await save();
 return {actualBff:true,realClerk:true,realInsforge:true,syntheticImage:true,preExpiryRestartInvalidation:true,readAndStatusGone:true,sameIdentityNoResurrection:true,ownedHistoryUnchanged:true,modelCalls:0,ownerSessionChanged:false};
}
try{
 state=JSON.parse(await readFile(statePath,'utf8'));
 const token=await freshActor();const result=mode==='--prepare'?await prepare(token):mode==='--status'?await status(token):await verify(token);
 const name=mode.slice(2);const receipt={ok:true,mode:name,...result};await writeFile(`${dir}/phase5-image-restart-${name}.json`,JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify(receipt));
}catch{console.error('Phase 5 image restart check stopped; inspect ignored fixture state before any further action.');process.exitCode=1;}
