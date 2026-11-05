import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightweightHandler } from '../src/server/lightweight-handler.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';
import { readFile } from 'node:fs/promises';
import { createLightweightAnswer } from '../src/server/lightweight-answer.ts';

const threadId='11111111-1111-4111-8111-111111111111', requestId='22222222-2222-4222-8222-222222222222';
const question='What MCU does x8266 use?', answer={outcome:'insufficient',text:'No verified answer.',citations:[]};
const thread={id:threadId,title:'Test',updatedAt:'2026-01-01T00:00:00Z',status:'idle'};
test('active chat routes and coordinator have no native or legacy selector imports',async()=>{
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
 const store={read:async()=>({thread,messages:saved?[{id:requestId,role:'assistant',text:'No verified answer.',createdAt:thread.updatedAt,citations:[]}]:[],turns:saved?[]:[pending]}),execution:async()=>({prepared:true,digest:hash,...scope}),scope:async()=>scope,prepare:async()=>{calls.push('prepare');return true;},complete:async()=>{calls.push('save');saved=true;}};
 const client={select:async()=>{calls.push('select');},status:async()=>{calls.push('status');return {version:1,state:'complete',selections:[],usage:{modelCalls:1,inputTokens:1,outputTokens:1,costNanoUsd:0}};}};
 const coordinator=createLightweightAnswer({current:async()=>true,clientForActor:()=>client,resolveIdentity:async()=>({kind:'resolved',product:{id:threadId,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:hash,productSku:'x8266'});const wire=await i.client.select({subject:'user',sessionId:'session',prepared:{requestBodySha256:hash,input:{fragments:[{handle:'h',text:'text'}]}}});return {wire,outcome:{kind:'insufficient'}};}});
 const h=createLightweightHandler({enabled:()=>true,authenticate:async()=>({subject:'user',sessionId:'session',client:{}}),current:async()=>true,store:()=>store,products:async()=>[{sku:'x8266',title:'x8266'}],answer:coordinator});
 for(let n=0;n<2;n++){const response=await h.readGET(new Request('http://localhost/api/chats/'+threadId),threadId);assert.equal(response.status,200);assert.equal((await response.json()).messages.length,1);}
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
