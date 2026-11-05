import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightweightHandler} from '../src/server/lightweight-handler.ts';
import {ChatStoreError,parseChatRead} from '../src/server/chat-store.ts';
import {GuideDisabledError} from '../src/server/guide-store.ts';

const threadId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const thread={id:threadId,title:'Guide',status:'pending',updatedAt:'2026-01-01T00:00:00Z'};
const input={goal:'Parking monitor',board:'BOARD',components:['sensor'],expectedVersion:0};
const result={outcome:'insufficient',text:'Conceptual guide.',citations:[]};
const memory={version:1,guideTurns:1,compactions:0,intent:{goal:input.goal,board:input.board,components:input.components},questions:['revision'],recentGoals:[input.goal]};
const execution={input,skill:{id:'embedded-project-guide',version:1,hash:'a'.repeat(64)},epoch:1,prepared:true,digest:'b'.repeat(64),productId:threadId,productSku:'BOARD',scopeHash:'c'.repeat(64)};
const req=(body,options={})=>new Request(`http://localhost/api/chats/${threadId}/messages`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(options.sse?{accept:'text/event-stream'}:{}),...options.headers},body:JSON.stringify(body)});
function fixture(){
 let saved=null,turn=null,current=true,enabled=true,shouldFailRead=false;const calls={guideBegin:0,guideAnswer:0,guideComplete:0,guideCancel:0,qa:0,cancel:0,reconciles:[],success:[]};
 const store={
  begin:async()=>{calls.qa++;throw Error('wrong kind');},
  execution:async()=>({prepared:true,digest:execution.digest,sku:'BOARD',scopeHash:execution.scopeHash,productId:threadId}),
  read:async()=>{if(shouldFailRead)throw new ChatStoreError('not_found');return {thread:{...thread,status:saved?'idle':'pending'},messages:saved?[{id:requestId,role:'assistant',text:saved.text,citations:saved.citations,createdAt:thread.updatedAt}]:[],turns:turn?[turn]:[],projectMemory:memory,privateControl:'never'};},
  cancel:async()=>{},
  guide:{
   begin:async(_t,id,guide)=>{calls.guideBegin++;assert.deepEqual(guide,input);turn??={requestId:id,question:'Project guide: '+guide.goal,status:'pending',response:null,createdAt:thread.updatedAt};return {thread,messages:[],turns:[turn],admitted:!saved};},
   execution:async()=>turn?execution:null,
   complete:async(_t,_r,answer,success)=>{assert.equal(saved,null);calls.guideComplete++;calls.success.push(success);saved=answer;turn={...turn,status:'complete',response:answer};},
  },
 };
 const deps={enabled:()=>true,guideEnabled:()=>enabled,authenticate:async()=>({subject:'u',sessionId:'s',client:{}}),current:async()=>current,store:()=>store,products:async()=>{calls.qa++;return[];},answer:async()=>{calls.qa++;return result;},cancel:async()=>{calls.cancel++;throw Error('wrong kind');},guideAnswer:async(_a,_t,_r,_e,_s,_request,_progress,reconcile)=>{calls.guideAnswer++;calls.reconciles.push(reconcile);return {...result,guideSucceeded:true};},guideCancel:async()=>{calls.guideCancel++;return {version:1,state:'rejected',code:'cancelled',usage:null};}};
 return {deps,store,calls,setCurrent:v=>current=v,setEnabled:v=>enabled=v,denyRead:()=>shouldFailRead=true,setPending:()=>{turn={requestId,question:'Project guide: '+input.goal,status:'pending',response:null,createdAt:thread.updatedAt};}};
}
test('guide exact body and disabled flag reject before begin',async()=>{
 for(const body of [{requestId,guide:input,question:'extra'},{requestId,guide:{...input,other:true}},{requestId,guide:{...input,expectedVersion:-1}},{requestId,guide:null}]){const f=fixture();const r=await createLightweightHandler(f.deps).messagePOST(req(body),threadId);assert.equal(r.status,400);assert.equal(f.calls.guideBegin,0);}
 const f=fixture();f.setEnabled(false);assert.equal((await createLightweightHandler(f.deps).messagePOST(req({requestId,guide:input}),threadId)).status,503);assert.equal(f.calls.guideBegin,0);
});
test('stable guide request saves once and returns bounded public memory without metadata',async()=>{
 const f=fixture(),h=createLightweightHandler(f.deps);const first=await h.messagePOST(req({requestId,guide:input},{sse:true}),threadId),wire=await first.text();
 assert.match(wire,/"type":"complete"/);assert.doesNotMatch(wire,/digest|scopeHash|privateControl|embedded-project-guide|requestId/);assert.deepEqual(JSON.parse(wire.split('\n').find(s=>s.includes('"type":"complete"')).slice(6)).data.projectMemory,memory);
 const second=await h.messagePOST(req({requestId,guide:input}),threadId);assert.equal(second.status,200);assert.equal(f.calls.guideComplete,1);assert.deepEqual(f.calls.success,[true]);assert.equal(f.calls.guideAnswer,1);assert.equal(f.calls.qa,0);
});
test('public project memory parsing rejects internal and unbounded metadata',()=>{
 const value={thread:{...thread,status:'idle'},messages:[],turns:[],projectMemory:memory};
 assert.deepEqual(parseChatRead(value).projectMemory,memory);
 assert.throws(()=>parseChatRead({...value,projectMemory:{...memory,skillHash:'a'.repeat(64)}}));
 assert.throws(()=>parseChatRead({...value,projectMemory:{...memory,recentGoals:Array(8).fill('x')}}));
});
test('GET pending guide reconciles status-only and never invokes normal evidence selector',async()=>{
 const f=fixture();f.setPending();const response=await createLightweightHandler(f.deps).readGET(new Request(`http://localhost/api/chats/${threadId}?requestId=${requestId}`),threadId);
 assert.equal(response.status,200);assert.equal((await response.json()).attemptStatus,'complete');assert.deepEqual(f.calls.reconciles,[true]);assert.equal(f.calls.guideComplete,1);assert.equal(f.calls.qa,0);
});
test('unresolved guide status does not complete or dispatch the QA path',async()=>{
 const f=fixture();f.setPending();f.deps.guideAnswer=async(_a,_t,_r,_e,_s,_request,_progress,reconcile)=>{f.calls.guideAnswer++;f.calls.reconciles.push(reconcile);throw new ChatStoreError('unavailable');};
 const response=await createLightweightHandler(f.deps).readGET(new Request(`http://localhost/api/chats/${threadId}?requestId=${requestId}`),threadId);
 assert.equal(response.status,200);assert.equal((await response.json()).attemptStatus,'pending');assert.deepEqual(f.calls.reconciles,[true]);assert.equal(f.calls.guideComplete,0);assert.equal(f.calls.qa,0);
});
test('cross-kind request ID collision is denied without execution',async()=>{
 const f=fixture();f.store.guide.begin=async()=>{throw new ChatStoreError('conflict');};
 const response=await createLightweightHandler(f.deps).messagePOST(req({requestId,guide:input}),threadId);assert.equal(response.status,409);assert.equal(f.calls.guideAnswer,0);assert.equal(f.calls.qa,0);
});
test('terminal refusal does not count as a successful guide for project memory',async()=>{
 const f=fixture();f.deps.guideAnswer=async()=>({...result,guideSucceeded:false});
 const response=await createLightweightHandler(f.deps).messagePOST(req({requestId,guide:input}),threadId);
 assert.equal(response.status,200);assert.deepEqual(f.calls.success,[false]);
});
test('prepared guide cancellation uses only guide control and retains unresolved state on unknown',async()=>{
 const f=fixture();f.setPending();f.deps.guideCancel=async()=>{f.calls.guideCancel++;return {version:1,state:'unknown',code:'outcome_unknown',usage:null};};
 const response=await createLightweightHandler(f.deps).cancelPOST(req({requestId}),threadId);assert.equal(response.status,503);assert.equal(f.calls.guideCancel,1);assert.equal(f.calls.cancel,0);assert.equal(f.calls.guideComplete,0);
});
test('missing guide cancellation dependency never falls back to evidence cancel',async()=>{
 const f=fixture();f.setPending();delete f.deps.guideCancel;const response=await createLightweightHandler(f.deps).cancelPOST(req({requestId}),threadId);
 assert.equal(response.status,503);assert.equal(f.calls.cancel,0);
});
test('auth ownership and current session guard before commit and after safe projection',async()=>{
 const unauth=fixture();unauth.deps.authenticate=async()=>null;assert.equal((await createLightweightHandler(unauth.deps).messagePOST(req({requestId,guide:input}),threadId)).status,401);
 const foreign=fixture();foreign.denyRead();assert.equal((await createLightweightHandler(foreign.deps).readGET(new Request(`http://localhost/api/chats/${threadId}`),threadId)).status,404);
 const before=fixture();before.deps.guideAnswer=async()=>{before.setCurrent(false);return result;};assert.equal((await createLightweightHandler(before.deps).messagePOST(req({requestId,guide:input}),threadId)).status,401);assert.equal(before.calls.guideComplete,0);
 const after=fixture(),read=after.store.read;after.store.read=async()=>{const value=await read();after.setCurrent(false);return value;};assert.equal((await createLightweightHandler(after.deps).messagePOST(req({requestId,guide:input}),threadId)).status,401);
});
test('deadline during final session check cannot save or release a late result',async()=>{
 const f=fixture();let release,entered,checks=0;
 const held=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 f.deps.guideDeadlineMs=10;
 f.deps.current=async()=>{if(++checks===1)return true;entered();await held;return true;};
 f.deps.guideAnswer=async()=>({outcome:'insufficient',text:'private fixture quote',citations:[],guideSucceeded:true});
 const responsePromise=createLightweightHandler(f.deps).messagePOST(req({requestId,guide:input}),threadId);
 await ready;const response=await responsePromise;assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private fixture quote|"type":"complete"/);
 release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.guideComplete,0);assert.deepEqual(f.calls.success,[]);assert.deepEqual((await f.store.read()).projectMemory,memory);
});
test('known disabled skill denies admission with explicit conflict',async()=>{
 const f=fixture();f.store.guide.begin=async()=>{throw new GuideDisabledError();};
 const response=await createLightweightHandler(f.deps).messagePOST(req({requestId,guide:input}),threadId);
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'guide_disabled'});assert.equal(f.calls.guideAnswer,0);assert.equal(f.calls.guideComplete,0);
});
