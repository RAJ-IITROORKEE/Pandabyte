import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createDirectAssistantStore} from '../src/server/direct-assistant-store.ts';
import {createDirectAssistantChat} from '../src/server/direct-assistant-chat.ts';
const turn={thread:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',request:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',question:'Explain sensors'};
const refs={budgetId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',keySha256:'a'.repeat(64),workspaceSha256:'b'.repeat(64)};
const signal=()=>new AbortController().signal;

test('store signs the direct RPC contract and validates response shapes',async()=>{
 const key='a'.repeat(64),calls=[];let reply={data:{execute:true},error:null};
 const actor={subject:'fixture',client:{database:{rpc:async(name,args)=>{calls.push({name,args});return reply;}}}};
 const store=createDirectAssistantStore(actor,key);assert.equal(await store.claim(turn.thread,turn.request,refs,'c'.repeat(64)),true);
 const call=calls[0],payload=JSON.parse(call.args.p_payload);assert.equal(call.name,'panda_agent_direct_chat_v2');assert.equal(payload.action,'direct_chat');
 assert.deepEqual(payload.input,{op:'claim',thread:turn.thread,request:turn.request,budget:refs.budgetId,keySha256:refs.keySha256,workspaceSha256:refs.workspaceSha256,bodyHash:'c'.repeat(64)});
 assert.equal(call.args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+call.args.p_payload).digest('hex'));
 reply={data:{recorded:true},error:null};const answer={outcome:'conversation',text:'Answer',citations:[]},usage={inputTokens:3,outputTokens:2,costNanoUsd:1};
 assert.equal(await store.receipt(turn.thread,turn.request,'c'.repeat(64),answer,usage),true);assert.deepEqual(JSON.parse(calls[1].args.p_payload).input,{op:'receipt',thread:turn.thread,request:turn.request,bodyHash:'c'.repeat(64),answer,usage});
 reply={data:{execute:true,extra:true},error:null};await assert.rejects(store.claim(turn.thread,turn.request,refs,'c'.repeat(64)));
});

test('uncapped store operations sign only the turn and receipt, without budget references',async()=>{
 const key='a'.repeat(64),calls=[];let reply={data:{execute:true},error:null};
 const actor={subject:'fixture',client:{database:{rpc:async(name,args)=>{calls.push({name,args});return reply;}}}};
 const store=createDirectAssistantStore(actor,key);
 assert.equal(await store.claimUnmetered(turn.thread,turn.request,'d'.repeat(64)),true);
 const claim=JSON.parse(calls[0].args.p_payload);
 assert.deepEqual(claim.input,{op:'claim_unmetered',thread:turn.thread,request:turn.request,bodyHash:'d'.repeat(64)});
 assert.equal(calls[0].args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+calls[0].args.p_payload).digest('hex'));
 const answer={outcome:'conversation',text:'Answer',citations:[]},usage={inputTokens:3,outputTokens:2,costNanoUsd:1};
 reply={data:{recorded:true},error:null};
 assert.equal(await store.receiptUnmetered(turn.thread,turn.request,'d'.repeat(64),answer,usage),true);
 assert.deepEqual(JSON.parse(calls[1].args.p_payload).input,{op:'receipt_unmetered',thread:turn.thread,request:turn.request,bodyHash:'d'.repeat(64),answer,usage});
 reply={data:{execute:true,extra:true},error:null};await assert.rejects(store.claimUnmetered(turn.thread,turn.request,'d'.repeat(64)));
});

test('uncapped claims propagate rejected actor or MAC proofs without an execute result',async()=>{
 const key='a'.repeat(64);let attempts=0;
 const database={rpc:async(_name,args)=>{
  attempts++;const value=JSON.parse(args.p_payload);
  const expected=createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+args.p_payload).digest('hex');
  return value.subject==='fixture'&&args.p_mac===expected?{data:{execute:true},error:null}:{data:null,error:{code:'P0001',details:'unauthenticated'}};
 }};
 for(const [subject,secret] of [['foreign',key],['fixture','b'.repeat(64)]]){
  const store=createDirectAssistantStore({subject,client:{database}},secret);
  await assert.rejects(store.claimUnmetered(turn.thread,turn.request,'d'.repeat(64)),{code:'unauthenticated'});
 }
 assert.equal(attempts,2);
});

