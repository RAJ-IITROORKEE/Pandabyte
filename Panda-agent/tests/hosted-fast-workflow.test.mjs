import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedRagPlayground} from '../src/server/hosted-rag-playground.ts';
import {createPlaygroundWorkflowHandler} from '../src/control-room/playground-workflow-handler.ts';

test('hosted selection reaches the actual workflow through Groq and releases exact source evidence once',async()=>{
 const previous=globalThis.fetch,info=console.info;let posts=0,claims=0;
 const model='openai/gpt-oss-20b',id='gen-SYNTHETIC_WORKFLOW';
 globalThis.fetch=async(url,init)=>{
  if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:model,tag:'groq',safety_retention:false}]});
  if(url.endsWith('/endpoints'))return Response.json({data:{id:model,architecture:{tokenizer:'GPT'},endpoints:[{
   tag:'groq',model_id:model,name:'Groq | '+model,provider_name:'Groq',status:0,supports_implicit_caching:true,
   pricing:{prompt:'0.000000075',completion:'0.0000003',input_cache_read:'0.0000000375',discount:0},
   context_length:131072,max_completion_tokens:65536,max_prompt_tokens:null,supports_tool_choice:{none:true},
   supported_parameters:['max_tokens','response_format','reasoning','include_reasoning','tool_choice']}]}});
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');posts++;
  const wire=JSON.parse(init.body);assert.equal(wire.model,model);assert.deepEqual(wire.provider.only,['groq']);
  const source=JSON.parse(wire.messages[1].content).source;
  const content=JSON.stringify({answer:'The listing names TEST MCU.',evidence:[{id:source[0].id,reason:'Names the MCU.'}]});
  const frames=[{id,model,provider:'Groq',choices:[{index:0,delta:{role:'assistant',content},finish_reason:'stop'}]},
   {id,model,provider:'Groq',choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:'stop'}],
    usage:{prompt_tokens:40,completion_tokens:20,total_tokens:60,cost:0.000009,completion_tokens_details:{reasoning_tokens:5}}}];
  return new Response(frames.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 };
 console.info=()=>{};
 try{
  const context={kind:'ready',products:[{id:'fixture',sku:'TEST',title:'Test board'}],digest:'a'.repeat(64),revalidate:async()=>true,
   passages:[{rank:1,text:'The listing names TEST MCU.',productSku:'TEST',productTitle:'Test board',title:'Test board',sourceUrl:'https://www.pandabyte.in/product-page/fixture',capturedAt:'2026-11-10T00:00:00Z',sectionPath:['Specifications']}]};
  const policy={enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',claimRequest:async value=>{assert.equal(value.surface,'playground');claims++;return claims===1;}};
  const generate=createHostedRagPlayground(policy,{VERCEL:'1',PANDA_AGENT_HOSTED_MODEL:model});
  const handler=createPlaygroundWorkflowHandler(async()=>({kind:'admin',subject:'fixture',dependencies:{authorize:async()=>true,prepare:async()=>context,generate,usagePolicy:'bounded_luna_test'}}));
  const request=()=>new Request('http://localhost/api/admin/panda-agent/playground',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({question:'Which MCU does the listing name?',evaluate:true,requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})});
  const response=await handler(request()),data=await response.json();assert.equal(response.status,200);assert.equal(data.model.status,'evaluated');
  assert.equal(data.model.evidence[0].quote,context.passages[0].text);assert.equal(data.metrics.costUsd,0.000009);
  assert.equal((await handler(request())).status,503);assert.equal(posts,1);assert.equal(claims,2);
  await assert.rejects(createHostedRagPlayground(policy,{VERCEL:'1',PANDA_AGENT_HOSTED_MODEL:'foreign/model'})({question:'x',context,requestId:'x'},async()=>true,new AbortController().signal),{code:'not_admitted'});
  assert.equal(posts,1);
 }finally{globalThis.fetch=previous;console.info=info;}
});
