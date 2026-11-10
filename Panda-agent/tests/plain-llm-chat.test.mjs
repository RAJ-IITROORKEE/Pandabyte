import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {registerHooks} from 'node:module';

let retrievalImports=0, network=0;
globalThis.fetch=async()=>{network++;throw Error('Network is forbidden in direct-chat fixtures');};
const stub=(source)=>'data:text/javascript,'+encodeURIComponent(source);
registerHooks({resolve(specifier,context,nextResolve){
 if(context.parentURL?.endsWith('/plain-llm-chat.ts')){
  if(specifier.includes('/retrieval/')){retrievalImports++;throw Error('Unexpected retrieval import');}
  if(specifier==='./basic-rag-runtime.ts')return{url:stub('export function createLunaPrototypePolicy(){throw Error("Unexpected runtime")}'),shortCircuit:true};
  if(specifier==='./luna-rag-openrouter.ts')return{url:stub('export const lunaChatSystemPrompt="fixture system";export function createLunaChatCompletion(){throw Error("Unexpected transport")}'),shortCircuit:true};
  if(specifier==='./lightweight-connection')return{url:stub('export async function currentLightweightSession(){throw Error("Unexpected session")}'),shortCircuit:true};
 }
 return nextResolve(specifier,context);
}});
const {createPlainLlmStore,createPlainLlmChatService}=await import('../src/server/plain-llm-chat.ts');
const {BasicRagProviderError}=await import('../src/server/basic-rag-openrouter.ts');
const {ChatStoreError}=await import('../src/server/chat-store.ts');
const turn={thread:'10000000-0000-4000-8000-000000000001',request:'20000000-0000-4000-8000-000000000001',question:'What is six times seven?'};
const signal=()=>new AbortController().signal;
function fixture(){
 let row=null,active=true,enabled=true,sends=0,begins=0,claims=0,finishes=0,stateReads=0,afterState=null,afterClaim=null,afterSend=null,providerError=null;
 const view=()=>({thread:{id:turn.thread,title:'Disposable direct chat',updatedAt:'2026-11-10T00:00:00Z',status:row?.status==='pending'?'pending':'idle'},messages:[],turns:row?[{requestId:turn.request,question:row.question,status:row.status,response:row.answer??null,createdAt:'2026-11-10T00:00:00Z'}]:[]});
 const store={
  async state(thread,request){stateReads++;assert.equal(thread,turn.thread);assert.equal(request,turn.request);const snapshot=row?{question:row.question,status:row.status,claimed:row.claimed,cancelled:row.cancelled}:null;if(afterState)await afterState(snapshot);return snapshot;},
  async begin(thread,request,question){begins++;assert.equal(thread,turn.thread);assert.equal(request,turn.request);assert.equal(question,turn.question);const admitted=!row;if(admitted)row={question,status:'pending',claimed:false,cancelled:false,answer:null};return {...view(),admitted};},
  async claim(thread,request){claims++;assert.equal(thread,turn.thread);assert.equal(request,turn.request);if(!row||row.status!=='pending'||row.claimed)return false;row.claimed=true;if(afterClaim)await afterClaim();return true;},
  async finish(thread,request,answer,cancel=false){finishes++;assert.equal(thread,turn.thread);assert.equal(request,turn.request);if(!row||row.status!=='pending')throw new ChatStoreError('conflict');row.status='complete';row.cancelled=cancel;row.answer=cancel?{outcome:'insufficient',text:row.claimed?'Stopped waiting. The provider may still process the request. No late answer will be saved.':'Stopped before a model request was sent.',citations:[]}:answer;return view();},
 };
 const deps={store,current:async()=>active,enabled:async()=>enabled,complete:(request,question,claim)=>async(input,beforeSend,operationSignal)=>{
  assert.equal(request,turn.request);assert.equal(question,turn.question);assert.deepEqual(input,{question:turn.question});
  if(!await claim()||!await beforeSend()||operationSignal.aborted)throw new BasicRagProviderError('not_admitted');
  sends++;if(afterSend)await afterSend();if(providerError)throw new BasicRagProviderError(providerError);
  return{answer:'Six times seven is 42.',usage:{inputTokens:40,outputTokens:12,costNanoUsd:11000}};
 }};
 return {deps,service:()=>createPlainLlmChatService(deps),row:()=>row,counts:()=>({sends,begins,claims,finishes,stateReads}),
  setRow:value=>{row=value;},revoke:()=>{active=false;},deny:()=>{enabled=false;},onState:fn=>{afterState=fn;},onClaim:fn=>{afterClaim=fn;},onSend:fn=>{afterSend=fn;},error:code=>{providerError=code;}};
}

