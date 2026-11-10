import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightweightHandler } from '../src/server/lightweight-handler.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const thread='11111111-1111-4111-8111-111111111111', request='22222222-2222-4222-8222-222222222222';
const question='A current question', date='2026-11-06T00:00:00Z';
const answer={outcome:'conversation',text:'Current fenced answer',citations:[]};
const input=()=>({requestId:request,question});
const post=(data=input(),options={})=>new Request(`http://localhost/api/panda-agent/chats/${thread}/messages`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...options.headers},body:JSON.stringify(data)});
function fixture(options={}) {
 const calls=[];let active=true, saved=options.saved??false;
 const read=async()=>({thread:{id:thread,title:'Fixture',updatedAt:date,status:saved?'idle':'pending'},messages:saved?[{id:request,role:'assistant',text:answer.text,citations:[],createdAt:date}]:[],turns:options.empty?[]:[{requestId:request,question,status:saved?'complete':'pending',response:saved?answer:null,createdAt:date}],privateField:'PRIVATE_JOURNAL'});
 const native={read:async()=>{calls.push('native_read');return read();},state:async()=>{calls.push('classify');return options.legacy||options.empty?null:{phase:saved?'terminal':'unknown'};},start:async()=>{calls.push('start');if(options.deny)throw new ChatStoreError('unavailable');return {status:'unknown'};},status:async()=>{calls.push('status');if(options.revoke)active=false;if(options.statusError)throw new ChatStoreError('unavailable');if(options.saveOnStatus)saved=true;return {status:saved?'saved':'unknown'};},cancel:async()=>{calls.push('cancel');if(options.cancelUnknown)return {status:'unknown'};saved=true;return {status:'saved'};},cleanup:async()=>{calls.push('cleanup');if(options.cleanupError)throw Error('PRIVATE_NATIVE_ERROR');return {status:options.cleanupUnknown?'unknown':'retired'};},cleanupThread:async()=>{calls.push('cleanup_thread');return !options.cleanupUnknown;}};
 const store={read:async()=>{calls.push('legacy_read');return read();},begin:async()=>{calls.push('legacy_begin');return {...await read(),admitted:false};},execution:async()=>{calls.push('legacy_execution');return {prepared:false,digest:null,sku:null,scopeHash:null,productId:null};},complete:async()=>{calls.push('legacy_complete');saved=true;},cancel:async()=>{calls.push('legacy_cancel');saved=true;},delete:async()=>{calls.push('legacy_delete');throw new ChatStoreError('conflict');}};
 const deps={enabled:()=>true,authenticate:async()=>({subject:'OWNER',sessionId:'SESSION',client:{}}),current:async()=>active,store:()=>store,products:async()=>[],answer:async()=>{calls.push('legacy_answer');return answer;},native:()=>native,nativeNewMessages:()=>options.selectNew??false};
 return {calls,native,store,deps,handler:createLightweightHandler(deps)};
}
function privateResponse(response){assert.equal(response.headers.get('cache-control'),'private, no-store');}

test('history read overlaps the live check but never releases data if revoked',async()=>{
 for(const allowed of [true,false]) {
  const f=fixture({saved:true});let releaseCheck;const gate=new Promise(resolve=>{releaseCheck=resolve;});let reads=0, checks=0;
  f.deps.current=async()=>{checks++;return checks===1?gate:true;};
  const original=f.native.read;f.native.read=async()=>{reads++;return original();};
  const handler=createLightweightHandler(f.deps);
  const pending=handler.readGET(new Request(`http://localhost/api/panda-agent/chats/${thread}`),thread);
  await new Promise(resolve=>setImmediate(resolve));
  try {assert.equal(reads,1,'read must start while the live check is pending');} finally {releaseCheck(allowed);}
  const response=await pending;assert.equal(response.status,allowed?200:401);
  if(!allowed)assert.doesNotMatch(await response.text(),/Current fenced answer/);
 }
});

test('an absent request goes straight to the atomic direct admission',async()=>{
 const f=fixture({empty:true});let starts=0;
 f.deps.llm=()=>({state:async()=>{throw Error('unnecessary direct state lookup');},start:async()=>{starts++;return {status:'unknown'};}});
 f.deps.llmNewMessages=()=>true;
 const response=await createLightweightHandler(f.deps).messagePOST(post(),thread);
 assert.equal(response.status,503);assert.equal(starts,1);
 assert.equal(f.calls.includes('classify'),false);
});

