import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightweightHandler } from '../src/server/lightweight-handler.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';
import { readFile } from 'node:fs/promises';
import { createLightweightAnswer } from '../src/server/lightweight-answer.ts';

const threadId='11111111-1111-4111-8111-111111111111', requestId='22222222-2222-4222-8222-222222222222';
const question='What MCU does x8266 use?', answer={outcome:'insufficient',text:'No verified answer.',citations:[]};
const thread={id:threadId,title:'Test',updatedAt:'2026-01-01T00:00:00Z',status:'idle'};
test('chat routes retain their coordinator and do not import legacy selectors directly',async()=>{
 const routes=['../../app/api/panda-agent/chats/route.ts','../../app/api/panda-agent/chats/[id]/route.ts','../../app/api/panda-agent/chats/[id]/messages/route.ts'];
 for(const file of routes)assert.match(await readFile(new URL(file,import.meta.url),'utf8'),/lightweight-chat/);
 for(const file of ['../src/server/lightweight-chat.ts','../src/server/lightweight-answer.ts','../src/lightweight/evidence.ts','../src/lightweight/client.ts']) {
  const source=await readFile(new URL(file,import.meta.url),'utf8');assert.doesNotMatch(source,/from\s+['"][^'"]*(?:opencode|local-runtime|local-hybrid|native-events|clerk-chat)['"]/i);
 }
});
const req=(body, options={})=>new Request(`http://localhost/api/chats/${threadId}/messages`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(options.sse?{accept:'text/event-stream'}:{}),...options.headers},body:typeof body==='string'?body:JSON.stringify(body)});
function fixture() {
 let saved=null, current=true, withdrawal=false, answers=0, completes=0, reads=0;
 const store={
  begin:async (_t,id,q)=>({thread,messages:[],turns:[{requestId:id,question:q,status:saved?'complete':'pending',response:saved,createdAt:thread.updatedAt}],admitted:!saved}),
  complete:async (_t,_r,a)=>{completes++; saved=a;},
  read:async()=>{reads++;if(withdrawal)throw new ChatStoreError('unavailable');return {thread,messages:saved?[{id:requestId,role:'assistant',text:saved.text,citations:saved.citations,createdAt:thread.updatedAt}]:[],turns:[],privateField:'secret'};},
 };
 const deps={enabled:()=>true,authenticate:async()=>({subject:'user',sessionId:'session',client:{}}),current:async()=>current,store:()=>store,products:async()=>[{sku:'x8266',title:'x8266'}],answer:async()=>{answers++;return answer;}};
 return {deps,store,counts:()=>({answers,completes,reads}),setCurrent:v=>current=v,withdraw:()=>withdrawal=true};
}
test('auth, flag, origin, input bounds and unexpected fields fail before store',async()=>{
 for(const [change,body,code] of [
  [d=>d.authenticate=async()=>null,{requestId,question},401],
  [d=>d.enabled=()=>false,{requestId,question},503],
  [()=>{}, {requestId,question:'😀'.repeat(1001)},400],
  [()=>{}, {requestId,question,productSku:'spoof'},400],
 ]) { const f=fixture();change(f.deps);f.deps.store=()=>assert.fail('store accessed');const res=await createLightweightHandler(f.deps).messagePOST(req(body),threadId);assert.equal(res.status,code); }
 const f=fixture();f.deps.store=()=>assert.fail('store accessed');assert.equal((await createLightweightHandler(f.deps).messagePOST(req({requestId,question},{headers:{origin:'https://evil.test'}}),threadId)).status,403);
});
test('one saved answer is replayed on repeated ID and SSE omits turns and private data',async()=>{
 const f=fixture(),h=createLightweightHandler(f.deps);
 const first=await h.messagePOST(req({requestId,question},{sse:true}),threadId), wire=await first.text();
 assert.match(wire,/"type":"complete"/); assert.doesNotMatch(wire,/"turns"|privateField|secret|requestId/);
 const second=await h.messagePOST(req({requestId,question}),threadId);assert.equal(second.status,200);
 assert.deepEqual(f.counts(),{answers:1,completes:1,reads:2});
});
test('source withdrawal on final read releases no answer',async()=>{
 const f=fixture();f.deps.answer=async()=>{f.withdraw();return answer;};
 const response=await createLightweightHandler(f.deps).messagePOST(req({requestId,question},{sse:true}),threadId);const wire=await response.text();
 assert.match(wire,/"type":"error"/);assert.doesNotMatch(wire,/"type":"complete"|No verified answer/);assert.equal(f.counts().completes,1);
});
test('session revoked before commit or release prevents answer release',async()=>{
 const before=fixture();before.deps.answer=async()=>{before.setCurrent(false);return answer;};
 const r=await createLightweightHandler(before.deps).messagePOST(req({requestId,question}),threadId);assert.equal(r.status,401);assert.equal(before.counts().completes,0);
 const after=fixture();const complete=after.store.complete;after.store.complete=async(...args)=>{await complete(...args);after.setCurrent(false);};
 const r2=await createLightweightHandler(after.deps).messagePOST(req({requestId,question},{sse:true}),threadId);const wire=await r2.text();assert.match(wire,/"type":"error"/);assert.doesNotMatch(wire,/"type":"complete"|No verified answer/);
});
test('session revoked during final read prevents release',async()=>{
 const f=fixture(), read=f.store.read;
 f.store.read=async()=>{const data=await read();f.setCurrent(false);return data;};
 const r=await createLightweightHandler(f.deps).messagePOST(req({requestId,question},{sse:true}),threadId), wire=await r.text();
 assert.match(wire,/"type":"error"/);assert.doesNotMatch(wire,/"type":"complete"|No verified answer/);
});
test('GET reconciles prepared pending work using status only, saves once and reloads',async()=>{
 const calls=[], hash='ab'.repeat(32), scope={productId:threadId,sku:'x8266',scopeHash:'cd'.repeat(32)};let saved=false;
 const pending={requestId,question,status:'pending',response:null,createdAt:thread.updatedAt};
 const store={read:async()=>({thread,messages:saved?[{id:requestId,role:'assistant',text:'No verified answer.',createdAt:thread.updatedAt,citations:[]}]:[],turns:saved?[{...pending,status:'complete',response:answer}]:[pending]}),execution:async()=>({prepared:true,digest:hash,...scope}),scope:async()=>scope,prepare:async()=>{calls.push('prepare');return true;},complete:async()=>{calls.push('save');saved=true;}};
 const client={select:async()=>{calls.push('select');},status:async()=>{calls.push('status');return {version:1,state:'complete',selections:[],usage:{modelCalls:1,inputTokens:1,outputTokens:1,costNanoUsd:0}};}};
 const coordinator=createLightweightAnswer({current:async()=>true,clientForActor:()=>client,resolveIdentity:async()=>({kind:'resolved',product:{id:threadId,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:hash,productSku:'x8266'});const wire=await i.client.select({subject:'user',sessionId:'session',prepared:{requestBodySha256:hash,input:{fragments:[{handle:'h',text:'text'}]}}});return {wire,outcome:{kind:'insufficient'}};}});
 const h=createLightweightHandler({enabled:()=>true,authenticate:async()=>({subject:'user',sessionId:'session',client:{}}),current:async()=>true,store:()=>store,products:async()=>[{sku:'x8266',title:'x8266'}],answer:coordinator});
 for(let n=0;n<2;n++){const response=await h.readGET(new Request(`http://localhost/api/chats/${threadId}?requestId=${requestId}`),threadId);assert.equal(response.status,200);const result=await response.json();assert.equal(result.messages.length,1);assert.equal(result.attemptStatus,'complete');}
 assert.deepEqual(calls,['status','save']);
});
test('GET does not reconcile unprepared or inaccessible pending work',async()=>{
 for(const mode of ['unprepared','other-owner','revoked']){
  const f=fixture();let executions=0,answers=0;
  f.store.read=async()=>{if(mode==='other-owner')throw new ChatStoreError('not_found');return {thread,messages:[],turns:[{requestId,question,status:'pending',response:null,createdAt:thread.updatedAt}]};};
  f.store.execution=async()=>{executions++;return {prepared:false,digest:null,sku:null,scopeHash:null,productId:null};};
  f.deps.answer=async()=>{answers++;throw Error('unexpected');};
  if(mode==='revoked')f.setCurrent(false);
  const response=await createLightweightHandler(f.deps).readGET(new Request('http://localhost/api/chats/'+threadId),threadId);
  assert.equal(response.status,mode==='unprepared'?200:mode==='other-owner'?404:401);assert.equal(answers,0);assert.equal(executions,mode==='unprepared'?1:0);
 }
});
test('GET finalizes cached terminal rejections but leaves ambiguous states pending',async()=>{
 for(const code of ['quota_exhausted','provider_unavailable','invalid_selection','budget_exceeded','busy','disabled','not_found','outcome_unknown','pending']){
  const hash='ab'.repeat(32),scope={productId:threadId,sku:'x8266',scopeHash:'cd'.repeat(32)},calls=[];let saved=false;
  const pending={requestId,question,status:'pending',response:null,createdAt:thread.updatedAt};
  const store={read:async()=>({thread,messages:saved?[{id:requestId,role:'assistant',text:'Unavailable.',createdAt:thread.updatedAt,citations:[]}]:[],turns:saved?[]:[pending]}),execution:async()=>({prepared:true,digest:hash,...scope}),scope:async()=>scope,prepare:async()=>{calls.push('prepare');},complete:async()=>{calls.push('save');saved=true;}};
  const wire={version:1,state:code==='pending'?'pending':code==='outcome_unknown'?'unknown':'rejected',code,usage:null};
  const client={select:async()=>{calls.push('select');},status:async()=>{calls.push('status');return wire;}};
  const coordinator=createLightweightAnswer({current:async()=>true,clientForActor:()=>client,resolveIdentity:async()=>({kind:'resolved',product:{id:threadId,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:hash,productSku:'x8266'});const result=await i.client.select({subject:'user',sessionId:'session',prepared:{requestBodySha256:hash,input:{fragments:[{handle:'h',text:'text'}]}}});return {wire:result,outcome:{kind:'unavailable'}};}});
  const h=createLightweightHandler({enabled:()=>true,authenticate:async()=>({subject:'user',sessionId:'session',client:{}}),current:async()=>true,store:()=>store,products:async()=>[{sku:'x8266',title:'x8266'}],answer:coordinator});
  const response=await h.readGET(new Request('http://localhost/api/chats/'+threadId),threadId);assert.equal(response.status,200);
  const terminal=!['not_found','outcome_unknown','pending'].includes(code);
  assert.deepEqual(calls,terminal?['status','save']:['status'],code);assert.equal((await response.json()).messages.length,terminal?1:0,code);
 }
});
test('explicit cancel handles unprepared and prepared pending without exposing control data',async()=>{
 for(const prepared of [false,true]){
  const f=fixture(),calls=[];let canceled=false;
  f.store.read=async()=>({thread,messages:[],turns:canceled?[]:[{requestId,question,status:'pending',response:null,createdAt:thread.updatedAt}]});
  f.store.execution=async()=>prepared?{prepared:true,digest:'a'.repeat(64),sku:'x8266',scopeHash:'b'.repeat(64),productId:threadId}:{prepared:false,digest:null,sku:null,scopeHash:null,productId:null};
  f.store.cancel=async(_t,_r,digest)=>{calls.push(['db',digest]);canceled=true;};
  f.deps.cancel=async(_actor,_turn,e)=>{calls.push(['worker',e.digest]);return {version:1,state:'rejected',code:'cancelled',usage:null};};
  const h=createLightweightHandler(f.deps), r=await h.cancelPOST(req({}),threadId);assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/requestId|digest|cancelled|scopeHash/);
  assert.deepEqual(calls,prepared?[['worker','a'.repeat(64)],['db','a'.repeat(64)]]:[['db',null]]);
 }
});
test('cancel refuses unknown, bad origin, foreign owner and malformed input without terminalizing',async()=>{
 for(const kind of ['unknown','origin','owner','input']){
  const f=fixture();let writes=0,worker=0;
  f.store.read=async()=>{if(kind==='owner')throw new ChatStoreError('not_found');return {thread,messages:[],turns:[{requestId,question,status:'pending',response:null,createdAt:thread.updatedAt}]};};
  f.store.execution=async()=>({prepared:true,digest:'a'.repeat(64),sku:'x8266',scopeHash:'b'.repeat(64),productId:threadId});
  f.store.cancel=async()=>{writes++;};f.deps.cancel=async()=>{worker++;return {version:1,state:'unknown',code:'outcome_unknown',usage:null};};
  const r=await createLightweightHandler(f.deps).cancelPOST(req(kind==='input'?{extra:true}:{},kind==='origin'?{headers:{origin:'https://evil.test'}}:{}),threadId);
  assert.equal(r.status,({unknown:503,origin:403,owner:404,input:400})[kind]);assert.equal(writes,0);assert.equal(worker,kind==='unknown'?1:0);
 }
});
test('cancel retries observation after unprepared CAS loses to prepare',async()=>{
 const f=fixture();let reads=0,worker=0,db=[];
 f.store.read=async()=>({thread,messages:[],turns:[{requestId,question,status:'pending',response:null,createdAt:thread.updatedAt}]});
 f.store.execution=async()=>++reads===1?{prepared:false,digest:null,sku:null,scopeHash:null,productId:null}:{prepared:true,digest:'a'.repeat(64),sku:'x8266',scopeHash:'b'.repeat(64),productId:threadId};
 f.store.cancel=async(_t,_r,d)=>{db.push(d);if(d===null)throw new ChatStoreError('conflict');};
 f.deps.cancel=async()=>{worker++;return {version:1,state:'rejected',code:'cancelled',usage:null};};
 assert.equal((await createLightweightHandler(f.deps).cancelPOST(req({}),threadId)).status,200);assert.deepEqual(db,[null,'a'.repeat(64)]);assert.equal(worker,1);
});
test('canceling SSE reader aborts coordinator signal',async()=>{
 const f=fixture();let entered, aborted;const ready=new Promise(r=>entered=r), observed=new Promise(r=>aborted=r);
 f.deps.answer=async(_a,_i,request)=>{entered();await new Promise(resolve=>request.signal.addEventListener('abort',()=>{aborted(request.signal.aborted);resolve();},{once:true}));return answer;};
 const response=await createLightweightHandler(f.deps).messagePOST(req({requestId,question},{sse:true}),threadId),reader=response.body.getReader();await ready;await reader.cancel();assert.equal(await observed,true);assert.equal(f.counts().completes,0);
});
test('attempt cancellation before delayed begin fences that attempt and permits another',async()=>{
 const f=fixture(), markers=new Set(), next='33333333-3333-4333-8333-333333333333';let releaseBegin,entered;
 const barrier=new Promise(r=>releaseBegin=r), ready=new Promise(r=>entered=r);
 f.store.read=async()=>({thread,messages:[],turns:[]});f.store.cancel=async(_t,id,d)=>{assert.equal(d,null);markers.add(id);};
 f.store.begin=async(_t,id,q)=>{entered();await barrier;if(markers.has(id))throw new ChatStoreError('conflict');return {thread,messages:[],turns:[{requestId:id,question:q,status:'pending',response:null,createdAt:thread.updatedAt}],admitted:true};};
 const h=createLightweightHandler(f.deps), post=h.messagePOST(req({requestId,question}),threadId);await ready;
 const response=await h.cancelPOST(req({requestId}),threadId);assert.equal(response.status,200);releaseBegin();assert.equal((await post).status,409);
 assert.equal((await h.messagePOST(req({requestId:next,question}),threadId)).status,200);
});
test('explicit attempt cancel rejects malformed IDs, extras and different pending attempt',async()=>{
 for(const body of [{requestId:'BAD'},{requestId,extra:true},{requestId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}]){
  const f=fixture();f.deps.store=()=>assert.fail('bad input must not query');assert.equal((await createLightweightHandler(f.deps).cancelPOST(req(body),threadId)).status,400);
 }
 const f=fixture();f.store.read=async()=>({thread,messages:[],turns:[{requestId,question,status:'pending',response:null,createdAt:thread.updatedAt}]});f.store.cancel=async()=>assert.fail('wrong attempt');
 assert.equal((await createLightweightHandler(f.deps).cancelPOST(req({requestId:'33333333-3333-4333-8333-333333333333'}),threadId)).status,409);
});
test('attempt status query exposes only owner-scoped terminal state, never identifiers',async()=>{
 for(const state of ['pending','complete','absent']){
  const f=fixture(), turns=state==='absent'?[]:[{requestId,question,status:state,response:state==='complete'?answer:null,createdAt:thread.updatedAt}];
  f.store.read=async()=>({thread,messages:[],turns});f.store.execution=async()=>({prepared:false,digest:null,sku:null,scopeHash:null,productId:null});
  const r=await createLightweightHandler(f.deps).readGET(new Request(`http://localhost/api/chats/${threadId}?requestId=${requestId}`),threadId);
  assert.equal(r.status,200);const raw=await r.text(),data=JSON.parse(raw);assert.equal(data.attemptStatus,state);assert.doesNotMatch(raw,/requestId|scopeHash|digest/);
 }
});
test('attempt status query rejects malformed or extra parameters before store',async()=>{
 for(const query of [`?requestId=${requestId}&requestId=${requestId}`,`?requestId=${requestId}&x=1`,'?requestId=BAD','?requestId=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',`?requestId=%32${requestId.slice(1)}`,'?other=1']){
  const f=fixture();f.deps.store=()=>assert.fail('invalid query');assert.equal((await createLightweightHandler(f.deps).readGET(new Request(`http://localhost/api/chats/${threadId}${query}`),threadId)).status,400,query);
 }
});
test('attempt status query honors session and foreign ownership',async()=>{
 for(const kind of ['session','owner']) {const f=fixture();if(kind==='session')f.setCurrent(false);else f.store.read=async()=>{throw new ChatStoreError('not_found');};const r=await createLightweightHandler(f.deps).readGET(new Request(`http://localhost/api/chats/${threadId}?requestId=${requestId}`),threadId);assert.equal(r.status,kind==='session'?401:404);}
});