test('direct store signs writes, validates strict replies, and maps safe RPC errors',async()=>{
 const calls=[],key='a'.repeat(64),owner='user_fixture';let reply;
 const actor={subject:owner,client:{database:{rpc:async(name,args)=>{calls.push({name,args});return reply;}}}};
 const store=createPlainLlmStore(actor,key);reply={data:{question:turn.question,status:'pending',claimed:false,cancelled:false},error:null};
 assert.equal((await store.state(turn.thread,turn.request)).question,turn.question);assert.deepEqual(calls[0].args,{p_thread:turn.thread,p_request:turn.request});
 reply={data:{execute:true},error:null};assert.equal(await store.claim(turn.thread,turn.request),true);
 const signed=calls[1].args,payload=JSON.parse(signed.p_payload);assert.equal(payload.action,'claim');assert.equal(payload.subject,owner);assert.deepEqual(payload.input,{thread:turn.thread,request:turn.request});
 assert.equal(signed.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+signed.p_payload).digest('hex'));assert.ok(payload.exp>=Math.floor(Date.now()/1000)&&payload.exp<=Math.floor(Date.now()/1000)+60);
 for(const bad of [{question:turn.question,status:'pending',claimed:false,cancelled:true},{question:'\ud800',status:'pending',claimed:false,cancelled:false},{question:turn.question,status:'pending',claimed:false,cancelled:false,extra:true},{question:turn.question,status:'other',claimed:false,cancelled:false}]){reply={data:bad,error:null};await assert.rejects(store.state(turn.thread,turn.request),e=>e instanceof ChatStoreError&&e.code==='unavailable');}
 reply={data:{execute:true,extra:true},error:null};await assert.rejects(store.claim(turn.thread,turn.request),e=>e instanceof ChatStoreError&&e.code==='unavailable');
 reply={data:null,error:{code:'P0001',details:'conflict',message:'private detail'}};await assert.rejects(store.claim(turn.thread,turn.request),e=>e.code==='conflict'&&!e.message.includes('private'));
 assert.throws(()=>createPlainLlmStore(actor,'bad'),e=>e.code==='unavailable');
});

test('direct chat sends only the user question and saves a conversation without invented citations',async()=>{
 const f=fixture(),progress=[],result=await f.service().start(turn,signal(),stage=>progress.push(stage));assert.deepEqual(result,{status:'saved'});
 assert.deepEqual(f.row().answer,{outcome:'conversation',text:'Six times seven is 42.',citations:[]});assert.equal(f.counts().sends,1);assert.deepEqual(progress,['routing_question','saving_answer']);assert.equal(retrievalImports,0);assert.equal(network,0);
});

test('replay and pending status never redispatch; changed question conflicts',async()=>{
 const f=fixture();f.setRow({question:turn.question,status:'pending',claimed:true,cancelled:false,answer:null});const service=f.service();
 assert.equal(await service.state(turn.thread,turn.request),true);assert.deepEqual(await service.status(turn,signal()),{status:'unknown'});assert.deepEqual(await service.start(turn,signal()),{status:'unknown'});
 await assert.rejects(service.start({...turn,question:'Different question'},signal()),e=>e.code==='conflict');assert.equal(f.counts().sends,0);assert.equal(f.counts().claims,0);
});

test('unknown provider outcome stays pending and recovery never prompts again',async()=>{
 const f=fixture();f.error('outcome_unknown');const service=f.service();assert.deepEqual(await service.start(turn,signal()),{status:'unknown'});assert.equal(f.row().status,'pending');assert.equal(f.row().claimed,true);
 assert.deepEqual(await f.service().status(turn,signal()),{status:'unknown'});assert.deepEqual(await f.service().start(turn,signal()),{status:'unknown'});assert.equal(f.counts().sends,1);assert.equal(f.counts().finishes,0);
});

test('logical cancellation fences a late answer and cannot cause another send',async()=>{
 const f=fixture();let entered,release;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});f.onSend(async()=>{entered();await gate;});
 const service=f.service(),pending=service.start(turn,signal());await started;assert.deepEqual(await service.cancel(turn,signal()),{status:'saved'});release();await pending;
 assert.equal(f.row().cancelled,true);assert.match(f.row().answer.text,/provider may still process/);assert.deepEqual(f.row().answer.citations,[]);assert.equal(f.counts().sends,1);assert.equal(f.counts().finishes,1);
 assert.deepEqual(await service.status(turn,signal()),{status:'saved'});assert.deepEqual(await service.start(turn,signal()),{status:'saved'});assert.equal(f.counts().sends,1);
});

test('actor revocation before dispatch or after provider output never publishes an answer',async()=>{
 const pre=fixture();pre.onClaim(()=>pre.revoke());await assert.rejects(pre.service().start(turn,signal()),e=>e.code==='unauthenticated');assert.equal(pre.counts().sends,0);assert.equal(pre.counts().finishes,0);
 const post=fixture();post.onSend(()=>post.revoke());const result=await post.service().start(turn,signal());assert.deepEqual(result,{status:'unknown'});assert.equal(post.counts().sends,1);assert.equal(post.counts().finishes,0);
});

