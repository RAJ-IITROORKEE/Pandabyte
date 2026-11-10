import test from 'node:test';
import assert from 'node:assert/strict';
import { createLunaChatCompletion, validateLunaChatResponse, lunaChatSystemPrompt, lunaRagModel, lunaRagReportedModel } from '../src/server/luna-rag-openrouter.ts';

const endpoint = () => ({ tag:'azure/us', model_id:lunaRagModel, name:'Azure | '+lunaRagReportedModel, provider_name:'Azure',
 pricing:{prompt:'0.00000011',completion:'0.00000055',discount:0}, context_length:12000, max_completion_tokens:700,
 max_prompt_tokens:null,status:0,supports_implicit_caching:false,supports_tool_choice:{none:true},
 supported_parameters:['reasoning','include_reasoning','max_completion_tokens','tool_choice','response_format'] });
const receipt = () => ({model:lunaRagModel,provider:'Azure',choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'Six times seven is 42.'})}}],usage:{prompt_tokens:40,completion_tokens:12,cost:0.000011}});
function fixture(options={}){
 const calls=[];let claims=0;
 const fetcher=async(url,init)=>{calls.push({url,init});
  if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:options.retention??false}]});
  if(url.endsWith('/endpoints'))return Response.json({data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[options.endpoint??endpoint()]}});
  return options.response?options.response():Response.json(receipt());};
 const complete=createLunaChatCompletion({apiKey:'synthetic-never-live',fetcher,policyCurrent:async()=>options.policy?options.policy():true,
  dispatchCurrent:options.dispatchCurrent??(()=>true),...(options.preClaimCurrent?{preClaimCurrent:options.preClaimCurrent}:{}),claim:async()=>{claims++;options.onClaim?.();return options.claim??true;}});
 return{calls,get claims(){return claims;},complete};
}
const run=(f,value={question:'What is 6 times 7?'},before=async()=>true)=>f.complete(value,before,new AbortController().signal);
const posts=f=>f.calls.filter(c=>c.init.method==='POST');

test('direct chat uses only its fixed system prompt and the user question with the existing strict policy',async()=>{
 const f=fixture(),r=await run(f);assert.equal(r.answer,'Six times seven is 42.');assert.equal(r.usage.costNanoUsd,11000);assert.equal(f.claims,1);assert.equal(posts(f).length,1);
 const body=JSON.parse(posts(f)[0].init.body);assert.deepEqual(body.messages,[{role:'system',content:lunaChatSystemPrompt},{role:'user',content:'What is 6 times 7?'}]);
 assert.equal(body.model,lunaRagModel);assert.equal(body.max_completion_tokens,700);assert.equal(body.tool_choice,'none');assert.equal(body.tools,undefined);
 assert.deepEqual(body.plugins,[]);assert.deepEqual(body.reasoning,{enabled:false});assert.equal(body.include_reasoning,false);
 assert.deepEqual(body.provider,{only:['azure/us'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{prompt:0.11,completion:0.55,request:0,image:0}});
 assert.ok(Number.isSafeInteger(r.timing.admissionMs));assert.ok(Number.isSafeInteger(r.timing.providerRoundTripMs));assert.equal('citations' in r,false);
 await assert.rejects(run(f),e=>e.code==='not_admitted');assert.equal(posts(f).length,1);
});

test('untrusted context, invalid text and excess bytes never reach policy or provider',async()=>{
 for(const input of [{question:'ok',passages:[{text:'PRIVATE'}]},{question:'ok',system:'private override'},{question:''},{question:'x'.repeat(2001)},{question:'\ud800'},null]){
  const f=fixture();await assert.rejects(run(f,input),e=>e.code==='not_admitted');assert.equal(f.calls.length,0);assert.equal(f.claims,0);
 }
});

test('plain answer JSON and shared provider receipt are strictly validated',async()=>{
 const good=receipt();for(const content of ['{}','{"answer":""}','{"answer":42}','{"answer":"ok","citations":[]}','{"answer":"one","answer":"two"}',JSON.stringify({answer:'x'.repeat(8001)}),JSON.stringify({answer:'\ud800'}),JSON.stringify({answer:'fake [S1]'})]){
  const value=structuredClone(good);value.choices[0].message.content=content;assert.throws(()=>validateLunaChatResponse(value),e=>e.code==='outcome_unknown');
 }
 for(const mutate of [v=>v.model='other',v=>v.provider='Other',v=>v.usage.cost=0.01,v=>v.choices[0].finish_reason='length',v=>v.choices[0].message.tool_calls=[{}],v=>v.usage.completion_tokens_details={reasoning_tokens:1}]){
  const value=structuredClone(good);mutate(value);assert.throws(()=>validateLunaChatResponse(value),e=>e.code==='outcome_unknown');
 }
 assert.deepEqual(validateLunaChatResponse(good).answer,'Six times seven is 42.');assert.equal('timing' in validateLunaChatResponse(good),false);
});

test('policy, budget, actor and unknown provider responses cannot cause a retry or release',async()=>{
 for(const options of [{retention:true},{claim:false},{policy:async()=>false}]){
  const f=fixture(options);await assert.rejects(run(f),e=>e.code==='not_admitted');assert.equal(posts(f).length,0);
 }
 let actor=true;const lost=fixture({onClaim:()=>{actor=false;}});await assert.rejects(run(lost,undefined,async()=>actor),e=>e.code==='not_admitted');assert.equal(lost.claims,1);assert.equal(posts(lost).length,0);
 const unknown=fixture({response:()=>Response.json({error:{code:429},usage:{}})});await assert.rejects(run(unknown),e=>e.code==='outcome_unknown');
 await assert.rejects(run(unknown),e=>e.code==='not_admitted');assert.equal(unknown.claims,1);assert.equal(posts(unknown).length,1);
});
