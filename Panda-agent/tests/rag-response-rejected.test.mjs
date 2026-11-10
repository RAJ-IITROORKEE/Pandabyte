import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createLunaRagCompletion,lunaRagModel,lunaRagReportedModel} from '../src/server/luna-rag-openrouter.ts';
import {createBasicRagPlayground} from '../src/server/basic-rag-playground.ts';
import {createBasicRagChatService} from '../src/server/basic-rag-chat-service.ts';
import {createPlaygroundWorkflowHandler} from '../src/control-room/playground-workflow-handler.ts';

registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/hosted-rag-playground.ts')&&['./basic-rag-openrouter','./luna-rag-openrouter','./hosted-rag-policy'].includes(specifier))return next(specifier+'.ts',context);
 return next(specifier,context);
}});
const {createHostedRagPlayground}=await import('../src/server/hosted-rag-playground.ts');
const thread='10000000-0000-4000-8000-000000000001',request='20000000-0000-4000-8000-000000000001';
const productId='30000000-0000-4000-8000-000000000001',question='Which MCU does TESTBOARD use?',digest='a'.repeat(64);
const passage={rank:1,text:'This listing names TESTMCU.',productSku:'TESTBOARD',productTitle:'Test board',title:'Test board',
 sourceUrl:'https://pandabyte.in/product-page/test',capturedAt:'2026-11-10T00:00:00Z',sectionPath:['Specifications']};
const context=()=>({kind:'ready',products:[{id:productId,sku:'TESTBOARD',title:'Test board'}],passages:[passage],digest,
 sourceProofs:[],revalidate:async()=>true});
const signal=()=>new AbortController().signal;
function provider(mode){
 const counts={posts:0,claims:0};let claimed=false;
 const claim=async()=>{if(claimed)return false;claimed=true;counts.claims++;return true;};
 const fetcher=async(url,options)=>{
  if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:lunaRagModel,tag:'azure/us',safety_retention:false}]});
  if(url.endsWith('/endpoints'))return Response.json({data:{id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[{
   tag:'azure/us',model_id:lunaRagModel,name:'Azure | '+lunaRagReportedModel,provider_name:'Azure',status:0,
   pricing:{prompt:'0.00000011',completion:'0.00000055',input_cache_read:'0.000000011',input_cache_write:'0.0000001375',discount:0},
   context_length:1050000,max_completion_tokens:128000,max_prompt_tokens:null,supports_implicit_caching:false,
   supports_tool_choice:{none:true},supported_parameters:['max_completion_tokens','response_format','reasoning','include_reasoning','tool_choice'],
  }]}});
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.method,'POST');counts.posts++;
  return Response.json({model:lunaRagReportedModel,provider:mode==='unknown'?'Unverified':'Azure',
   choices:[{finish_reason:mode==='truncated'?'length':'stop',message:{content:JSON.stringify({answer:'PRIVATE_UNSUPPORTED_ANSWER',
    evidence:[{rank:1,quote:'PRIVATE_UNSUPPORTED_QUOTE',reason:'PRIVATE_PROVIDER_REASON'}]})}}],
   usage:{prompt_tokens:40,completion_tokens:25,cost:0.00001815}});
 };
 return {counts,claim,fetcher};
}
const generatedInput={requestId:request,question,context:context(),documents:[]};

