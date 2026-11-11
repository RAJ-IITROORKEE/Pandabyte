import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createHostedRagCompletion,createHostedDirectCompletion} from '../src/server/hosted-model-openrouter.ts';
import {fastHostedModel} from '../src/hosted-model.ts';

const input=()=>({question:'Which MCU is named?',passages:[{rank:1,text:'The listing names TEST MCU 🐼.'}]});
const identity={id:'gen-SYNTHETIC_ONLY',model:fastHostedModel.id,provider:'Groq'};
const usage=()=>({prompt_tokens:40,completion_tokens:20,total_tokens:60,cost:0.000008625,
 prompt_tokens_details:{cached_tokens:10,cache_write_tokens:0},completion_tokens_details:{reasoning_tokens:8}});
const endpoint=()=>({tag:'groq',model_id:fastHostedModel.id,name:'Groq | openai/gpt-oss-20b',provider_name:'Groq',status:0,
 pricing:{prompt:'0.000000075',completion:'0.0000003',input_cache_read:'0.0000000375',discount:0},context_length:131072,
 max_completion_tokens:65536,max_prompt_tokens:null,supports_implicit_caching:true,supports_tool_choice:{none:true},
 supported_parameters:['reasoning','include_reasoning','max_tokens','temperature','top_p','stop','seed','response_format','tools','tool_choice','structured_outputs','reasoning_effort']});
let logs=[],originalInfo;
test.beforeEach(()=>{logs=[];originalInfo=console.info;console.info=(...values)=>logs.push(values);});
test.afterEach(()=>{console.info=originalInfo;});
function fixture(options={}){
 const counts={claims:0,posts:0},calls=[],observations=[];let fingerprint,wire;
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:fastHostedModel.id,tag:'groq',safety_retention:false,...options.zdr}]});
  if(url.endsWith('/endpoints')){options.onMetadata?.();const row=endpoint();options.endpoint?.(row);return Response.json({data:{id:fastHostedModel.id,architecture:{tokenizer:'GPT'},endpoints:[row,...(options.extraEndpoints??[])]}});}
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(init.method,'POST');counts.posts++;
  wire=JSON.parse(init.body);if(options.httpStatus)return Response.json({error:'PRIVATE_PROVIDER_ERROR'},{status:options.httpStatus});
  const source=options.direct?undefined:JSON.parse(wire.messages[1].content).source;
  let evaluation=options.direct?{answer:'Your saved word is panda.'}:{answer:'The listing names TEST MCU 🐼.',evidence:[{id:source[0].id,reason:'The excerpt names the MCU.'}]};
  if(options.evaluation)evaluation=options.evaluation(evaluation,source);
  const content=JSON.stringify(evaluation);
  const frames=[{...identity,choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{content:content.slice(0,10)},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{content:content.slice(10)},finish_reason:null}]},
   {...identity,choices:[{index:0,delta:{},finish_reason:'stop'}]},
   {...identity,choices:[],usage:usage()}];
  options.frames?.(frames);
  let text=': synthetic heartbeat\r\n\r\n'+frames.map(frame=>'data: '+JSON.stringify(frame)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n';
  if(options.stream)text=options.stream(text);
  let bytes=new TextEncoder().encode(text);if(options.bytes)bytes=options.bytes(bytes);
  const emoji=bytes.indexOf(0xf0),cuts=options.split===false?[bytes.length]:[1,7,emoji>0?emoji+1:19,emoji>0?emoji+3:23,bytes.length].sort((a,b)=>a-b);
  let offset=0;
  return new Response(new ReadableStream({async pull(controller){const end=cuts.shift();if(end===undefined){controller.close();return;}if(end===bytes.length)await options.hold?.();controller.enqueue(bytes.slice(offset,end));offset=end;}}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
 };
 const shared={apiKey:'synthetic-secret-never-live',fetcher,policyCurrent:options.policy??(async()=>true),dispatchCurrent:options.dispatch??(()=>true),
  observe:observation=>{observations.push(observation);if(options.observerThrows)throw Error('PRIVATE_OBSERVER_FAILURE');}};
 const complete=options.direct?createHostedDirectCompletion({...shared,claim:async value=>{fingerprint=value;counts.claims++;return options.claim!==false;}})
  :createHostedRagCompletion({...shared,preClaimCurrent:()=>true,claim:async()=>{counts.claims++;return options.claim!==false;}});
 return {complete,counts,calls,observations,get wire(){return wire;},get fingerprint(){return fingerprint;}};
}
const run=(f,value=input(),before=async()=>true)=>f.complete(value,before,new AbortController().signal);
function groqFooterShape(frames){
 const content=frames[1].choices[0].delta.content+frames[2].choices[0].delta.content;
 frames.splice(0,frames.length,
  {...identity,choices:[{index:0,delta:{content:'',role:'assistant'},finish_reason:null}]},
  {...identity,choices:[{index:0,delta:{content,role:'assistant'},finish_reason:'stop'}]},
  {...identity,choices:[{index:0,delta:{content:'',role:'assistant'},finish_reason:'stop'}],usage:{prompt_tokens:1152,completion_tokens:370,total_tokens:1522,
   cost:0.0001878,is_byok:false,prompt_tokens_details:{cached_tokens:256,cache_write_tokens:0,audio_tokens:0,video_tokens:0},
   completion_tokens_details:{reasoning_tokens:24,image_tokens:0,audio_tokens:0},cost_details:{upstream_inference_cost:0.0001878}}},
 );
}

test('observed three-frame Groq stop plus empty repeated-stop usage footer validates for RAG and direct',async()=>{
 for(const direct of [false,true]){
  const f=fixture({direct,frames:groqFooterShape});const result=await run(f,direct?{question:'What is my word?'}:input());
  assert.deepEqual(result.usage,{inputTokens:1152,outputTokens:370,costNanoUsd:187800});
  assert.equal(f.observations[0].reasoningTokens,24);assert.equal(f.observations[0].cachedTokens,256);
  if(direct)assert.equal(result.answer,'Your saved word is panda.');else assert.equal(result.evaluation.evidence[0].quote,input().passages[0].text);
  await assert.rejects(run(f,direct?{question:'Hello'}:input()),e=>e.code==='not_admitted');assert.deepEqual(f.counts,{claims:1,posts:1});
 }
});

test('repeated stop permits only one empty verified usage footer and cannot restart content or bypass identity/tool checks',async()=>{
 const mutations=[
  frames=>{delete frames[2].usage;},frames=>{frames[2].choices[0].delta.content='PRIVATE_LATE_CONTENT';},
  frames=>{frames[2].choices[0].finish_reason=null;},frames=>{frames[2].choices[0].finish_reason='length';},
  frames=>{frames[2].choices[0].index=1;},frames=>{frames[2].choices[0].delta.role='user';},
  frames=>{frames[2].choices[0].delta.tool_calls=[];},frames=>{frames[2].choices[0].delta.reasoning='PRIVATE_REASONING';},
  frames=>{frames[2].id='gen-MIXED';},frames=>{frames[2].provider='Other';},frames=>{frames[2].model='other/model';},
  frames=>{frames.push({...frames[2]});},
 ];
 for(const mutation of mutations){const f=fixture({frames:frames=>{groqFooterShape(frames);mutation(frames);}});
  await assert.rejects(run(f),e=>e.code==='outcome_unknown');await assert.rejects(run(f),e=>e.code==='not_admitted');assert.deepEqual(f.counts,{claims:1,posts:1});
 }
 assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|TEST MCU|Bearer|synthetic-secret/);
});

