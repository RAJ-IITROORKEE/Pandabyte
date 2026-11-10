import test from 'node:test';
import assert from 'node:assert/strict';
import {createLunaRagCompletion,lunaRagModel,lunaRagReportedModel} from '../src/server/luna-rag-openrouter.ts';
import {runBasicRag} from '../src/retrieval/basic-rag.ts';
import {runRagWorkflow} from '../src/control-room/rag-workflow.ts';

const question='What are the test board specifications?',requestId='20000000-0000-4000-8000-000000000001';
const text='Processor: ESP32-C3\u00a0CPU. Flash: 4 MB. Radio: Wi-Fi. Interface: USB.';
const quotes=['ESP32-C3 CPU','4 MB','Wi-Fi','USB'];
const literalQuotes=['ESP32-C3\u00a0CPU','4 MB','Wi-Fi','USB'];
const context=()=>({kind:'ready',products:[{id:'test-product',sku:'TESTBOARD',title:'Test board'}],digest:'a'.repeat(64),sourceProofs:[],revalidate:async()=>true,
 passages:[{rank:1,text,productSku:'TESTBOARD',productTitle:'Test board',title:'Test board listing',sourceUrl:'https://pandabyte.in/product-page/testboard',
  capturedAt:'2026-11-10T00:00:00Z',sectionPath:['Specifications']}]});
function completion(mode){
 const counts={claims:0,posts:0};
 const evidence=quotes.map(quote=>({rank:1,quote,reason:'Exact listing specification.'}));
 if(mode==='duplicate')evidence[1]={...evidence[0],quote:literalQuotes[0],reason:'Same quote after whitespace recovery.'};
 if(mode==='absent')evidence[1]={rank:1,quote:'8 MB',reason:'Not in the supplied source.'};
 const complete=createLunaRagCompletion({apiKey:'synthetic',policyCurrent:async()=>true,dispatchCurrent:()=>true,
  claim:async()=>{counts.claims++;return true;},fetcher:async(url,options)=>{
   if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:false}]});
   if(url.endsWith('/endpoints'))return Response.json({data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[{
    tag:'azure/us',model_id:lunaRagModel,name:'Azure | '+lunaRagReportedModel,provider_name:'Azure',status:0,
    pricing:{prompt:'0.00000011',completion:'0.00000055',discount:0},context_length:1050000,max_completion_tokens:128000,max_prompt_tokens:null,
    supports_implicit_caching:false,supports_tool_choice:{none:true},supported_parameters:['max_completion_tokens','response_format','reasoning','include_reasoning','tool_choice'],
   }]}});
   assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.method,'POST');counts.posts++;
   return Response.json({model:lunaRagReportedModel,provider:'Azure',choices:[{finish_reason:'stop',message:{content:JSON.stringify({
    answer:'The listing states ESP32-C3 CPU, 4 MB flash, Wi-Fi and USB.',evidence,
   })}}],usage:{prompt_tokens:40,completion_tokens:25,cost:0.00001815}});
  }});
 return {complete,counts};
}

test('main RAG accepts four distinct exact quotes from one passage after the real Luna transport validators',async()=>{
 const f=completion('valid');
 const result=await runBasicRag({question,signal:new AbortController().signal},{usagePolicy:'bounded_luna_test',authorize:async()=>true,prepare:async()=>context(),complete:f.complete});
 assert.equal(result.status,'answered');assert.deepEqual(result.answer.citations.map(c=>c.quote),literalQuotes);
 assert.deepEqual(result.answer.citations.map(c=>c.id),['S1','S2','S3','S4']);
 assert.ok(result.answer.citations.every(c=>c.sourceUrl===context().passages[0].sourceUrl&&text.includes(c.quote)));
 assert.deepEqual(f.counts,{claims:1,posts:1});
});

test('Control Room accepts four distinct same-passage quotes with their original rank and source text',async()=>{
 const f=completion('valid');
 const result=await runRagWorkflow({question,requestId,evaluate:true,signal:new AbortController().signal},{usagePolicy:'bounded_luna_test',
  authorize:async()=>true,prepare:async()=>context(),generate:(input,beforeSend,signal)=>f.complete({question:input.question,passages:input.context.passages},beforeSend,signal)});
 assert.equal(result.model.status,'evaluated');assert.deepEqual(result.model.evidence.map(e=>e.rank),[1,1,1,1]);
 assert.deepEqual(result.model.evidence.map(e=>e.quote),literalQuotes);assert.deepEqual(f.counts,{claims:1,posts:1});
});

test('exact duplicate or absent same-passage quotes remain rejected through both paths without a retry',async()=>{
 for(const mode of ['duplicate','absent'])for(const surface of ['main','control-room']){
  const f=completion(mode),signal=new AbortController().signal;
  if(surface==='main'){
   const result=await runBasicRag({question,signal},{usagePolicy:'bounded_luna_test',authorize:async()=>true,prepare:async()=>context(),complete:f.complete});
   assert.equal(result.status,'unavailable');assert.equal('answer' in result,false);
  }else await assert.rejects(runRagWorkflow({question,requestId,evaluate:true,signal},{usagePolicy:'bounded_luna_test',
   authorize:async()=>true,prepare:async()=>context(),generate:(input,beforeSend,abort)=>f.complete({question:input.question,passages:input.context.passages},beforeSend,abort)}),e=>e.code==='response_rejected');
  await assert.rejects(f.complete({question,passages:[{rank:1,text}]},async()=>true,signal),e=>e.code==='not_admitted');
  assert.deepEqual(f.counts,{claims:1,posts:1});
 }
});
