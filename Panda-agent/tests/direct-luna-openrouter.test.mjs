import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { createDirectLunaCompletion, validateDirectLunaResponse } from '../src/server/direct-luna-openrouter.ts';
import { lunaRagModel, lunaRagReportedModel } from '../src/server/luna-rag-openrouter.ts';

const endpoint = () => ({ tag:'azure/us', model_id:lunaRagModel, name:'Azure | '+lunaRagReportedModel, provider_name:'Azure',
 pricing:{prompt:'0.00000011',completion:'0.00000055',input_cache_read:'0.000000011',input_cache_write:'0.0000001375',discount:0}, context_length:12000,
 max_completion_tokens:700,max_prompt_tokens:null,status:0,supports_implicit_caching:false,supports_tool_choice:{none:true},
 supported_parameters:['reasoning','include_reasoning','max_completion_tokens','tool_choice','response_format'] });
const receipt = () => ({ model:lunaRagModel,provider:'Azure',choices:[{finish_reason:'stop',message:{content:'{"answer":"A helpful answer."}'}}],
 usage:{prompt_tokens:100,completion_tokens:12,cost:0.000011,prompt_tokens_details:{cached_tokens:20,cache_write_tokens:80}} });
function fixture(options={}) {
 const calls=[]; let claims=0, fingerprint;
 const fetcher=async(url,init)=>{ calls.push({url,init}); if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:options.retention??false}]});
  if(url.endsWith('/endpoints'))return Response.json({data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[options.endpoint??endpoint()]}});
  return Response.json(options.receipt??receipt()); };
 const complete=createDirectLunaCompletion({apiKey:'fixture',fetcher,policyCurrent:async()=>options.policy??true,dispatchCurrent:()=>true,claim:async hash=>{claims++;fingerprint=hash;assert.match(hash,/^[a-f0-9]{64}$/);return options.claim??true;}});
 return {calls,complete,get claims(){return claims;},get fingerprint(){return fingerprint;}};
}
const run=(f,input={question:'How do sensors work?'},gate=async()=>true)=>f.complete(input,gate,new AbortController().signal);
const posts=f=>f.calls.filter(c=>c.init.method==='POST');

test('one reserved direct request pins privacy, bounded content, no tools or response cache',async()=>{
 const f=fixture(),answer=await run(f); assert.equal(answer.answer,'A helpful answer.');assert.equal(f.claims,1);assert.equal(posts(f).length,1);
 const req=posts(f)[0].init, body=JSON.parse(req.body);assert.equal(req.headers['X-OpenRouter-Cache'],'false');assert.equal(body.tool_choice,'none');assert.equal(body.tools,undefined);assert.deepEqual(body.plugins,[]);assert.equal(body.provider.zdr,true);assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.messages.length,2);assert.ok(Buffer.byteLength(JSON.stringify(body.messages))<=7000);
 assert.equal(f.fingerprint,createHash('sha256').update(req.body).digest('hex'));assert.ok(Buffer.byteLength(req.body)<=7000);
 await assert.rejects(run(f));assert.equal(posts(f).length,1);
});
test('privacy, actor, budget and cache-price failure deny provider dispatch',async()=>{
 const high=endpoint();high.pricing.input_cache_write='0.00000013801';
 const missing=endpoint();delete missing.pricing.input_cache_write;
 for(const options of [{retention:true},{claim:false},{policy:false},{endpoint:high},{endpoint:missing}]){const f=fixture(options);await assert.rejects(run(f));assert.equal(posts(f).length,0);}
 const f=fixture();await assert.rejects(run(f,undefined,async()=>false));assert.equal(f.claims,1);assert.equal(posts(f).length,0);
});
test('changed question has a different signed wire fingerprint and a denied claim makes no POST',async()=>{
 const a=fixture(),b=fixture({claim:false});await run(a);await assert.rejects(run(b,{question:'How do other sensors work?'}));
 assert.notEqual(a.fingerprint,b.fingerprint);assert.equal(posts(b).length,0);
});
test('response validates token, cache, cost and output boundaries',()=>{
 assert.equal(validateDirectLunaResponse(receipt()).answer,'A helpful answer.');
 for(const mutate of [v=>v.usage.prompt_tokens=8025,v=>v.usage.cost=0.001492313,v=>v.usage.prompt_tokens_details.cache_write_tokens=81,v=>v.usage.prompt_tokens_details.audio_tokens=1,v=>v.usage.completion_tokens_details={reasoning_tokens:1},v=>v.choices[0].message.tool_calls=[{}],v=>v.choices[0].message.content='{"answer":"fake [S1]"}']){const v=receipt();mutate(v);assert.throws(()=>validateDirectLunaResponse(v));}
});
test('diagnostics are opt-in and contain only fixed stages and HTTP status',async()=>{
 const previous=process.env.PANDA_AGENT_DIRECT_DIAGNOSTICS, info=console.info, logs=[];
 console.info=(...args)=>logs.push(args);
 try {
  delete process.env.PANDA_AGENT_DIRECT_DIAGNOSTICS; await run(fixture()); assert.equal(logs.length,0);
  process.env.PANDA_AGENT_DIRECT_DIAGNOSTICS='true'; await run(fixture());
  assert.deepEqual(logs,[['[direct-chat]','metadata-start'],['[direct-chat]','metadata-received'],['[direct-chat]','claim-start'],['[direct-chat]','claim-recorded'],['[direct-chat]','claim-and-send-gates-passed'],['[direct-chat]','provider-http',200],['[direct-chat]','provider-json-read'],['[direct-chat]','provider-response-validated']]);
 } finally { console.info=info; if(previous===undefined)delete process.env.PANDA_AGENT_DIRECT_DIAGNOSTICS;else process.env.PANDA_AGENT_DIRECT_DIAGNOSTICS=previous; }
});