test('RAG buffers split UTF-8/CRLF SSE, resolves exact quote IDs, accounts hidden reasoning and emits only safe observations',async()=>{
 const f=fixture({observerThrows:true,frames:frames=>{for(const frame of frames.slice(1)){delete frame.id;delete frame.model;delete frame.provider;}}});
 const result=await run(f);
 assert.deepEqual(result.evaluation,{answer:'The listing names TEST MCU 🐼.',evidence:[{rank:1,quote:input().passages[0].text,reason:'The excerpt names the MCU.'}]});
 assert.deepEqual(result.usage,{inputTokens:40,outputTokens:20,costNanoUsd:8625});
 assert.deepEqual(Object.keys(result.timing).sort(),['admissionMs','providerRoundTripMs']);
 const wire=f.wire,source=JSON.parse(wire.messages[1].content).source;
 assert.equal(wire.model,fastHostedModel.id);assert.equal(wire.max_tokens,700);assert.equal(wire.max_completion_tokens,undefined);
 assert.equal(wire.stream,true);assert.deepEqual(wire.stream_options,{include_usage:true});
 assert.deepEqual(wire.reasoning,{effort:'low',exclude:true});assert.equal(wire.include_reasoning,false);assert.equal(wire.tool_choice,'none');
 assert.deepEqual(wire.provider,{only:['groq'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{prompt:0.075,completion:0.3,request:0,image:0}});
 assert.equal(wire.response_format.type,'json_schema');assert.equal(wire.response_format.json_schema.strict,true);
 assert.deepEqual(wire.response_format.json_schema.schema.properties.evidence.items.properties.id.enum,source.map(q=>q.id));
 assert.equal(wire.response_format.json_schema.schema.additionalProperties,false);assert.equal(wire.response_format.json_schema.schema.properties.evidence.maxItems,4);
 assert.ok(Buffer.byteLength(JSON.stringify(wire),'utf8')<=10000);
 const observation=f.observations[0];assert.match(observation.observationId,/^[a-f0-9-]{36}$/);assert.ok(source[0].id.startsWith(observation.observationId+':'));
 assert.equal(observation.generationId,identity.id);assert.equal(observation.reasoningTokens,8);assert.equal(observation.cachedTokens,10);assert.equal(observation.stage,'validated');
 assert.ok(Number.isSafeInteger(observation.firstContentDeltaMs)&&observation.firstContentDeltaMs>=0);
 assert.ok(observation.providerRoundTripMs>=observation.firstContentDeltaMs);assert.equal(Object.isFrozen(observation),true);
 assert.doesNotMatch(JSON.stringify(logs),/TEST MCU|Which MCU|PRIVATE|synthetic-secret|Bearer|source|evidence/);
 assert.ok(logs.every(row=>row.length===2&&row[0]==='[hosted-llm]'&&typeof row[1]==='object'));
 await assert.rejects(run(f),e=>e.code==='not_admitted');assert.deepEqual(f.counts,{claims:1,posts:1});
});

test('partial content is never released before the final usage frame and DONE are consumed',async()=>{
 let entered,release,settled=false;
 const held=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const f=fixture({hold:async()=>{entered();await gate;}});
 const pending=run(f).then(value=>{settled=true;return value;});
 await held;assert.equal(settled,false);assert.deepEqual(f.observations,[]);assert.deepEqual(logs,[]);
 release();const result=await pending;assert.equal(result.evaluation.evidence[0].quote,input().passages[0].text);
 assert.equal(f.observations[0].stage,'validated');assert.deepEqual(f.counts,{claims:1,posts:1});
});
test('extracted usage rejection preserves the hosted public error and observation stage',async()=>{
 for(const direct of [false,true]){
  const f=fixture({direct,frames:frames=>{frames.at(-1).usage.completion_tokens=701;}});
  await assert.rejects(run(f,direct?{question:'Hello'}:input()),error=>error.constructor.name==='BasicRagProviderError'&&error.code==='outcome_unknown');
  assert.equal(f.observations[0].stage,'outcome_unknown');assert.equal(f.counts.posts,1);
 }
});

test('malformed, truncated, mixed, tool/reasoning or mispriced streams remain unknown with no second dispatch',async()=>{
 const cases=[
  {stream:text=>text.replace('data: [DONE]\r\n\r\n','')},
  {stream:text=>text+'data: {}\r\n\r\n'},
  {stream:text=>text.replace('data: [DONE]','data: malformed')},
  {stream:text=>text+': trailing invalid frame\r\n\r\n'},
  {stream:text=>':'+'.'.repeat(64000)+'\r\n\r\n'+text},
  {bytes:bytes=>Uint8Array.from([...bytes.slice(0,10),0xff,...bytes.slice(10)])},
  {frames:f=>{f[3].choices[0].finish_reason='length';}},
  {frames:f=>{f[1].id='gen-OTHER';}},
  {frames:f=>{f[1].model='other/model';}},
  {frames:f=>{f[1].provider='Other';}},
  {frames:f=>{f[1].choices[0].index=1;}},
  {frames:f=>{f[1].choices.push({...f[1].choices[0]});}},
  {frames:f=>{f[1].choices[0].delta.tool_calls=[];}},
  {frames:f=>{f[1].choices[0].delta.reasoning='PRIVATE_REASONING';}},
  {frames:f=>{f[1].choices[0].delta.reasoning_content='PRIVATE_REASONING';}},
  {frames:f=>{f[1].choices[0].delta.reasoning_details=[{text:'PRIVATE_REASONING'}];}},
  {frames:f=>{f[1].error={message:'PRIVATE_ERROR'};}},
  {frames:f=>{f[1].usage=usage();}},
  {frames:f=>{f.push({...f[4]});}},
  {frames:f=>{f[4].usage.cost=0.000009;}},
  {frames:f=>{f[4].usage.completion_tokens_details.reasoning_tokens=21;}},
  {frames:f=>{f[4].usage.completion_tokens=701;}},
  {frames:f=>{f[4].usage.prompt_tokens=11025;}},
  {frames:f=>{f[4].usage.prompt_tokens_details.cached_tokens=41;}},
  {frames:f=>{f[4].usage.total_tokens=61;}},
  {frames:f=>{f[4].usage.completion_tokens_details.hidden_tokens=0;}},
 ];
 for(const options of cases){const f=fixture(options);await assert.rejects(run(f),e=>e.code==='outcome_unknown');await assert.rejects(run(f),e=>e.code==='not_admitted');assert.deepEqual(f.counts,{claims:1,posts:1});}
 assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|synthetic-secret|TEST MCU|Bearer/);
});

