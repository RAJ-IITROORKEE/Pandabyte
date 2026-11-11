import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedOutputTokens, approvedHostedEndpoint, validateHostedUsage, hostedResearchModels, hostedResearchModel, approvedHostedResearchEndpoint, validateHostedResearchUsage, researchMaxInput } from '../src/server/hosted-model-policy.ts';

const endpoint=()=>({tag:'groq',model_id:'openai/gpt-oss-20b',name:'Groq | openai/gpt-oss-20b',provider_name:'Groq',status:0,pricing:{prompt:'0.000000075',completion:'0.0000003',input_cache_read:'0.0000000375',discount:0},context_length:131072,max_completion_tokens:65536,max_prompt_tokens:null,supports_implicit_caching:true,supports_tool_choice:{none:true},supported_parameters:['reasoning','include_reasoning','max_tokens','response_format','tool_choice']});
const catalog=e=>({data:{id:'openai/gpt-oss-20b',architecture:{tokenizer:'GPT'},endpoints:[e]}});
const zdr={data:[{model_id:'openai/gpt-oss-20b',tag:'groq',safety_retention:false}]};
const usage=()=>({prompt_tokens:40,completion_tokens:20,total_tokens:60,cost:0.000008625,prompt_tokens_details:{cached_tokens:10,cache_write_tokens:0},completion_tokens_details:{reasoning_tokens:8}});

test('pure hosted policy preserves pinned endpoint privacy, exact prices and token capacity',()=>{
  assert.equal(approvedHostedEndpoint(catalog(endpoint()),zdr,16000),'max_tokens');
  for(const mutate of [e=>{e.tag='groq/other';},e=>{e.pricing.prompt='0.000000076';},e=>{e.pricing.request='0';},e=>{e.supports_implicit_caching=false;},e=>{e.supports_tool_choice.none=false;},e=>{e.context_length=16699;},e=>{e.max_completion_tokens=699;},e=>{e.max_prompt_tokens=15999;},e=>{e.supported_parameters=[];}]){const e=endpoint();mutate(e);assert.equal(approvedHostedEndpoint(catalog(e),zdr,16000),null);}
  assert.equal(approvedHostedEndpoint({...catalog(endpoint()),data:{...catalog(endpoint()).data,endpoints:[endpoint(),endpoint()]}},zdr,16000),null);
  assert.equal(approvedHostedEndpoint(catalog(endpoint()),{data:[{...zdr.data[0],safety_retention:true}]},16000),null);
});
test('pure usage policy preserves decimal rounding, reasoning and cached counts',()=>{
  assert.equal(hostedOutputTokens,700);
  assert.deepEqual(validateHostedUsage(usage(),16000,1410001),{usage:{inputTokens:40,outputTokens:20,costNanoUsd:8625},reasoningTokens:8,cachedTokens:10});
  assert.equal(validateHostedUsage({...usage(),cost:1e-10},16000,1410001).usage.costNanoUsd,1);
  assert.equal(validateHostedUsage({...usage(),cost:0},16000,1410001).usage.costNanoUsd,0);
  assert.equal(validateHostedUsage({prompt_tokens:16000,completion_tokens:700,cost:0.001410001},16000,1410001).usage.costNanoUsd,1410001);
});
test('invalid usage throws only a generic bounded error and retains every prior guard',()=>{
  const bad=[{prompt_tokens:16001},{completion_tokens:701},{prompt_tokens:1.5},{cost:0.000009},{cost:NaN},{cost:-1},{total_tokens:61},{prompt_tokens_details:{cached_tokens:41}},{prompt_tokens_details:{cached_tokens:30,cache_write_tokens:11}},{prompt_tokens_details:{audio_tokens:1}},{completion_tokens_details:{reasoning_tokens:21}},{completion_tokens_details:{hidden_tokens:0}},{completion_tokens_details:{audio_tokens:1}}];
  for(const change of bad)assert.throws(()=>validateHostedUsage({...usage(),...change},16000,1410001),error=>error instanceof Error&&error.name==='Error'&&!/PRIVATE|prompt_tokens|cost/.test(error.message));
  assert.throws(()=>validateHostedUsage(usage(),16000,8000));
});