test('hosted and local Luna adapters preserve terminal rejection versus unknown and never reclaim a spent request',async()=>{
 for(const surface of ['hosted','local'])for(const [mode,expected] of [['rejected','response_rejected'],['unknown','outcome_unknown'],['truncated','outcome_unknown']]){
  const f=provider(mode),original=globalThis.fetch;globalThis.fetch=f.fetcher;
  try{
   const policy={enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',claimRequest:f.claim};
   const generate=surface==='hosted'?createHostedRagPlayground(policy):createBasicRagPlayground({
    subject:'owner',requestOrigin:'http://localhost:3001',env:{OPENROUTER_API_KEY:'synthetic'},profile:{binding:digest},mode:'prototype',
    availability:{...policy,binding:()=>digest,claimBudget:f.claim},completion:options=>createLunaRagCompletion({...options,fetcher:f.fetcher}),
   });
   await assert.rejects(generate(generatedInput,async()=>true,signal()),e=>e.code===expected&&!e.message.includes('PRIVATE'));
   await assert.rejects(generate(generatedInput,async()=>true,signal()),e=>e.code==='not_admitted');
   assert.deepEqual(f.counts,{posts:1,claims:1});
  }finally{globalThis.fetch=original;}
 }
});

test('workflow HTTP boundary propagates real adapter rejection and unknown codes without model content',async()=>{
 for(const [mode,expected] of [['rejected','response_rejected'],['unknown','outcome_unknown']]){
  const f=provider(mode),original=globalThis.fetch;globalThis.fetch=f.fetcher;
  try{
   const generate=createHostedRagPlayground({enabled:async()=>true,current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',claimRequest:f.claim});
   const dependencies={authorize:async()=>true,prepare:async()=>context(),generate};
   const handler=createPlaygroundWorkflowHandler(async()=>({kind:'admin',subject:'owner',dependencies}));
   const response=await handler(new Request('https://app.example/api',{method:'POST',headers:{origin:'https://app.example','content-type':'application/json'},
    body:JSON.stringify({question,evaluate:true,requestId:request})}));
   assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:expected}});
   assert.deepEqual(f.counts,{posts:1,claims:1});
  }finally{globalThis.fetch=original;}
 }
});

test('journal saves a safe terminal response for proven rejection, retains the claim and replays without another POST',async()=>{
 for(const [mode,expected] of [['rejected','saved'],['unknown','unknown'],['truncated','unknown']]){
  const f=provider(mode);let row=null,completes=0,preparations=0;
  const read=()=>({thread:{id:thread,title:'Disposable',status:row?.status==='pending'?'pending':'idle',updatedAt:'2026-11-10T00:00:00Z'},messages:[],
   turns:row?[{requestId:request,question,status:row.status,response:row.response,createdAt:'2026-11-10T00:00:00Z'}]:[]});
  const store={
   state:async()=>row?{question,status:row.status,prepared:row.prepared,cancelled:false}:null,
   begin:async()=>{row={status:'pending',prepared:false,response:null};return {...read(),admitted:true};},
   scope:async()=>({productId,sku:'TESTBOARD',scopeHash:'b'.repeat(64)}),
   prepare:async()=>{preparations++;if(row.prepared)return false;row.prepared=true;return true;},
   complete:async(_thread,_request,answer)=>{completes++;row.status='complete';row.response=answer;return read();},
   cancel:async()=>assert.fail('unexpected cancel'),
  };
  const deps={store,current:async()=>true,enabled:async()=>true,prepareContext:async()=>context(),
   completion:claim=>createLunaRagCompletion({apiKey:'synthetic',fetcher:f.fetcher,policyCurrent:async()=>true,dispatchCurrent:()=>true,
    claim:async()=>{assert.equal(await f.claim(),true);return claim();}})};
  const start={thread,request,question};
  assert.deepEqual(await createBasicRagChatService(deps).start(start,signal()),{status:expected});
  assert.equal(row.prepared,true);assert.equal(preparations,1);assert.equal(completes,mode==='rejected'?1:0);
  if(mode==='rejected'){
   assert.equal(row.response.outcome,'insufficient');assert.deepEqual(row.response.citations,[]);
   assert.match(row.response.text,/grounded response is unavailable/i);assert.doesNotMatch(JSON.stringify(row.response),/PRIVATE|TESTMCU/);
  }else assert.equal(row.response,null);
  deps.enabled=async()=>false;
  const restarted=createBasicRagChatService(deps);
  assert.deepEqual(await restarted.status(start,signal()),{status:expected});
  assert.deepEqual(await restarted.start(start,signal()),{status:expected});
  assert.equal(preparations,1);assert.deepEqual(f.counts,{posts:1,claims:1});
 }
});