test('endpoint, privacy, admission and final source fences deny dispatch; only valid-receipt RAG output gets response_rejected',async()=>{
 for(const options of [
  {endpoint:e=>{e.name='Unverified';}},{endpoint:e=>{e.pricing.prompt='0.000000076';}},
  {endpoint:e=>{e.pricing.request='0.01';}},{endpoint:e=>{e.supports_implicit_caching=false;}},
  {endpoint:e=>{e.model_id='unverified';}},{endpoint:e=>{e.pricing.input_cache_read='0.000000038';}},
  {endpoint:e=>{e.supported_parameters=[];}},{extraEndpoints:[{tag:'groq/other'}]},{zdr:{safety_retention:true}},
  {claim:false},{policy:async()=>false},{dispatch:()=>false},
 ]){const f=fixture(options);await assert.rejects(run(f),e=>e.code==='not_admitted');assert.equal(f.counts.posts,0);}
 const denied=fixture();await assert.rejects(run(denied,input(),async()=>false),e=>e.code==='not_admitted');assert.deepEqual(denied.counts,{claims:1,posts:0});
 const oversized=fixture();await assert.rejects(run(oversized,{question:'q',passages:[{rank:1,text:'界'.repeat(5000)}]}),e=>e.code==='not_admitted');assert.equal(oversized.counts.claims,0);
 for(const evaluation of [
  value=>({...value,extra:'PRIVATE_EXTRA'}),value=>({...value,evidence:[{id:'unknown-id',reason:'PRIVATE_REASON'}]}),
  value=>({...value,answer:value.answer+' [S1]'}),value=>({...value,evidence:[{...value.evidence[0],reason:'r'.repeat(501)}]}),
 ]){const f=fixture({evaluation});await assert.rejects(run(f),e=>e.code==='response_rejected');assert.deepEqual(f.counts,{claims:1,posts:1});assert.equal(f.observations[0].stage,'response_rejected');}
 const duplicate=fixture({evaluation:value=>({...value,evidence:[value.evidence[0],value.evidence[0]]})});assert.equal((await run(duplicate)).evaluation.evidence.length,1);
 const refusal=fixture({evaluation:()=>({answer:'PRIVATE_UNSUPPORTED_REFUSAL',evidence:[]})});assert.deepEqual((await run(refusal)).evaluation,{answer:'',evidence:[]});
 for(const [httpStatus,code]of [[429,'rate_limited'],[500,'outcome_unknown']]){const f=fixture({httpStatus});await assert.rejects(run(f),e=>e.code===code);assert.equal(f.counts.posts,1);}
});

