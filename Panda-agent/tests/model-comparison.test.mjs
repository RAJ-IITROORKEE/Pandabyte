import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createModelComparisonHandlers,prepareProductComparisonContext} from '../src/control-room/model-comparison.ts';
import {createPlaygroundHandler} from '../src/control-room/playground-handler.ts';

const models=['openai/gpt-4o-mini','fixture/second'];
const operations=models.map((model,i)=>({model,requestId:`11111111-1111-4111-8111-11111111111${i}`}));
const passage={rank:1,title:'Fixture product',sourceUrl:'https://www.pandabyte.in/product-page/fixture',capturedAt:'2026-10-30T03:04:37.128891+00:00',sectionPath:['Specification'],text:'Microcontroller: ESP8266'};
const hash=p=>createHash('sha256').update(JSON.stringify(p.map(({rank,text})=>({rank,text})))).digest('hex');
const request=(value={question:'Which microcontroller?',operations},headers={})=>new Request('http://localhost:3000/api/admin/panda-agent/model-comparisons',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',...headers},body:typeof value==='string'?value:JSON.stringify(value)});
function fixture(){
 let access=true,current=true,mode='ok',calls=[],prepareCalls=0;
 const actor={kind:'admin',subject:'owner',adapters:{}};
 const deps={authorize:async()=>access?actor:{kind:'forbidden'},configuredModels:async()=>models,prepare:async()=>{prepareCalls++;return {passages:[passage],digest:hash([passage]),provenanceDigest:'d'.repeat(64),revalidate:async()=>current};},evaluate:async(input,beforeSend)=>{assert.equal(await beforeSend(),true);calls.push(input);if(mode==='unknown')throw Error('lost response');if(mode==='quota')throw Object.assign(Error('quota'),{code:'quota'});if(mode==='withdraw')current=false;if(mode==='revoke')access=false;if(mode==='invalid')return {answer:'invented',evidence:[{rank:1,quote:'not in source',reason:'unsupported'}]};return {answer:'ESP8266',evidence:[{rank:1,quote:'Microcontroller: ESP8266',reason:'Literal MCU specification'}]};}};
 return {deps,handlers:createModelComparisonHandlers(deps),calls,prepareCalls:()=>prepareCalls,mode:v=>mode=v,withdraw:()=>current=false};
}

test('comparison evaluates sequentially against one immutable context and exposes only measured elapsed',async()=>{
 const f=fixture(),r=await f.handlers.POST(request()),v=await r.json();assert.equal(r.status,200);assert.equal(f.prepareCalls(),1);assert.equal(f.calls.length,2);assert.equal(f.calls[0].context,f.calls[1].context);assert.equal(v.context.digest,hash([passage]));assert.deepEqual(v.results.map(x=>x.status),['evaluated','evaluated']);assert.ok(v.results.every(x=>x.metrics.inputTokens===null&&x.metrics.outputTokens===null&&x.metrics.costUsd===null&&x.metrics.elapsedMs>=0));assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('all requested models are admitted by trusted configuration before any preparation or model call',async()=>{
 const f=fixture();f.deps.configuredModels=async()=>[models[0]];const r=await f.handlers.POST(request());assert.equal(r.status,503);assert.equal((await r.json()).error.code,'unconfigured');assert.equal(f.prepareCalls(),0);assert.equal(f.calls.length,0);
});
test('duplicate UUIDs/models, uppercase UUIDs, arbitrary scope and oversized streams are rejected',async()=>{
 const f=fixture();for(const value of[{question:'Q',operations:[operations[0],operations[0]]},{question:'Q',operations:[{...operations[0],requestId:'AAAAAAAA-1111-4111-8111-111111111111'}]},{question:'Q',operations,productSku:'untrusted'}])assert.equal((await f.handlers.POST(request(value))).status,400);
 assert.equal((await f.handlers.POST(request('x'.repeat(9000)))).status,413);assert.equal(f.calls.length,0);
});
test('wrong-origin and denied callers never prepare or call a model',async()=>{
 const f=fixture();assert.equal((await f.handlers.POST(request(undefined,{origin:'https://wrong.example'}))).status,403);f.deps.authorize=async()=>({kind:'unauthorized'});assert.equal((await f.handlers.POST(request())).status,401);assert.equal(f.calls.length,0);
});
test('unknown outcome or quota stops further dispatch and marks remaining operations skipped',async()=>{
 for(const mode of['unknown','quota','invalid']){const f=fixture();f.mode(mode);const r=await f.handlers.POST(request()),v=await r.json();assert.equal(r.status,200);assert.deepEqual(v.results.map(x=>x.status),[mode==='quota'?'quota':'outcome_unknown','skipped']);assert.equal(f.calls.length,1);assert.equal(v.results[0].answer,undefined);}
});
test('withdrawal or revoked Admin after model dispatch withholds all protected results',async()=>{
 for(const mode of['withdraw','revoke']){const f=fixture();f.mode(mode);const r=await f.handlers.POST(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:{code:'unavailable'}});assert.equal(f.calls.length,1);}
});
test('scope rejection before dispatch or thrown revalidation never invokes a model',async()=>{
 const f=fixture();f.withdraw();assert.equal((await f.handlers.POST(request())).status,503);assert.equal(f.calls.length,0);
 const g=fixture();g.deps.prepare=async()=>({passages:[passage],digest:hash([passage]),provenanceDigest:'d'.repeat(64),revalidate:async()=>{throw Error('source unavailable');}});assert.equal((await g.handlers.POST(request())).status,503);assert.equal(g.calls.length,0);
});
test('capability requests recheck Admin and expose no raw configuration',async()=>{
 const f=fixture(),r=await f.handlers.GET();assert.equal(r.status,200);assert.deepEqual(await r.json(),{execution:'configured_unverified',models,maxModels:4});assert.equal(r.headers.get('cache-control'),'private, no-store');
});

test('matching canonical product and provenance admit nested playground calls on the same context',async()=>{
 const text=passage.text,handle=`panda:00000000-0000-0000-0000-000000000001:${'a'.repeat(64)}:${'b'.repeat(64)}`;
 const product={id:'p1',sku:'SKU'},chunk={handle,productId:product.id,text,textHash:createHash('sha256').update(text).digest('hex'),header:'header',physicalRevision:null,blocked:false,title:passage.title,sourceUrl:passage.sourceUrl,capturedAt:passage.capturedAt,sectionPath:passage.sectionPath};
 const scope={fingerprint:'fixture-proof',candidate:true,sealed:true,engineeringVerified:true,manifestVerified:true,configVerified:true,generationCurrent:true,chunks:[chunk]};
 const adapters={resolveIdentity:async()=>({kind:'resolved',product}),currentScope:async()=>scope,lexical:async()=>[handle],dense:async()=>{throw Error('unused');},select:async()=>{throw Error('unused');}};
 const actor={kind:'admin',subject:'owner',adapters};let evaluations=0;
 const handlers=createModelComparisonHandlers({authorize:async()=>actor,configuredModels:async()=>models,prepare:prepareProductComparisonContext,evaluate:async(input,beforeSend,signal)=>{
  assert.equal(await beforeSend(),true);
  const nested=createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:actor.subject},adapters}),async()=>{evaluations++;return {answer:'ESP8266',evidence:[{rank:1,quote:'ESP8266',reason:'Processor'}]};},input.context.digest,undefined,input.context.provenanceDigest);
  const req=new Request('http://localhost:3000/api/admin/panda-agent/playground',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({question:input.question,evaluate:true,requestId:input.requestId}),signal});
  const response=await nested(req);assert.equal(response.status,200);const result=await response.json();return {answer:result.model.answer,evidence:result.model.evidence};
 }});
 const response=await handlers.POST(request()),result=await response.json();
 assert.equal(response.status,200);assert.equal(evaluations,2);assert.deepEqual(result.results.map(row=>row.status),['evaluated','evaluated']);assert.equal(result.context.passages[0].sourceUrl,passage.sourceUrl);assert.ok(!JSON.stringify(result).includes('provenanceDigest'));assert.ok(!JSON.stringify(result).includes(handle));
});

test('verified usage envelopes populate guard-accounted metrics; invalid usage stays unavailable',async()=>{
 const f=fixture();let count=0;
 f.deps.evaluate=async(_input,beforeSend)=>{assert.equal(await beforeSend(),true);count++;return {evaluation:{answer:'ESP8266',evidence:[{rank:1,quote:'ESP8266',reason:'Processor'}]},usage:count===1?{inputTokens:100,outputTokens:20,costNanoUsd:27000}:{inputTokens:100,outputTokens:20,costNanoUsd:1}};};
 const response=await f.handlers.POST(request()),result=await response.json();assert.equal(response.status,200);
 assert.deepEqual([result.results[0].metrics.inputTokens,result.results[0].metrics.outputTokens,result.results[0].metrics.costUsd],[100,20,0.000027]);
 assert.deepEqual([result.results[1].metrics.inputTokens,result.results[1].metrics.outputTokens,result.results[1].metrics.costUsd],[null,null,null]);
});