// ---- C3 hosted research allowlist ----
const params=out=>['reasoning','include_reasoning',out,'tools','tool_choice','response_format','seed'];
const overrides=extra=>[{min_prompt_tokens:272000,prompt:'0.1',completion:'0.2',input_cache_read:'0.01',input_cache_write:'0.2',...extra}];
// Independent catalog captures (11 November 2026), not derived from descriptors.
const facts={
  'openai/gpt-6-luna':{tag:'azure/us',name:'Azure | openai/gpt-6-luna-20260922',provider:'Azure',tokenizer:'GPT',out:'max_completion_tokens',pricing:{prompt:'0.00000011',completion:'0.00000055',web_search:'0.01',input_cache_read:'0.000000011',input_cache_write:'0.0000001375',discount:0},overrides:overrides(),ctx:1050000,reservation:4785001,rates:{prompt:1100,completion:5500,cacheRead:110,cacheWrite:1375,cacheWrite1h:0},maxPrice:{prompt:0.11,completion:0.55,request:0,image:0},reported:['openai/gpt-6-luna','openai/gpt-6-luna-20260922'],reasoning:'low',history:40},
  'openai/gpt-6.1-terra':{tag:'azure/us',name:'Azure | openai/gpt-6.1-terra-20261026',provider:'Azure',tokenizer:'GPT',out:'max_completion_tokens',pricing:{prompt:'0.0000011',completion:'0.0000055',web_search:'0.01',input_cache_read:'0.000000055',input_cache_write:'0.000001375',discount:0},overrides:overrides(),ctx:1050000,reservation:47850001,rates:{prompt:11000,completion:55000,cacheRead:550,cacheWrite:13750,cacheWrite1h:0},maxPrice:{prompt:1.1,completion:5.5,request:0,image:0},reported:['openai/gpt-6.1-terra','openai/gpt-6.1-terra-20261026'],reasoning:'low',history:40},
  'anthropic/claude-haiku-5.5':{tag:'amazon-bedrock',name:'Amazon Bedrock | anthropic/claude-haiku-5.5-20261007',provider:'Amazon Bedrock',tokenizer:'Claude',out:'max_tokens',pricing:{prompt:'0.0000001',completion:'0.0000005',web_search:'0.01',input_cache_read:'0.00000001',input_cache_write:'0.000000125',input_cache_write_1h:'0.0000002',discount:0},overrides:overrides({input_cache_write_1h:'0.000001'}),ctx:1000000,reservation:6750001,rates:{prompt:1000,completion:5000,cacheRead:100,cacheWrite:1250,cacheWrite1h:2000},maxPrice:{prompt:0.1,completion:0.5,request:0,image:0},reported:['anthropic/claude-haiku-5.5','anthropic/claude-haiku-5.5-20261007'],reasoning:'disabled',history:null},
};
const rEndpoint=id=>{const f=facts[id];return {tag:f.tag,model_id:id,name:f.name,provider_name:f.provider,status:0,pricing:{...f.pricing,overrides:structuredClone(f.overrides)},context_length:f.ctx,max_completion_tokens:128000,max_prompt_tokens:null,supports_implicit_caching:false,supports_tool_choice:{none:true,auto:true,required:true,function:true},supported_parameters:params(f.out)};};
const rCatalog=(id,e=rEndpoint(id),extra=[])=>({data:{id,architecture:{tokenizer:facts[id].tokenizer},endpoints:[...extra,e]}});
const rZdr=(id,row={})=>({data:[{model_id:id,tag:facts[id].tag,safety_retention:false,...row}]});
const researchIds=Object.keys(facts);