test('direct chat trims whole oldest history pairs, signs exact immutable wire and retains latest correction without RAG context',async()=>{
 const value={question:'What is my saved word?',history:Array.from({length:6},(_,i)=>({question:`Question ${i} `+'q'.repeat(250),answer:`Answer ${i} `+'a'.repeat(1300)}))};
 value.history[5]={question:'Use panda instead.',answer:'The saved word is panda.'};const snapshot=structuredClone(value);
 const f=fixture({direct:true,onMetadata:()=>{value.question='MUTATED';value.history[5].answer='MUTATED';}});
 const result=await run(f,value);assert.deepEqual(result,{answer:'Your saved word is panda.',usage:{inputTokens:40,outputTokens:20,costNanoUsd:8625}});
 const messages=f.wire.messages;assert.equal(messages.at(-1).content,snapshot.question);assert.deepEqual(messages.slice(-3,-1),[
  {role:'user',content:snapshot.history[5].question},{role:'assistant',content:snapshot.history[5].answer},
 ]);assert.ok(messages.length<14);assert.equal(messages.length%2,0);assert.equal(messages[0].role,'system');
 const retained=messages.slice(1,-1);for(let i=0;i<retained.length;i+=2){assert.equal(retained[i].role,'user');assert.equal(retained[i+1].role,'assistant');}
 assert.ok(Buffer.byteLength(JSON.stringify(f.wire),'utf8')<=7000);assert.equal(f.fingerprint,createHash('sha256').update(JSON.stringify(f.wire)).digest('hex'));
 assert.deepEqual(f.wire.response_format.json_schema.schema,{type:'object',additionalProperties:false,required:['answer'],properties:{answer:{type:'string'}}});
 assert.doesNotMatch(JSON.stringify(f.wire),/MUTATED|source excerpt|grounded_answer/);
 await assert.rejects(run(f,value),e=>e.code==='not_admitted');assert.deepEqual(f.counts,{claims:1,posts:1});
 const invalid=fixture({direct:true,evaluation:()=>({answer:'',extra:'PRIVATE'})});await assert.rejects(run(invalid,{question:'Hello'}),e=>e.code==='outcome_unknown');
 const large=fixture({direct:true});await assert.rejects(run(large,{question:'界'.repeat(2000)}),e=>e.code==='not_admitted');assert.deepEqual(large.counts,{claims:0,posts:0});
});
