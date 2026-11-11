import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedDirectCompletion} from '../src/server/hosted-model-openrouter.ts';
import {haikuHostedModel,requestedHostedModel,fastHostedModel} from '../src/hosted-model.ts';

const endpoint=(change={})=>({tag:'google-vertex/global',model_id:haikuHostedModel.id,name:'Google | anthropic/claude-haiku-5.5-20261007',provider_name:'Google',status:0,
 pricing:{prompt:'0.0000001',completion:'0.0000005',web_search:'0.01',input_cache_read:'0.00000001',input_cache_write:'0.000000125',input_cache_write_1h:'0.0000002',discount:0,
  overrides:[{min_prompt_tokens:100000,prompt:'0.0000005',completion:'0.0000025'}]},context_length:1000000,max_completion_tokens:128000,max_prompt_tokens:null,
 supports_implicit_caching:false,supports_tool_choice:{none:true,auto:true},supported_parameters:['reasoning','include_reasoning','max_tokens','response_format','tool_choice','tools','structured_outputs'],...change});

function run(change){
 let wire,posts=0;
 const identity={id:'gen-SYNTHETIC_HAIKU',model:'anthropic/claude-haiku-5.5-20261007',provider:'Google'};
 const fetcher=async(url,init)=>{
  if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:haikuHostedModel.id,tag:'google-vertex/global',safety_retention:false}]});
  if(url.endsWith('/endpoints'))return Response.json({data:{id:haikuHostedModel.id,architecture:{tokenizer:'Claude'},endpoints:[endpoint(change),{...endpoint(),tag:'anthropic',provider_name:'Anthropic'}]}});
  posts++;wire=JSON.parse(init.body);
  const frames=[{...identity,choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{content:JSON.stringify({answer:'Use `digitalWrite(LED_BUILTIN, HIGH)`.'})},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{},finish_reason:'stop'}]},
   {...identity,choices:[],usage:{prompt_tokens:300,completion_tokens:40,total_tokens:340,cost:0.00005,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0},completion_tokens_details:{reasoning_tokens:0,image_tokens:0}}}];
  const text=frames.map(f=>'data: '+JSON.stringify(f)+'\n\n').join('')+'data: [DONE]\n\n';
  return new Response(text,{headers:{'content-type':'text/event-stream'}});
 };
 const complete=createHostedDirectCompletion({model:haikuHostedModel.id,apiKey:'synthetic-secret-never-live',fetcher,policyCurrent:async()=>true,dispatchCurrent:()=>true,claim:async()=>true});
 return {result:complete({question:'Blink an LED'},async()=>true,new AbortController().signal),get wire(){return wire;},get posts(){return posts;}};
}

test('Haiku requests are pinned to the reviewed zero-retention endpoint and validated like the fast model', async()=>{
 const call=run();
 const out=await call.result;
 assert.equal(out.answer,'Use `digitalWrite(LED_BUILTIN, HIGH)`.');
 assert.equal(call.wire.model,haikuHostedModel.id);
 assert.deepEqual(call.wire.provider.only,['google-vertex/global']);
 assert.equal(call.wire.provider.zdr,true);
 assert.deepEqual(call.wire.provider.max_price,{prompt:0.10,completion:0.50,request:0,image:0});
 assert.deepEqual(call.wire.reasoning,{enabled:false});
 assert.equal(call.wire.tool_choice,'none');
});

test('a changed Haiku price or a low price tier is refused before any request is sent', async()=>{
 for(const change of [{pricing:{...endpoint().pricing,prompt:'0.0000002'}},{pricing:{...endpoint().pricing,overrides:[{min_prompt_tokens:1000}]}},{provider_name:'Anthropic'}]){
  const call=run(change);
  await assert.rejects(call.result);
  assert.equal(call.posts,0);
 }
});

test('only the Haiku id selects Haiku; anything else falls back to the fast model', ()=>{
 assert.equal(requestedHostedModel(haikuHostedModel.id),haikuHostedModel.id);
 for(const header of [null,'',fastHostedModel.id,'anthropic/claude-opus-5-5'])assert.equal(requestedHostedModel(header),fastHostedModel.id);
});