test('history fits whole pairs, preserves latest correction and binds exact wire',async()=>{
 const f=fixture();const history=[{question:'old',answer:'🙂'.repeat(1800)}, {question:'The board is C3',answer:'C3'}, {question:'Correction: C6',answer:'C6'}];
 await run(f,{question:'Which board?',history});const req=posts(f)[0].init,body=JSON.parse(req.body);
 assert.ok(Buffer.byteLength(req.body,'utf8')<=7000);assert.deepEqual(body.messages.slice(1),[{role:'user',content:'The board is C3'},{role:'assistant',content:'C3'},{role:'user',content:'Correction: C6'},{role:'assistant',content:'C6'},{role:'user',content:'Which board?'}]);
 assert.match(body.messages[0].content,/same-chat conversation history/);assert.equal(f.fingerprint,createHash('sha256').update(req.body).digest('hex'));
 const g=fixture();await run(g,{question:'Which board?',history:[{question:'The board is C3',answer:'C3'}]});assert.notEqual(f.fingerprint,g.fingerprint);
});
test('malformed or excessive history never reaches the provider',async()=>{
 for(const history of [[{question:'q',answer:'a',extra:true}],Array(7).fill({question:'q',answer:'a'}),[{question:'q',answer:'\ud800'}]]){const f=fixture();await assert.rejects(run(f,{question:'q',history}));assert.equal(posts(f).length,0);assert.equal(f.claims,0);}
});


test('metadata and policy checks overlap, and a denied fresh post-claim gate prevents POST',async()=>{
 let release,policyStarted=false,metadataStarted=0,posts=0,claims=0;
 const gate=new Promise(r=>release=r);
 const fetcher=async(url,init)=>{if(init.method==='POST'){posts++;throw Error('unexpected POST');} metadataStarted++;await gate;return Response.json(url.endsWith('/endpoints/zdr')?{data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:false}]}:{data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[endpoint()]}});};
 let policies=0;const complete=createDirectLunaCompletion({apiKey:'fixture',fetcher,dispatchCurrent:()=>true,policyCurrent:async()=>{policies++;if(policies===1){policyStarted=true;await gate;return true;}return false;},claim:async()=>{claims++;return true;}});
 const result=complete({question:'question'},async()=>true,new AbortController().signal);await new Promise(r=>setImmediate(r));assert.equal(metadataStarted,2);assert.equal(policyStarted,true);release();await assert.rejects(result);assert.equal(claims,1);assert.equal(posts,0);
});