test('actor revoked while final pre-dispatch state is loading cannot transmit a prompt',async()=>{
 const f=fixture();f.onState(snapshot=>{if(snapshot?.claimed)f.revoke();});
 await assert.rejects(f.service().start(turn,signal()),e=>e.code==='unauthenticated');assert.equal(f.counts().sends,0);assert.equal(f.counts().finishes,0);
});

test('invalid input, disabled policy and an aborted request never dispatch',async()=>{
 for(const question of ['', ' leading ', 'x'.repeat(2001), '\ud800']){const f=fixture();await assert.rejects(f.service().start({...turn,question},signal()),e=>e.code==='invalid');assert.equal(f.counts().sends,0);}
 const f=fixture();f.deny();await assert.rejects(f.service().start(turn,signal()),e=>e.code==='unavailable');assert.equal(f.counts().begins,0);
 const g=fixture(),controller=new AbortController();controller.abort();await assert.rejects(g.service().start(turn,controller.signal),e=>e.code==='unavailable');assert.equal(g.counts().sends,0);
});

test('native journal operations sign the exact immutable admission and reject malformed responses',async()=>{
 const calls=[], key='a'.repeat(64), owner='user_fixture'; let reply={data:{execute:true},error:null};
 const actor={subject:owner,client:{database:{rpc:async(name,args)=>{calls.push({name,args});return reply;}}}};
 const store=createPlainLlmStore(actor,key), admission={receipt:{sessionID:'ses_fixture'},messageID:'msg_fixture',promptHash:'b'.repeat(64),generation:'c'.repeat(64)};
 assert.equal(await store.nativeClaim(turn.thread,turn.request,admission,'create'),true);
 let envelope=JSON.parse(calls[0].args.p_payload); assert.equal(envelope.action,'native_claim'); assert.equal(envelope.subject,owner);
 assert.deepEqual(envelope.input,{thread:turn.thread,request:turn.request,admission,stage:'create'});
 assert.equal(calls[0].args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+calls[0].args.p_payload).digest('hex'));
 reply={data:{execute:false},error:null}; assert.equal(await store.nativeClaim(turn.thread,turn.request,admission,'prompt'),false);
 assert.equal(JSON.parse(calls[1].args.p_payload).input.stage,'prompt');
 reply={data:{current:true},error:null}; assert.equal(await store.admissionCurrent(turn.thread,turn.request,admission),true);
 envelope=JSON.parse(calls[2].args.p_payload); assert.equal(envelope.action,'admission_current'); assert.deepEqual(envelope.input.admission,admission);
 reply={data:{current:true,extra:true},error:null}; await assert.rejects(store.admissionCurrent(turn.thread,turn.request,admission),e=>e.code==='unavailable');
 await assert.rejects(store.nativeClaim(turn.thread,turn.request,admission,'other'),e=>e.code==='invalid');
});

test('usage receipt signs exact admission, provider body hash and usage and rejects malformed replies',async()=>{
 const calls=[],key='a'.repeat(64);let reply={data:{recorded:true},error:null};
 const actor={subject:'user_fixture',client:{database:{rpc:async(name,args)=>{calls.push({name,args});return reply;}}}};
 const store=createPlainLlmStore(actor,key),admission={generation:'c'.repeat(64)},bodyHash='b'.repeat(64),usage={inputTokens:50,outputTokens:10,costNanoUsd:1000};
 assert.equal(await store.recordReceipt(turn.thread,turn.request,admission,bodyHash,usage),true);
 const payload=JSON.parse(calls[0].args.p_payload); assert.equal(payload.action,'record_receipt');
 assert.deepEqual(payload.input,{thread:turn.thread,request:turn.request,admission,bodyHash,usage});
 assert.equal(calls[0].args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+calls[0].args.p_payload).digest('hex'));
 reply={data:{recorded:false},error:null};assert.equal(await store.recordReceipt(turn.thread,turn.request,admission,bodyHash,usage),false);
 reply={data:{recorded:true,extra:true},error:null};await assert.rejects(store.recordReceipt(turn.thread,turn.request,admission,bodyHash,usage),e=>e.code==='unavailable');
});

test('context retirement signs exact owner admission and validates the response',async()=>{
 const calls=[],key='a'.repeat(64);let reply={data:{retired:true},error:null};
 const actor={subject:'user_fixture',client:{database:{rpc:async(name,args)=>{calls.push({name,args});return reply;}}}};
 const store=createPlainLlmStore(actor,key),admission={generation:'c'.repeat(64)};
 assert.equal(await store.retire(turn.thread,turn.request,admission),true);
 const payload=JSON.parse(calls[0].args.p_payload);assert.equal(payload.action,'retire');assert.equal(payload.subject,actor.subject);
 assert.deepEqual(payload.input,{thread:turn.thread,request:turn.request,admission});
 assert.equal(calls[0].args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+calls[0].args.p_payload).digest('hex'));
 reply={data:{retired:false},error:null};assert.equal(await store.retire(turn.thread,turn.request,admission),false);
 reply={data:{retired:true,extra:true},error:null};await assert.rejects(store.retire(turn.thread,turn.request,admission),e=>e.code==='unavailable');
});