test('hosted research descriptors pin exact catalog facts, tenths rates and R1 reservations',()=>{
  assert.equal(researchMaxInput,16000);
  const legacy=hostedResearchModels['openai/gpt-oss-20b'];
  assert.equal(legacy.legacy,true);assert.equal(legacy.reservationNanoUsd,1410001);assert.equal(legacy.maxInput,16000);assert.equal(legacy.wireMax,14000);assert.equal(legacy.endpointTag,'groq');assert.equal(legacy.providerName,'Groq');assert.equal(legacy.outputParam,'max_tokens');assert.equal(legacy.historyIdMax,40);assert.deepEqual(legacy.reportedModels,['openai/gpt-oss-20b']);
  assert.deepEqual(legacy.rates,{prompt:750,completion:3000,cacheRead:375,cacheWrite:0,cacheWrite1h:0});assert.deepEqual(legacy.maxPrice,{prompt:0.075,completion:0.3,request:0,image:0});
  for(const id of researchIds){
    const d=hostedResearchModels[id],f=facts[id];
    assert.equal(hostedResearchModel(id),d);assert.equal(d.id,id);assert.equal(d.legacy,false);assert.equal(d.endpointTag,f.tag);assert.equal(d.providerName,f.provider);assert.equal(d.endpointName,f.name);assert.equal(d.tokenizer,f.tokenizer);assert.equal(d.outputParam,f.out);assert.equal(d.reasoning,f.reasoning);assert.equal(d.historyIdMax,f.history);
    assert.deepEqual(d.reportedModels,f.reported);assert.deepEqual(d.rates,f.rates);assert.deepEqual(d.maxPrice,f.maxPrice);assert.equal(d.reservationNanoUsd,f.reservation);assert.deepEqual({...d.pricing},f.pricing);
    assert.deepEqual([...d.pricingKeys],[...Object.keys(f.pricing),'overrides']);assert.ok(d.overrideKeys.includes('min_prompt_tokens'));assert.equal(Object.isFrozen(d),true);assert.equal(Object.isFrozen(d.rates),true);assert.equal(Object.isFrozen(d.pricing),true);
  }
  assert.ok(hostedResearchModels['anthropic/claude-haiku-5.5'].overrideKeys.includes('input_cache_write_1h'));
  for(const bad of [undefined,null,'',7,'openai/gpt-6','__proto__','toString','constructor','OPENAI/GPT-6-LUNA'])assert.equal(hostedResearchModel(bad),null);
});
test('GPT-OSS golden endpoint/usage values are unchanged through the legacy descriptor',()=>{
  const legacy=hostedResearchModels['openai/gpt-oss-20b'];
  assert.equal(approvedHostedResearchEndpoint(legacy,catalog(endpoint()),zdr),'max_tokens');assert.equal(approvedHostedResearchEndpoint(legacy,catalog({...endpoint(),pricing:{...endpoint().pricing,prompt:'0.000000076'}}),zdr),null);
  assert.deepEqual(validateHostedResearchUsage(legacy,usage()),{usage:{inputTokens:40,outputTokens:20,costNanoUsd:8625},reasoningTokens:8,cachedTokens:10});
  assert.deepEqual(validateHostedResearchUsage(legacy,{prompt_tokens:16000,completion_tokens:700,cost:0.001410001}),{usage:{inputTokens:16000,outputTokens:700,costNanoUsd:1410001},reasoningTokens:0,cachedTokens:0});
  // Golden captured from the C2 working tree before C3 edits.
  assert.deepEqual(validateHostedUsage({prompt_tokens:100,completion_tokens:10,cost:0.0000001,prompt_tokens_details:{cached_tokens:100}},16000,1410001),{usage:{inputTokens:100,outputTokens:10,costNanoUsd:100},reasoningTokens:0,cachedTokens:100});
  // The cached-token discount is retained for GPT-OSS: one nano above the discounted maximum fails.
  assert.throws(()=>validateHostedResearchUsage(legacy,{prompt_tokens:100,completion_tokens:10,cost:0.000006752,prompt_tokens_details:{cached_tokens:100}}));
  assert.equal(validateHostedResearchUsage(legacy,{prompt_tokens:100,completion_tokens:10,cost:0.000006751,prompt_tokens_details:{cached_tokens:100}}).usage.costNanoUsd,6751);
  assert.throws(()=>validateHostedResearchUsage(legacy,{prompt_tokens:16000,completion_tokens:700,cost:0.001410002}));
});
for(const id of researchIds)test('exact-tag approval for '+id+' accepts the verified endpoint and rejects every drift',()=>{
  const f=facts[id],m=hostedResearchModels[id];
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id),rZdr(id)),f.out);
  // Differently tagged rows (e.g. regional variants) never count; only the exact tag does.
  const other={...rEndpoint(id),tag:f.tag+'/other'};
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id,rEndpoint(id),[other]),{data:[...rZdr(id).data,{model_id:id,tag:f.tag+'/other',safety_retention:true}]}),f.out);
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id),{data:[]}),null);
  const foreign={...rCatalog(id),data:{...rCatalog(id).data,id:id+'-foreign'}};assert.equal(approvedHostedResearchEndpoint(m,foreign,rZdr(id)),null);
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id),rZdr(id,{safety_retention:true})),null);
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id),rZdr(id,{safety_retention:undefined})),null);
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id),{data:[...rZdr(id).data,...rZdr(id).data]}),null);
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id,rEndpoint(id),[rEndpoint(id)]),rZdr(id)),null);
  assert.equal(approvedHostedResearchEndpoint(m,catalog(endpoint()),rZdr(id)),null);
  assert.equal(approvedHostedResearchEndpoint(m,{data:{...rCatalog(id).data,architecture:{tokenizer:f.tokenizer==='GPT'?'Claude':'GPT'}}},rZdr(id)),null);
  assert.equal(approvedHostedResearchEndpoint(m,{data:{...rCatalog(id).data,endpoints:null}},rZdr(id)),null);
  assert.equal(approvedHostedResearchEndpoint(m,null,rZdr(id)),null);assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id),null),null);
  const rejections={
    tag:e=>{e.tag=f.tag+'/other';},name:e=>{e.name='Other | x';},provider:e=>{e.provider_name='Other';},model:e=>{e.model_id='openai/other';},status:e=>{e.status=1;},caching:e=>{e.supports_implicit_caching=true;},cachingMissing:e=>{delete e.supports_implicit_caching;},
    unknownPricing:e=>{e.pricing.request='0';},missingPricing:e=>{delete e.pricing.web_search;},discount:e=>{e.pricing.discount=0.1;},noOverrides:e=>{delete e.pricing.overrides;},emptyOverrides:e=>{e.pricing.overrides=[];},
    overrideThreshold:e=>{e.pricing.overrides[0].min_prompt_tokens=32000;},overrideLow:e=>{e.pricing.overrides[0].min_prompt_tokens=1000;},overrideKey:e=>{e.pricing.overrides[0].surprise='1';},overrideType:e=>{e.pricing.overrides[0].min_prompt_tokens='272000';},
    ctx:e=>{e.context_length=32699;},maxCompletion:e=>{e.max_completion_tokens=699;},maxPrompt:e=>{e.max_prompt_tokens=31999;},maxPromptType:e=>{e.max_prompt_tokens='x';},
    none:e=>{e.supports_tool_choice.none=false;},auto:e=>{e.supports_tool_choice.auto=false;},toolChoice:e=>{delete e.supports_tool_choice;},noParams:e=>{e.supported_parameters=null;},
  };
  for(const key of ['reasoning','include_reasoning',f.out,'tools','tool_choice','response_format'])rejections['no_'+key]=e=>{e.supported_parameters=e.supported_parameters.filter(p=>p!==key);};
  for(const k of Object.keys(f.pricing).filter(k=>k!=='discount'))rejections['price_'+k]=e=>{e.pricing[k]=String(Number(e.pricing[k])*1.01);};
  for(const [name,mutate] of Object.entries(rejections)){const e=rEndpoint(id);mutate(e);assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id,e),rZdr(id)),null,name);}
  // The other family's output parameter is not enough on its own.
  const swapped=rEndpoint(id);swapped.supported_parameters=swapped.supported_parameters.filter(p=>p!==f.out).concat(f.out==='max_tokens'?['max_completion_tokens']:['max_tokens']);
  assert.equal(approvedHostedResearchEndpoint(m,rCatalog(id,swapped),rZdr(id)),null);
});
const researchUsage=(extra={})=>({prompt_tokens:40,completion_tokens:20,total_tokens:60,cost:0.00001,prompt_tokens_details:{cached_tokens:10,cache_write_tokens:2},completion_tokens_details:{reasoning_tokens:8},...extra});
for(const id of researchIds)test('research usage for '+id+' accepts cache reads/writes and bounds cost exactly with the reservation cap',()=>{
  const m=hostedResearchModels[id],r=m.rates,rate=Math.max(r.prompt,r.cacheWrite,r.cacheWrite1h);
  assert.deepEqual(validateHostedResearchUsage(m,researchUsage()),{usage:{inputTokens:40,outputTokens:20,costNanoUsd:10000},reasoningTokens:8,cachedTokens:10});
  const bound=(p,c)=>Math.ceil((p*rate+c*r.completion)/10)+1;
  for(const [p,c] of [[40,20],[1,0],[0,1],[1000,300]]){
    const b=bound(p,c);assert.equal(validateHostedResearchUsage(m,{prompt_tokens:p,completion_tokens:c,cost:b/1e9}).usage.costNanoUsd,b);
    assert.throws(()=>validateHostedResearchUsage(m,{prompt_tokens:p,completion_tokens:c,cost:(b+1)/1e9}),/invalid_hosted_usage/);
  }
  assert.equal(m.maxInput,32000);assert.equal(m.wireMax,48000);assert.equal(bound(32000,700),m.reservationNanoUsd);
  assert.equal(validateHostedResearchUsage(m,{prompt_tokens:32000,completion_tokens:700,cost:m.reservationNanoUsd/1e9}).usage.costNanoUsd,m.reservationNanoUsd);
  assert.throws(()=>validateHostedResearchUsage(m,{prompt_tokens:32000,completion_tokens:700,cost:(m.reservationNanoUsd+1)/1e9}));
  const bad=[{prompt_tokens:32001},{completion_tokens:701},{prompt_tokens:1.5},{cost:NaN},{cost:-1},{total_tokens:61},{prompt_tokens_details:{cached_tokens:41}},{prompt_tokens_details:{cached_tokens:30,cache_write_tokens:11}},{prompt_tokens_details:{cache_write_tokens:41}},{prompt_tokens_details:{audio_tokens:1}},{prompt_tokens_details:{video_tokens:1}},...(m.vision?[]:[{prompt_tokens_details:{image_tokens:1}}]),{completion_tokens_details:{audio_tokens:1}},{completion_tokens_details:{image_tokens:1}},{completion_tokens_details:{reasoning_tokens:21}},{completion_tokens_details:{hidden_tokens:0}},{cost:0.1}];
  for(const change of bad)assert.throws(()=>validateHostedResearchUsage(m,researchUsage(change)),e=>e instanceof Error&&e.message==='invalid_hosted_usage');
  assert.throws(()=>validateHostedResearchUsage(m,null));
});
test('Haiku 1h cache-write reporting is covered by the bound and writes never under-bound',()=>{
  const m=hostedResearchModels['anthropic/claude-haiku-5.5'];
  assert.equal(validateHostedResearchUsage(m,{prompt_tokens:1000,completion_tokens:0,cost:0.0002,prompt_tokens_details:{cache_write_tokens:1000}}).usage.costNanoUsd,200000);
  assert.throws(()=>validateHostedResearchUsage(m,{prompt_tokens:1000,completion_tokens:0,cost:0.000201,prompt_tokens_details:{cache_write_tokens:1000}}));
});

