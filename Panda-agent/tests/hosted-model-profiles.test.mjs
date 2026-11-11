import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedDirectCompletion} from '../src/server/hosted-model-openrouter.ts';
import {lunaHostedModel,flashHostedModel,qwenHostedModel} from '../src/hosted-model.ts';

const base={status:0,max_prompt_tokens:null,context_length:262144,max_completion_tokens:65536,supports_tool_choice:{none:true,auto:true},
 supported_parameters:['reasoning','include_reasoning','max_tokens','max_completion_tokens','response_format','structured_outputs','tool_choice']};
const fixtures={
 luna:{model:lunaHostedModel,tokenizer:'GPT',endpoint:{...base,tag:'azure/us',name:'Azure | openai/gpt-6-luna-20260922',provider_name:'Azure',supports_implicit_caching:false,
  supported_parameters:base.supported_parameters.filter(p=>p!=='max_tokens'),pricing:{prompt:'0.00000011',completion:'0.00000055',web_search:'0.01',input_cache_read:'0.000000011',input_cache_write:'0.0000001375',discount:0,overrides:[{min_prompt_tokens:272000}]}},
  provider:'Azure',reported:'openai/gpt-6-luna-20260922'},
 flash:{model:flashHostedModel,tokenizer:'DeepSeek',endpoint:{...base,tag:'wafer/mxfp4',name:'Wafer | deepseek/deepseek-v4-flash-20260423',provider_name:'Wafer',supports_implicit_caching:true,
  pricing:{prompt:'0.00000012',completion:'0.00000017',input_cache_read:'0.000000024',discount:0}},provider:'Wafer',reported:'deepseek/deepseek-v4-flash-20260423'},
 qwen:{model:qwenHostedModel,tokenizer:'Qwen',endpoint:{...base,tag:'deepinfra/bf16',name:'DeepInfra | qwen/qwen3.8-27b-20260814',provider_name:'DeepInfra',supports_implicit_caching:true,
  pricing:{prompt:'0.00000015',completion:'0.000001875',input_cache_read:'0.0000000375',discount:0.25}},provider:'DeepInfra',reported:'qwen/qwen3.8-27b-20260814'},
};

function run(name,{endpoint={},reasoningDetails}={}){
 const f=fixtures[name];let wire,posts=0;
 const identity={id:'gen-SYNTHETIC_'+name,model:f.reported,provider:f.provider};
 const fetcher=async(url,init)=>{
  if(url.endsWith('/endpoints/zdr'))return Response.json({data:[f.endpoint.tag,...(f.extraTags??[])].map(tag=>({model_id:f.model.id,tag,safety_retention:false}))});
  if(url.endsWith('/endpoints'))return Response.json({data:{id:f.model.id,architecture:{tokenizer:f.tokenizer},endpoints:[{...f.endpoint,model_id:f.model.id,...endpoint},
   ...(f.extraTags??[]).map(tag=>({...f.endpoint,model_id:f.model.id,tag}))]}});
  posts++;wire=JSON.parse(init.body);
  const frames=[{...identity,choices:[{index:0,delta:{role:'assistant',content:'',...(reasoningDetails?{reasoning_details:reasoningDetails}:{})},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{content:JSON.stringify({answer:'## Steps\n1. Wire it.'})},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{},finish_reason:'stop'}]},
   {...identity,choices:[],usage:{prompt_tokens:400,completion_tokens:120,total_tokens:520,cost:0.000001,prompt_tokens_details:{cached_tokens:0},completion_tokens_details:{reasoning_tokens:20}}}];
  return new Response(frames.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 };
 const complete=createHostedDirectCompletion({model:f.model.id,apiKey:'synthetic-secret-never-live',fetcher,policyCurrent:async()=>true,dispatchCurrent:()=>true,claim:async()=>true});
 return {result:complete({question:'Plan a sensor'},async()=>true,new AbortController().signal),get wire(){return wire;},get posts(){return posts;}};
}

test('Luna uses max_completion_tokens, pins azure/us and accepts discarded encrypted reasoning', async()=>{
 const call=run('luna',{reasoningDetails:[{type:'reasoning.encrypted',data:'opaque',format:'openai-responses-v1',id:'rs_1',index:0}]});
 assert.equal((await call.result).answer,'## Steps\n1. Wire it.');
 assert.equal(call.wire.max_completion_tokens,1600);assert.equal(call.wire.max_tokens,undefined);
 assert.deepEqual(call.wire.provider.only,['azure/us']);assert.equal(call.wire.provider.zdr,true);
 const visible=run('luna',{reasoningDetails:[{type:'reasoning.text',text:'secret thoughts'}]});
 await assert.rejects(visible.result);
});

test('DeepSeek V4 Flash pins the Wafer endpoint with its exact price cap and no reasoning', async()=>{
 const call=run('flash');
 assert.equal((await call.result).answer,'## Steps\n1. Wire it.');
 assert.deepEqual(call.wire.provider.only,['wafer/mxfp4']);assert.deepEqual(call.wire.reasoning,{enabled:false});
 assert.deepEqual(call.wire.provider.max_price,{prompt:0.12,completion:0.17,request:0,image:0});
});

test('Qwen requires its reviewed discount and disables reasoning', async()=>{
 const call=run('qwen');
 await call.result;assert.deepEqual(call.wire.reasoning,{enabled:false});assert.equal(call.wire.max_tokens,1600);
 const changed=run('qwen',{endpoint:{pricing:{...fixtures.qwen.endpoint.pricing,discount:0}}});
 await assert.rejects(changed.result);assert.equal(changed.posts,0);
});