test('new native selection runs before legacy begin; denied or unknown work never falls back',async()=>{
 for(const deny of [false,true]){
  const f=fixture({empty:true,selectNew:true,deny});const response=await f.handler.messagePOST(post(),thread);
  assert.equal(response.status,503);privateResponse(response);assert.deepEqual(await response.json(),{error:'unavailable'});
  assert.equal(f.calls.includes('start'),true);assert.equal(f.calls.some(x=>x.startsWith('legacy_')),false);
 }
});
test('persisted native POST is observation-only even with new selection off',async()=>{
 const f=fixture({saveOnStatus:true});const response=await f.handler.messagePOST(post(),thread);
 assert.equal(response.status,200);assert.equal(f.calls.includes('status'),true);assert.equal(f.calls.includes('cleanup'),true);
 assert.equal(f.calls.includes('start'),false);assert.equal(f.calls.some(x=>x.startsWith('legacy_')),false);
 const wire=await response.text();assert.match(wire,/Current fenced answer/);assert.doesNotMatch(wire,/PRIVATE|turns|requestId|phase|receipt|runtimeBinding/);
});
test('native duplicate with changed question conflicts before observation or mutation',async()=>{
 const f=fixture({saved:true});const response=await f.handler.messagePOST(post({...input(),question:'A different question'}),thread);
 assert.equal(response.status,409);assert.equal(f.calls.includes('status'),false);assert.equal(f.calls.includes('cleanup'),false);
});
test('native pending GET observes without legacy execution, cleanup or replacement prompts',async()=>{
 for(const statusError of [false,true]){
  const f=fixture({statusError});const response=await f.handler.readGET(new Request(`http://localhost/api/panda-agent/chats/${thread}?requestId=${request}`),thread);
  assert.equal(response.status,200);privateResponse(response);const data=await response.json();assert.equal(data.attemptStatus,'pending');
  assert.equal(f.calls.includes('status'),true);assert.equal(f.calls.includes('start'),false);assert.equal(f.calls.includes('cleanup'),false);assert.equal(f.calls.some(x=>x.startsWith('legacy_')),false);
 }
});
test('terminal native history is replayed without consulting runtime and strips private fields',async()=>{
 const f=fixture({saved:true});f.native.status=()=>assert.fail('runtime should not be needed');
 const response=await f.handler.readGET(new Request(`http://localhost/api/panda-agent/chats/${thread}`),thread);
 assert.equal(response.status,200);assert.equal(f.calls.includes('status'),false);assert.doesNotMatch(await response.text(),/PRIVATE|turns/);
});
test('old unprepared pending remains legacy with native selection enabled',async()=>{
 const f=fixture({legacy:true,selectNew:true});const response=await f.handler.readGET(new Request(`http://localhost/api/panda-agent/chats/${thread}`),thread);
 assert.equal(response.status,200);assert.equal(f.calls.includes('legacy_execution'),true);assert.equal(f.calls.includes('status'),false);assert.equal(f.calls.includes('start'),false);
});
test('existing old request is not reclassified as a new native request',async()=>{
 const f=fixture({legacy:true,selectNew:true});const response=await f.handler.messagePOST(post(),thread);
 assert.equal(response.status,200);assert.equal(f.calls.includes('legacy_begin'),true);assert.equal(f.calls.includes('start'),false);assert.equal(f.calls.includes('status'),false);
});
test('native cancellation is durable-native only; uncertain cancellation does not settle legacy state',async()=>{
 for(const cancelUnknown of [false,true]){
  const f=fixture({cancelUnknown,cleanupError:true});const response=await f.handler.cancelPOST(post({requestId:request}),thread);
  assert.equal(response.status,cancelUnknown?503:200);assert.equal(f.calls.includes('cancel'),true);assert.equal(f.calls.includes('cleanup'),!cancelUnknown);assert.equal(f.calls.some(x=>x.startsWith('legacy_')),false);
  assert.doesNotMatch(await response.text(),/PRIVATE|turns|receipt|runtimeBinding/);
 }
});
test('cleanup requires same origin, closed request ID and current owner; uncertainty retains conflict',async()=>{
 for(const [data,headers,status] of [[{requestId:request},{origin:'https://other.test'},403],[{requestId:request,receipt:{}},{},400],[{}, {},400]]){
  const f=fixture();assert.equal((await f.handler.cleanupPOST(post(data,{headers}),thread)).status,status);assert.equal(f.calls.includes('cleanup'),false);
 }
 const f=fixture({cleanupUnknown:true});const response=await f.handler.cleanupPOST(post({requestId:request}),thread);assert.equal(response.status,409);privateResponse(response);
 const ok=fixture();assert.deepEqual(await (await ok.handler.cleanupPOST(post({requestId:request}),thread)).json(),{ok:true});
 const foreign=fixture();foreign.native.read=async()=>{throw new ChatStoreError('not_found');};assert.equal((await foreign.handler.cleanupPOST(post({requestId:request}),thread)).status,404);assert.equal(foreign.calls.includes('cleanup'),false);
});
test('revocation or native classification failure never releases or falls back',async()=>{
 const f=fixture({revoke:true,saveOnStatus:true});const response=await f.handler.messagePOST(post(),thread);assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/Current fenced answer/);
 const unknown=fixture();unknown.native.state=async()=>{throw Error('PRIVATE_DATABASE');};const r=await unknown.handler.readGET(new Request(`http://localhost/api/panda-agent/chats/${thread}`),thread);assert.equal(r.status,503);assert.equal(unknown.calls.some(x=>x.startsWith('legacy_')),false);assert.doesNotMatch(await r.text(),/PRIVATE/);
});

test('normal Delete requires bounded native cleanup and preserves conflict on uncertainty',async()=>{
 for(const cleanupUnknown of [false,true]) {
  const f=fixture({saved:true,cleanupUnknown});f.store.delete=async()=>{f.calls.push('legacy_delete');return {ok:true};};
  const response=await f.handler.deleteDELETE(new Request(`http://localhost/api/panda-agent/chats/${thread}`,{method:'DELETE',headers:{origin:'http://localhost'}}),thread);
  assert.equal(response.status,cleanupUnknown?409:200);assert.equal(f.calls.includes('cleanup_thread'),true);assert.equal(f.calls.includes('legacy_delete'),!cleanupUnknown);
 }
});