// ---- C4 image_tokens usage (S4) ----
const imageUsage=(n,where='prompt')=>({prompt_tokens:3000,completion_tokens:100,total_tokens:3100,cost:0.0001,...(where==='prompt'?{prompt_tokens_details:{cached_tokens:0,image_tokens:n}}:{completion_tokens_details:{image_tokens:n}})});
for(const id of ['openai/gpt-6-luna','openai/gpt-6.1-terra','anthropic/claude-haiku-5.5'])test('image_tokens are accepted in prompt details only, bounded by prompt_tokens, for vision model '+id,()=>{
  const m=hostedResearchModels[id];assert.equal(m.vision,true);
  assert.equal(validateHostedResearchUsage(m,imageUsage(1200)).usage.inputTokens,3000);
  assert.equal(validateHostedResearchUsage(m,imageUsage(0)).usage.inputTokens,3000);
  assert.equal(validateHostedResearchUsage(m,imageUsage(3000)).usage.inputTokens,3000);
  assert.throws(()=>validateHostedResearchUsage(m,imageUsage(3001)));
  assert.throws(()=>validateHostedResearchUsage(m,imageUsage(-1)));
  assert.throws(()=>validateHostedResearchUsage(m,imageUsage(1.5)));
  assert.throws(()=>validateHostedResearchUsage(m,imageUsage('1')));
  assert.throws(()=>validateHostedResearchUsage(m,imageUsage(5,'completion')));
  assert.equal(validateHostedResearchUsage(m,imageUsage(0,'completion')).usage.outputTokens,100);
  // Other prompt-detail keys stay rejected when non-zero.
  assert.throws(()=>validateHostedResearchUsage(m,{...imageUsage(1),prompt_tokens_details:{image_tokens:1,video_tokens:1}}));
});
test('image_tokens in prompt details are rejected for GPT-OSS and the legacy validator',()=>{
  const legacy=hostedResearchModels['openai/gpt-oss-20b'];assert.equal(legacy.vision,false);
  assert.throws(()=>validateHostedResearchUsage(legacy,imageUsage(1)));
  assert.throws(()=>validateHostedUsage(imageUsage(1),16000,1410001));
  assert.throws(()=>validateHostedResearchUsage(legacy,imageUsage(0)));
});