function uncappedFixture(){
 const records=new Map();let sends=0,receipts=0,finishes=0,active=true,beforeClaim=async()=>{};
 const ref=(_thread,request)=>records.get(request);
 const store={
  async state(thread,request){const r=ref(thread,request);return r&&{question:r.question,status:r.status,claimed:r.claimed,cancelled:r.cancelled};},
  async begin(_thread,request,question){if(records.has(request))return {admitted:false};records.set(request,{question,status:'pending',claimed:false,cancelled:false});return {admitted:true};},
  async claim(){throw Error('Capped claim reached');},async receipt(){throw Error('Capped receipt reached');},
  async claimUnmetered(thread,request,hash){assert.equal(hash,'d'.repeat(64));const r=ref(thread,request);if(r.status!=='pending'||r.claimed||r.cancelled)return false;r.claimed=true;return true;},
  async receiptUnmetered(thread,request,_hash,answer,usage){const r=ref(thread,request);if(r.status!=='pending'||r.cancelled)return false;assert.ok(r.claimed);r.answer=answer;r.usage=usage;receipts++;return true;},
  async finish(thread,request){const r=ref(thread,request);assert.ok(r.answer&&r.usage);r.status='complete';finishes++;return{};},
  async cancel(thread,request){const r=ref(thread,request);r.status='complete';r.cancelled=true;return{};},
 };
 const policy={enabled:async()=>true,current:async()=>active,dispatchCurrent:()=>active,key:()=> 'fixture',binding:()=> 'fixture',isUnmetered:()=>active};
 const completion=options=>async(_input,beforeSend)=>{await beforeClaim();if(!await options.claim('d'.repeat(64))||!await beforeSend())throw Error('Not admitted');sends++;return{answer:'Answer',usage:{inputTokens:3,outputTokens:2,costNanoUsd:100}};};
 const create=()=>createDirectAssistantChat({actor:{subject:'fixture'},key:'a'.repeat(64),current:async()=>active,policy,
  budgetRefs:()=>{throw Error('Uncapped chat consulted budget');},store,completion});
 return {create,records,counts:()=>({sends,receipts,finishes}),beforeClaim:fn=>beforeClaim=fn,revoke:()=>active=false};
}

test('uncapped owner can make repeated new requests and reload saved states without consulting the exhausted budget',async()=>{
 const f=uncappedFixture(),service=f.create();
 for(let n=0;n<4;n++){
  const request='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb'+n;
  assert.deepEqual(await service.start({...turn,request},signal()),{status:'saved'});
  assert.deepEqual(await f.create().status({thread:turn.thread,request},signal()),{status:'saved'});
  assert.deepEqual(await f.create().start({...turn,request},signal()),{status:'saved'});
 }
 assert.deepEqual(f.counts(),{sends:4,receipts:4,finishes:4});
});

test('concurrent duplicate uncapped requests have one admitted dispatch',async()=>{
 const f=uncappedFixture(),service=f.create();
 const results=await Promise.all(Array.from({length:12},()=>service.start(turn,signal())));
 assert.ok(results.some(r=>r.status==='saved'));assert.deepEqual(f.counts(),{sends:1,receipts:1,finishes:1});
 assert.deepEqual(await f.create().start(turn,signal()),{status:'saved'});assert.equal(f.counts().sends,1);
});

test('uncapped cancellation before the claim never posts a model request',async()=>{
 const f=uncappedFixture(),service=f.create();
 f.beforeClaim(async()=>{await service.cancel(turn,signal());});
 assert.deepEqual(await service.start(turn,signal()),{status:'unknown'});assert.deepEqual(f.counts(),{sends:0,receipts:0,finishes:0});
 const controller=new AbortController();controller.abort();const g=uncappedFixture();
 await assert.rejects(g.create().start(turn,controller.signal));assert.equal(g.records.size,0);assert.equal(g.counts().sends,0);
});

