import test from 'node:test';
import assert from 'node:assert/strict';
import { createLunaNativeCompletion } from '../src/server/luna-native-openrouter.ts';
import { lunaRagModel, lunaRagReportedModel } from '../src/server/luna-rag-openrouter.ts';
const messages = [{role:'system',content:'Native system'}, {role:'user',content:'Earlier'}, {role:'assistant',content:'History'}, {role:'user',content:'Now'}];
const endpoint = () => ({tag:'azure/us',model_id:lunaRagModel,name:'Azure | '+lunaRagReportedModel,provider_name:'Azure',pricing:{prompt:'0.00000011',completion:'0.00000055',discount:0},context_length:12000,max_completion_tokens:700,max_prompt_tokens:null,status:0,supports_implicit_caching:false,supports_tool_choice:{none:true},supported_parameters:['reasoning','include_reasoning','max_completion_tokens','tool_choice','response_format']});
const receipt = () => ({model:lunaRagModel,provider:'Azure',choices:[{finish_reason:'stop',message:{content:'Plain native answer'}}],usage:{prompt_tokens:40,completion_tokens:12,cost:0.000011}});
function fixture(options={}) {
 const calls=[]; let checks=0;
 const fetcher=async(url,init)=>{ calls.push({url,init});
  if(url.endsWith('/endpoints/zdr')) return Response.json({data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:options.retention??false}]});
  if(url.endsWith('/endpoints')) return Response.json({data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[options.endpoint??endpoint()]}});
  return options.response ? options.response() : Response.json(receipt()); };
 const complete=createLunaNativeCompletion({apiKey:'synthetic-never-live',fetcher,policyCurrent:async()=>{checks++;return options.policy?.(checks)??true;},dispatchCurrent:options.dispatch??(()=>true)});
 const run=(input=messages,before=async()=>true)=>complete(input,before,new AbortController().signal);
 return {calls,run,posts:()=>calls.filter(c=>c.init.method==='POST')};
}
test('native system and complete history reach one pinned provider POST and raw receipt is validated',async()=>{
 const f=fixture(), result=await f.run();assert.equal(result.content,'Plain native answer');assert.equal(result.usage.costNanoUsd,11000);
 const call=f.posts()[0], body=JSON.parse(call.init.body);assert.deepEqual(body.messages,messages);assert.equal(body.max_completion_tokens,700);
 assert.equal(body.tool_choice,'none');assert.equal(body.response_format,undefined);assert.deepEqual(body.plugins,[]);assert.deepEqual(body.reasoning,{enabled:false});assert.equal(body.include_reasoning,false);
 assert.deepEqual(body.provider,{only:['azure/us'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{prompt:0.11,completion:0.55,request:0,image:0}});
 assert.equal(call.init.headers['X-OpenRouter-Cache'],'false');await assert.rejects(f.run(),e=>e.code==='not_admitted');assert.equal(f.posts().length,1);
});
test('fresh policy, price, safety retention and actor admission fail before POST',async()=>{
 const expensive=endpoint();expensive.pricing.prompt='0.00000012';
 for(const opts of [{endpoint:expensive},{retention:true},{policy:()=>false},{policy:n=>n===1},{dispatch:()=>false}]) {const f=fixture(opts);await assert.rejects(f.run(),e=>e.code==='not_admitted');assert.equal(f.posts().length,0);}
 const f=fixture();await assert.rejects(f.run(messages,async()=>false),e=>e.code==='not_admitted');assert.equal(f.posts().length,0);
});
test('limits, unsafe tools, invalid receipts and 429 fail closed without retries',async()=>{
 for(const input of [[{role:'user',content:'x'.repeat(10000)}],[{role:'assistant',content:'',tool_calls:[{}]}],[{role:'tool',content:'result'}]]) {const f=fixture();await assert.rejects(f.run(input),e=>e.code==='not_admitted');assert.equal(f.calls.length,0);}
 for(const mutate of [v=>v.provider='other',v=>v.model='other',v=>v.usage.cost=0.1,v=>v.choices[0].message.tool_calls=[{}],v=>v.usage.prompt_tokens_details={cached_tokens:1}]) {const bad=receipt();mutate(bad);const f=fixture({response:()=>Response.json(bad)});await assert.rejects(f.run(),e=>e.code==='outcome_unknown');await assert.rejects(f.run(),e=>e.code==='not_admitted');assert.equal(f.posts().length,1);}
 const f=fixture({response:()=>new Response('',{status:429})});await assert.rejects(f.run(),e=>e.code==='rate_limited');await assert.rejects(f.run(),e=>e.code==='not_admitted');assert.equal(f.posts().length,1);
});