function fixture(){let state=null,sends=0,receipts=0,finishes=0,current=true,afterSend=async()=>{},allow=true,receiptAllowed=true;
 const store={async state(){return state&&{...state};},async begin(_t,_r,question){state={question,status:'pending',claimed:false,cancelled:false,contextHash:'e'.repeat(64)};return{admitted:true,turns:[{requestId:turn.request,question,status:'pending',response:null}],contextRequestIds:[],contextHash:'e'.repeat(64)};},
  async claim(_t,_r,r,hash){assert.deepEqual(r,refs);assert.equal(hash,'d'.repeat(64));if(state.claimed)return false;state.claimed=true;return true;},
  async receipt(_t,_r,hash,answer,usage){assert.equal(hash,'d'.repeat(64));assert.equal(answer.outcome,'conversation');assert.equal(usage.costNanoUsd,100);receipts++;return receiptAllowed&&!state.cancelled;},
  async finish(){finishes++;state.status='complete';return{};},async cancel(){state.status='complete';state.cancelled=true;return{};}};
 const policy={enabled:async()=>allow,current:async()=>current,dispatchCurrent:()=>current,key:()=> 'fixture',binding:()=> 'fixture'};
 const completion=options=>async(_input,beforeSend)=>{if(!await options.claim('d'.repeat(64))||!await beforeSend())throw Error();sends++;await afterSend();return{answer:'Answer',usage:{inputTokens:3,outputTokens:2,costNanoUsd:100}};};
 const service=createDirectAssistantChat({actor:{subject:'fixture'},key:'a'.repeat(64),current:async()=>current,policy,budgetRefs:()=>refs,store,completion});
 return{service,counts:()=>({sends,receipts,finishes}),setAfterSend:fn=>afterSend=fn,changeContext:()=>state.contextHash='f'.repeat(64),revoke:()=>current=false,deny:()=>allow=false,denyReceipt:()=>receiptAllowed=false};}

test('direct request reserves once, records receipt before finish, and never replays',async()=>{
 const f=fixture();assert.deepEqual(await f.service.start(turn,signal()),{status:'saved'});assert.deepEqual(f.counts(),{sends:1,receipts:1,finishes:1});
 assert.deepEqual(await f.service.start(turn,signal()),{status:'saved'});assert.equal(f.counts().sends,1);
});
test('cancellation and session loss fence late provider output',async()=>{
 const f=fixture();let release,entered;const waiting=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});f.setAfterSend(async()=>{entered();await gate;});
 const pending=f.service.start(turn,signal());await waiting;assert.deepEqual(await f.service.cancel(turn,signal()),{status:'saved'});release();assert.deepEqual(await pending,{status:'unknown'});assert.deepEqual(f.counts(),{sends:1,receipts:0,finishes:0});
 const g=fixture();g.setAfterSend(()=>g.revoke());assert.deepEqual(await g.service.start(turn,signal()),{status:'unknown'});assert.deepEqual(g.counts(),{sends:1,receipts:0,finishes:0});
});
test('uncertain post-dispatch outcomes stay pending and are not retried',async()=>{
 const f=fixture();f.setAfterSend(()=>{throw Error('lost');});assert.deepEqual(await f.service.start(turn,signal()),{status:'unknown'});
 assert.deepEqual(await f.service.start(turn,signal()),{status:'unknown'});assert.deepEqual(f.counts(),{sends:1,receipts:0,finishes:0});
});
test('an unrecorded receipt cannot publish or cause a second provider request',async()=>{
 const f=fixture();f.denyReceipt();assert.deepEqual(await f.service.start(turn,signal()),{status:'unknown'});
 assert.deepEqual(await f.service.start(turn,signal()),{status:'unknown'});assert.deepEqual(f.counts(),{sends:1,receipts:1,finishes:0});
});

test('a changed context after provider completion fences receipt and publication',async()=>{
 const f=fixture();f.setAfterSend(()=>f.changeContext());assert.deepEqual(await f.service.start(turn,signal()),{status:'unknown'});assert.deepEqual(f.counts(),{sends:1,receipts:0,finishes:0});
});
