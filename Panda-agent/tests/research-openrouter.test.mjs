import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createResearchOpenRouter } from '../src/server/research-openrouter.ts';
import { hashResearchValue } from '../src/opencode/research-provider-gateway.ts';
import { researchSearchMCP, verifyResearchSearchFixtureAnswer } from '../src/server/research-search-broker.ts';
import { hostedTavilyRequestHash } from '../src/search/tavily.ts';
import { researchProfileSelection } from '../runtime/opencode/research-profile.mjs';
import { hostedResearchModel, researchMaxInput } from '../src/server/hosted-model-policy.ts';
import { researchImageMaxUrl, researchImagePlaceholder } from '../src/opencode/research-image-binding.ts';

const sha=text=>createHash('sha256').update(text).digest('hex'),signal=()=>new AbortController().signal;
const model='openai/gpt-oss-20b',toolName='panda_research_search',identity={id:'gen-SYNTHETIC_ONLY',model,provider:'Groq'};
const native=()=>({model,stream:true,max_completion_tokens:700,stream_options:{include_usage:true},parallel_tool_calls:true,temperature:0.5,messages:[{role:'system',content:'Only public fixture docs.'},{role:'user',content:'RP2040 PIO official docs'}],tools:[{type:'function',function:{name:toolName,description:'Search public docs',parameters:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:400}},required:['query'],additionalProperties:false},strict:false}}]});
const usage=()=>({prompt_tokens:40,completion_tokens:20,total_tokens:60,cost:0.000008625,prompt_tokens_details:{cached_tokens:10,cache_write_tokens:2},completion_tokens_details:{reasoning_tokens:8},cost_details:{upstream_inference_cost:0.000008625},is_byok:false});
const endpoint=()=>({tag:'groq',model_id:model,name:'Groq | '+model,provider_name:'Groq',status:0,pricing:{prompt:'0.000000075',completion:'0.0000003',input_cache_read:'0.0000000375',discount:0},context_length:131072,max_completion_tokens:65536,max_prompt_tokens:null,supports_implicit_caching:true,supports_tool_choice:{none:true,auto:true},supported_parameters:['reasoning','include_reasoning','max_tokens','response_format','tool_choice','tools']});
const finalFrames=()=>[{...identity,choices:[{index:0,delta:{role:'assistant',content:'Synthetic 🐼 answer.'},finish_reason:'stop'}]},{...identity,choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:'stop'}],usage:usage()}];
const toolFrames=()=>[{...identity,choices:[{index:0,delta:{role:'assistant',content:'Checking public docs.',tool_calls:[{index:0,id:'call-1',type:'function',function:{name:toolName,arguments:'{"query":"RP2040 '}}]},finish_reason:null}]},{...identity,choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'PIO docs"}'}}]},finish_reason:'tool_calls'}]},{...identity,choices:[],usage:usage()}];
function fixture(overrides={}){
  const calls=[],observations=[],counts={posts:0,grants:0};let current=true;
  const options={apiKey:'SYNTHETIC_SECRET_ONLY',workspaceSha256:sha('synthetic-workspace'),privacyProfileHash:'a'.repeat(64),nativeProfileHash:'b'.repeat(64),policyCurrent:async()=>current,dispatchCurrent:()=>current,observe:o=>{observations.push(o);if(overrides.observerThrows)throw Error('PRIVATE_OBSERVER');}};
  options.fetcher=async(url,init)=>{
    calls.push({url,init});
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');assert.ok(init.signal instanceof AbortSignal);
    if(url.endsWith('/key')){assert.equal(new Headers(init.headers).get('authorization'),'Bearer SYNTHETIC_SECRET_ONLY');return Response.json({data:{workspace_id:overrides.workspace??'synthetic-workspace'}});}
    if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:model,tag:'groq',safety_retention:overrides.retention??false}]});
    if(url.endsWith('/endpoints')){const e=endpoint();overrides.endpoint?.(e);return Response.json({data:{id:model,architecture:{tokenizer:'GPT'},endpoints:[e]}});}
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(init.method,'POST');counts.posts++;assert.equal(counts.grants,1);
    if(overrides.onPost)return overrides.onPost(init);
    if(overrides.status)return Response.json({error:'PRIVATE_PROVIDER_ERROR'},{status:overrides.status});
    const frames=(overrides.tools?toolFrames:finalFrames)();overrides.frames?.(frames);
    let raw=': synthetic heartbeat\r\n\r\n'+frames.map(frame=>'data: '+JSON.stringify(frame)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n';overrides.raw?.(raw);if(overrides.stream)raw=overrides.stream(raw);
    let bytes=Buffer.from(raw);if(overrides.bytes)bytes=overrides.bytes(bytes);
    let offset=0;return new Response(new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+(overrides.chunkSize??7),bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end;}}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
  };
  const adapter=createResearchOpenRouter({...options,...overrides.options});
  return {adapter,options,calls,observations,counts,revoke:()=>{current=false;},before:async()=>{counts.grants++;return true;}};
}
const complete=async(f,body=native(),s=signal())=>f.adapter.complete(await f.adapter.prepare(body,s),f.before,s);
const notSent=e=>e.outcome==='not_sent'&&e.message==='not_sent';
const unknown=e=>e.outcome==='unknown'&&e.message==='unknown';

test('preparation fixes external privacy/wire policy, authenticates workspace and freezes full native identity',async()=>{
  const f=fixture(),body=native(),snapshot=structuredClone(body),prepared=await f.adapter.prepare(body,signal());body.messages[1].content='MUTATED';
  assert.deepEqual(Object.keys(prepared).sort(),['nativeRequestHash','policyHash','wireRequestHash']);assert.equal(Object.isFrozen(prepared),true);assert.equal(prepared.nativeRequestHash,hashResearchValue(snapshot));assert.equal(f.counts.posts,0);assert.equal(f.calls.length,3);
  const result=await f.adapter.complete(prepared,f.before,signal()),post=f.calls.find(c=>c.init.method==='POST'),wire=JSON.parse(post.init.body);
  assert.deepEqual(Object.keys(wire).sort(),['include_reasoning','max_tokens','messages','model','plugins','provider','reasoning','stream','stream_options','tool_choice','tools','usage']);
  assert.deepEqual(wire.messages,snapshot.messages);assert.deepEqual(wire.tools,snapshot.tools);assert.equal(wire.model,model);assert.equal(wire.max_tokens,700);assert.equal(wire.max_completion_tokens,undefined);assert.equal(wire.parallel_tool_calls,undefined);assert.equal(wire.temperature,undefined);assert.equal(wire.tool_choice,'auto');assert.equal(wire.response_format,undefined);
  assert.deepEqual(wire.provider,{only:['groq'],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{prompt:0.075,completion:0.3,request:0,image:0}});assert.deepEqual(wire.reasoning,{effort:'low',exclude:true});assert.equal(wire.include_reasoning,false);assert.deepEqual(wire.plugins,[]);assert.deepEqual(wire.usage,{include:true});assert.equal(new Headers(post.init.headers).get('x-openrouter-cache'),'false');assert.equal(prepared.wireRequestHash,sha(post.init.body));assert.equal(result.receipt.nativeRequestHash,prepared.nativeRequestHash);
});
test('fragmented UTF8 stop stream verifies exact cost/hidden counts and strips arbitrary metadata',async()=>{
  const f=fixture({observerThrows:true}),result=await complete(f);
  assert.equal(result.content,'Synthetic 🐼 answer.');assert.deepEqual(result.usage,{inputTokens:40,outputTokens:20,costNanoUsd:8625});assert.equal(result.receipt.reasoningTokens,8);assert.equal(result.receipt.cachedTokens,10);assert.equal(result.receipt.generationId,identity.id);assert.equal(result.receipt.usageReceipt.cost_details,undefined);assert.equal(result.receipt.usageReceipt.is_byok,undefined);assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
  assert.ok(result.receipt.timing.metadataMs>=0&&result.receipt.timing.providerMs>=0&&result.receipt.timing.totalMs>=0);assert.ok(result.receipt.timing.firstDeltaMs>=0);assert.doesNotMatch(JSON.stringify(f.observations),/SYNTHETIC_SECRET|RP2040|Checking|Synthetic|gen-SYNTHETIC|workspace/);
});
test('tool arguments assemble across indexed deltas with optional preamble and verified usage',async()=>{
  const f=fixture({tools:true}),result=await complete(f);assert.equal(result.content,'Checking public docs.');assert.deepEqual(result.toolCalls,[{id:'call-1',name:toolName,arguments:{query:'RP2040 PIO docs'}}]);assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
});
test('four interleaved native calls preserve index order and unique IDs',async()=>{
  const f=fixture({tools:true,frames:frames=>{frames[0].choices[0].delta.tool_calls=Array.from({length:4},(_,index)=>({index,id:'call-'+index,type:'function',function:{name:toolName,arguments:'{"query":"RP2040 '}}));frames[1].choices[0].delta.tool_calls=Array.from({length:4},(_,i)=>({index:3-i,function:{arguments:'PIO docs"}'}}));}}),result=await complete(f);
  assert.deepEqual(result.toolCalls.map(c=>c.id),['call-0','call-1','call-2','call-3']);
});
test('prepared work cannot be forged, shared between factories, altered, or used twice',async()=>{
  const f=fixture(),prepared=await f.adapter.prepare(native(),signal());assert.throws(()=>{prepared.policyHash='c'.repeat(64);},TypeError);
  await assert.rejects(f.adapter.complete({...prepared},f.before,signal()),notSent);
  const foreign=fixture();await assert.rejects(foreign.adapter.complete(prepared,foreign.before,signal()),notSent);assert.equal(foreign.counts.posts,0);
  await f.adapter.complete(prepared,f.before,signal());await assert.rejects(f.adapter.complete(prepared,f.before,signal()),notSent);assert.deepEqual(f.counts,{posts:1,grants:1});
});
test('factory snapshots key/profile/callback options and receipt verification works without preparation or network',async()=>{
  const f=fixture(),result=await complete(f);f.options.apiKey='MUTATED';f.options.workspaceSha256='c'.repeat(64);
  const recovered=fixture();const before=recovered.calls.length;assert.equal(recovered.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);assert.equal(recovered.calls.length,before);
  const other=fixture({options:{privacyProfileHash:'c'.repeat(64)}});assert.equal(other.adapter.verifyResult(result,result.receipt.nativeRequestHash),false);
  f.revoke();assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
});
test('malformed receipts, result changes, wrong hashes and hidden metadata never verify',async()=>{
  const f=fixture(),result=await complete(f);
  const changes=[r=>{r.content+='changed';},r=>{r.extra=true;},r=>{r.receipt.extra=true;},r=>{r.receipt.usageReceipt.extra=true;},r=>{r.receipt.nativeRequestHash='c'.repeat(64);},r=>{r.receipt.outputHash='c'.repeat(64);},r=>{r.receipt.policyHash='c'.repeat(64);},r=>{r.receipt.model='other';},r=>{r.receipt.provider='Other';},r=>{r.receipt.generationId='bad';},r=>{r.receipt.timing.totalMs=-1;},r=>{r.usage.costNanoUsd++;},r=>{r.receipt.reasoningTokens++;},r=>{r.receipt.cachedTokens++;},r=>{r.receipt.usageReceipt.cost=0.000009;}];
  for(const mutate of changes){const changed=structuredClone(result);mutate(changed);assert.equal(f.adapter.verifyResult(changed,result.receipt.nativeRequestHash),false);}
  assert.equal(f.adapter.verifyResult(result,'c'.repeat(64)),false);
});
test('metadata, workspace, currentness, key and body failures happen without inference admission',async()=>{
  for(const overrides of [{workspace:'foreign'},{retention:true},{endpoint:e=>{e.supports_tool_choice.auto=false;}},{endpoint:e=>{e.supported_parameters=e.supported_parameters.filter(p=>p!=='tools');}},{endpoint:e=>{e.pricing.prompt='0.000000076';}}]){const f=fixture(overrides);await assert.rejects(f.adapter.prepare(native(),signal()),notSent);assert.equal(f.counts.posts,0);assert.equal(f.counts.grants,0);}
  const f=fixture();f.revoke();await assert.rejects(f.adapter.prepare(native(),signal()),notSent);assert.equal(f.calls.length,0);
  for(const apiKey of ['', 'secret\r\nheader', '🐼'])assert.throws(()=>fixture({options:{apiKey}}),notSent);
  for(const b of [{...native(),model:'panda-fixture'},{...native(),provider:{}},{...native(),messages:[{role:'user',content:'x'.repeat(14000)}]}]){const x=fixture();await assert.rejects(x.adapter.prepare(b,signal()),notSent);assert.equal(x.counts.posts,0);}
});
test('metadata JSON must be bounded fatal UTF8 duplicate-free JSON with no redirects',async()=>{
  for(const response of [()=>new Response('{"data":{},"data":{}}',{headers:{'content-type':'application/json'}}),()=>new Response(Buffer.from([0xc0,0xaf]),{headers:{'content-type':'application/json'}}),()=>new Response(' '.repeat(4194305),{headers:{'content-type':'application/json'}}),()=>new Response('{}',{status:302,headers:{location:'https://example.com'}})]){
    const f=fixture({options:{fetcher:async()=>response()}});await assert.rejects(f.adapter.prepare(native(),signal()),notSent);
  }
});
test('metadata eligibility expires eight seconds after preparation without a send grant',async t=>{
  let tick=performance.now();t.mock.method(performance,'now',()=>tick);
  const f=fixture(),prepared=await f.adapter.prepare(native(),signal());tick+=8001;
  await assert.rejects(f.adapter.complete(prepared,f.before,signal()),notSent);assert.equal(f.counts.posts,0);assert.equal(f.counts.grants,0);
  const fresh=await f.adapter.prepare(native(),signal());assert.ok(await f.adapter.complete(fresh,f.before,signal()));
});
test('revocation, cancellation and refused grant before send cannot dispatch',async()=>{
  for(const kind of ['revoke','abort','grant']){const f=fixture(),abort=new AbortController(),prepared=await f.adapter.prepare(native(),signal());if(kind==='revoke')f.revoke();if(kind==='abort')abort.abort();await assert.rejects(f.adapter.complete(prepared,async()=>false,abort.signal),notSent);assert.equal(f.counts.posts,0);}
});
for(const kind of ['revoke','expire','abort'])test(kind+' during a successful grant prevents POST and stays unknown',async t=>{
  let tick=performance.now();t.mock.method(performance,'now',()=>tick);
  const f=fixture(),abort=new AbortController(),prepared=await f.adapter.prepare(native(),signal());
  await assert.rejects(f.adapter.complete(prepared,async()=>{f.counts.grants++;if(kind==='revoke')f.revoke();if(kind==='expire')tick+=8001;if(kind==='abort')abort.abort();return true;},abort.signal),unknown);
  assert.deepEqual(f.counts,{posts:0,grants:1});await assert.rejects(f.adapter.complete(prepared,f.before,signal()),notSent);
});
test('HTTP429, disconnect and abort after the physical grant stay unknown and cannot retry',async()=>{
  for(const status of [429,500]){const f=fixture({status}),prepared=await f.adapter.prepare(native(),signal());await assert.rejects(f.adapter.complete(prepared,f.before,signal()),unknown);await assert.rejects(f.adapter.complete(prepared,f.before,signal()),notSent);assert.deepEqual(f.counts,{posts:1,grants:1});}
  const abort=new AbortController(),f=fixture({onPost:()=>{abort.abort();throw Error('PRIVATE_DISCONNECT');}}),prepared=await f.adapter.prepare(native(),signal());await assert.rejects(f.adapter.complete(prepared,f.before,abort.signal),unknown);assert.deepEqual(f.counts,{posts:1,grants:1});
});
test('an interrupted or throwing durable grant cannot be labeled definitely not sent',async()=>{
  const f=fixture(),prepared=await f.adapter.prepare(native(),signal());
  await assert.rejects(f.adapter.complete(prepared,async()=>{throw Error('PRIVATE_GRANT_UNCERTAIN');},signal()),unknown);assert.equal(f.counts.posts,0);
  const g=fixture(),abort=new AbortController(),pending=await g.adapter.prepare(native(),signal());let entered,release;
  const reached=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const completion=g.adapter.complete(pending,async()=>{entered();await held;return true;},abort.signal);
  await reached;abort.abort();await assert.rejects(completion,unknown);release();assert.equal(g.counts.posts,0);
});
test('partial streams release no result and aborted body readers settle promptly as unknown',async()=>{
  const abort=new AbortController(),f=fixture({onPost:()=>new Response(new ReadableStream({start(){queueMicrotask(()=>abort.abort());}}),{headers:{'content-type':'text/event-stream'}})}),prepared=await f.adapter.prepare(native(),signal());await assert.rejects(f.adapter.complete(prepared,f.before,abort.signal),unknown);
});
test('invalid stop/usage/identity and unbounded or truncated SSE never yield a receipt',async()=>{
  const mutations=[f=>{f[0].choices[0].delta.reasoning_details=[{type:'reasoning.text',signature:'SYNTHETIC_SIGNATURE',format:'anthropic-claude-v1',index:0}];},f=>{f[0].model='other';},f=>{f[1].id='gen-OTHER';},f=>{f[1].provider='Other';},f=>{f[0].choices[0].index=1;},f=>{f[0].choices.push({...f[0].choices[0]});},f=>{f[0].choices[0].finish_reason='length';},f=>{f[1].choices[0].delta.content='late';},f=>{f[0].choices[0].delta.reasoning='PRIVATE';},f=>{f[0].choices[0].delta.function_call={};},f=>{f[1].usage.completion_tokens=701;},f=>{f[1].usage.total_tokens=61;},f=>{f[1].usage.cost=0.000009;},f=>{delete f[1].usage;},f=>{f.push(structuredClone(f[1]));}];
  for(const frames of mutations){const f=fixture({frames});await assert.rejects(complete(f),unknown);assert.equal(f.counts.posts,1);}
  {const f=fixture({frames:f=>{f[0].choices[0].delta.reasoning_details=[];}});const r=await complete(f);assert.equal(r.usage.inputTokens,40);}
  {const f=fixture({frames:f=>{f[0].choices[0].delta.reasoning_details=[{type:'reasoning.encrypted',data:'SYNTHETIC_OPAQUE',format:'openai-responses-v1',id:'rs_synthetic',index:0}];}});const r=await complete(f);assert.equal(r.usage.inputTokens,40);assert.ok(!JSON.stringify(r).includes('SYNTHETIC_OPAQUE'));}
  for(const details of [[{...{type:'reasoning.encrypted',data:'SYNTHETIC_OPAQUE',format:'openai-responses-v1',id:'rs_synthetic',index:0},type:'reasoning.text'}],[{...{type:'reasoning.encrypted',data:'SYNTHETIC_OPAQUE',format:'openai-responses-v1',id:'rs_synthetic',index:0},text:'visible'}],[{type:'reasoning.text',text:'visible',format:'x',index:0}],Array(5).fill({type:'reasoning.encrypted',data:'SYNTHETIC_OPAQUE',format:'openai-responses-v1',id:'rs_synthetic',index:0}),[{...{type:'reasoning.encrypted',data:'SYNTHETIC_OPAQUE',format:'openai-responses-v1',id:'rs_synthetic',index:0},data:1}]]){const f=fixture({frames:f=>{f[0].choices[0].delta.reasoning_details=details;}});await assert.rejects(complete(f),unknown);}
  for(const stream of [s=>s.replace('data: [DONE]\r\n\r\n',''),s=>s+'data: {}\r\n\r\n',s=>s+': late\r\n\r\n',s=>':'+'.'.repeat(512000)+'\r\n\r\n'+s]){const f=fixture({stream,chunkSize:1024});await assert.rejects(complete(f),unknown);}
  const f=fixture({bytes:b=>Buffer.concat([b.subarray(0,10),Buffer.from([255]),b.subarray(10)])});await assert.rejects(complete(f),unknown);
});
test('tool fragments reject foreign names, changed IDs, duplicate keys/IDs, extra calls and wrong terminal reasons',async()=>{
  const mutations=[f=>{f[0].choices[0].delta.tool_calls[0].function.name='shell';},f=>{f[1].choices[0].delta.tool_calls[0].id='call-changed';},f=>{f[0].choices[0].delta.tool_calls[0].function.arguments='{"query":"first","query":"';f[1].choices[0].delta.tool_calls[0].function.arguments='second"}';},f=>{f[0].choices[0].delta.tool_calls[0].index=4;},f=>{f[1].choices[0].finish_reason='stop';},f=>{f[2].choices=[{index:0,delta:{tool_calls:[]},finish_reason:'tool_calls'}];}];
  for(const frames of mutations){const f=fixture({tools:true,frames});await assert.rejects(complete(f),unknown);}
});
for(const tools of [false,true])test('usage cannot share the first '+(tools?'tool':'stop')+' terminal frame',async()=>{
  const f=fixture({tools,frames:frames=>{const footer=frames.pop();frames.at(-1).usage=footer.usage;}});
  await assert.rejects(complete(f),unknown);assert.equal(f.counts.posts,1);
});
test('a later empty repeated-terminal or choices-empty usage footer remains valid for stop and tools',async()=>{
  for(const tools of [false,true])for(const repeated of [false,true]){
    const f=fixture({tools,frames:frames=>{frames.at(-1).choices=repeated?[{index:0,delta:{role:'assistant',content:''},finish_reason:tools?'tool_calls':'stop'}]:[];}});
    const result=await complete(f);assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
  }
});

function manyFrameStream(targetBytes) {
  const chunks = Array.from({length:700}, (_, index) => ({...identity, choices:[{index:0,delta:{content:'x'},finish_reason:index===699?'stop':null}]}));
  const receipt = {...usage(),completion_tokens:700,total_tokens:740,cost:0.000212625};
  const raw = chunks.map(frame=>'data: '+JSON.stringify(frame)+'\r\n\r\n').join('')
    +'data: '+JSON.stringify({...identity,choices:[],usage:receipt})+'\r\n\r\n'+'data: [DONE]\r\n\r\n';
  if (targetBytes === undefined) return raw;
  assert.ok(Buffer.byteLength(raw)+5 <= targetBytes);
  return ':'+'.'.repeat(targetBytes-Buffer.byteLength(raw)-5)+'\r\n\r\n'+raw;
}
test('700-token many-frame stream above 64 KiB validates with a verified receipt',async()=>{
  const raw=manyFrameStream();assert.ok(Buffer.byteLength(raw)>65536);
  const f=fixture({stream:()=>raw,chunkSize:1024}),result=await complete(f);
  assert.equal(result.content,'x'.repeat(700));assert.equal(result.usage.outputTokens,700);
  assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
});
test('raw SSE byte limit accepts its boundary and rejects a fragmented oversized frame without retry',async()=>{
  const accepted=fixture({stream:()=>manyFrameStream(512000),chunkSize:1024}),result=await complete(accepted);
  assert.equal(result.content,'x'.repeat(700));assert.equal(accepted.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
  const rejected=fixture({stream:()=>manyFrameStream(512001),chunkSize:1024}),prepared=await rejected.adapter.prepare(native(),signal());
  await assert.rejects(rejected.adapter.complete(prepared,rejected.before,signal()),unknown);
  await assert.rejects(rejected.adapter.complete(prepared,rejected.before,signal()),notSent);
  assert.deepEqual(rejected.counts,{posts:1,grants:1});
});

// C2 projected tool-history wire budget, built from the real broker projection over verified receipts.
const wireStamp='2026-11-11T00:00:00.000Z';
const wireProse=(length,seed)=>{const words=['The','RP2040','PIO','block','runs','four','state','machines','with','cycle','accurate','timing','for','custom','serial','interfaces.'];let out=seed;for(let i=0;out.length<length;i++)out+=' '+words[i%words.length];return out.slice(0,length);};
function wireReceipt(tag,length){
  const sources=['a','b','c'].map(part=>{const url=`https://www.raspberrypi.com/documentation/${tag}-${part}`,content=wireProse(length,`Source ${tag}${part}`);return {handle:`web:${sha(url)}:${sha(content)}:${sha(content)}`,url,title:'Official public documentation',content,capturedAt:wireStamp};});
  return {version:1,provider:'tavily',operation:'search',requestHash:hostedTavilyRequestHash('RP2040 PIO official documentation'),requestId:'synthetic-provider-receipt',startedAt:wireStamp,completedAt:wireStamp,durationMs:1,usage:{credits:1,costNanoUsd:null},sources};
}
function toolHistoryBody(receipts,system='Only public fixture docs.'){
  const body=native();body.messages=[{role:'system',content:system},{role:'user',content:'RP2040 PIO official docs'}];
  receipts.forEach((receipt,index)=>{
    const mcp=researchSearchMCP(receipt);assert.ok(mcp);const first=JSON.parse(mcp.content[0].text).sources[0];
    assert.equal(verifyResearchSearchFixtureAnswer(JSON.stringify({answer:first.passages[0].text,evidence:[{handle:first.handle,passage:'P1'}]}),[receipt]).state,'evidence');const id='call-'+(index+1);
    body.messages.push({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:toolName,arguments:'{"query":"RP2040 PIO official documentation"}'}}]},{role:'tool',tool_call_id:id,content:mcp.content[0].text});
  });
  return body;
}
const postBody=f=>{const posts=f.calls.filter(c=>c.init.method==='POST');assert.equal(posts.length,1);return posts[0].init.body;};
test('a representative two-search passage history stays within the provider wire bound',async()=>{
  const body=toolHistoryBody([wireReceipt('one',1200),wireReceipt('two',1200)]);assert.ok(Buffer.byteLength(body.messages[0].content)<=1000);
  const f=fixture(),prepared=await f.adapter.prepare(body,signal());await f.adapter.complete(prepared,f.before,signal());
  const wire=postBody(f);assert.ok(Buffer.byteLength(wire)<=14000);assert.equal(sha(wire),prepared.wireRequestHash);assert.equal(f.counts.posts,1);
});
test('the projected history wire boundary accepts exactly 14000 bytes and rejects 14001 before any fetch',async()=>{
  const receipts=[wireReceipt('one',1200),wireReceipt('two',1200)],base=fixture();await complete(base,toolHistoryBody(receipts));
  const missing=14000-Buffer.byteLength(postBody(base));assert.ok(missing>0);
  const exact=fixture(),prepared=await exact.adapter.prepare(toolHistoryBody(receipts,'Only public fixture docs.'+'x'.repeat(missing)),signal());await exact.adapter.complete(prepared,exact.before,signal());
  const wire=postBody(exact);assert.equal(Buffer.byteLength(wire),14000);assert.equal(sha(wire),prepared.wireRequestHash);
  const over=fixture(),body=toolHistoryBody(receipts,'Only public fixture docs.'+'x'.repeat(missing+1)),snapshot=structuredClone(body);
  await assert.rejects(over.adapter.prepare(body,signal()),notSent);assert.equal(over.calls.length,0);assert.equal(over.counts.posts,0);assert.deepEqual(body,snapshot);
});
test('three full-size passage tool results exceed the wire bound without trimming or any fetch',async()=>{
  const receipts=['one','two','three'].map(tag=>wireReceipt(tag,5333));
  for(const receipt of receipts)assert.ok(receipt.sources.reduce((n,s)=>n+Buffer.byteLength(s.content),0)<=16000);
  const f=fixture(),body=toolHistoryBody(receipts),snapshot=structuredClone(body);
  await assert.rejects(f.adapter.prepare(body,signal()),notSent);assert.equal(f.calls.length,0);assert.equal(f.counts.posts,0);assert.deepEqual(body,snapshot);
});

// ---- C3 per-model hosted research transport ----
test('GPT-OSS golden policy hash, wire body and wire hash are byte-identical to the pre-C3 working tree',async()=>{
  const f=fixture(),prepared=await f.adapter.prepare(native(),signal());await f.adapter.complete(prepared,f.before,signal());
  const wire=f.calls.find(c=>c.init.method==='POST').init.body;
  assert.equal(prepared.policyHash,'1b2fc53bd1217575d696bbf3812583bcb3f50b85e67f14ff0604c9c62ca8cfe8');
  assert.equal(prepared.wireRequestHash,'b4e81106c096df3818efa7810feb64af28f63990f0a8da8551f0b1927a88d28d');
  assert.equal(wire,"{\"include_reasoning\":false,\"max_tokens\":700,\"messages\":[{\"content\":\"Only public fixture docs.\",\"role\":\"system\"},{\"content\":\"RP2040 PIO official docs\",\"role\":\"user\"}],\"model\":\"openai/gpt-oss-20b\",\"plugins\":[],\"provider\":{\"allow_fallbacks\":false,\"data_collection\":\"deny\",\"max_price\":{\"completion\":0.3,\"image\":0,\"prompt\":0.075,\"request\":0},\"only\":[\"groq\"],\"require_parameters\":true,\"zdr\":true},\"reasoning\":{\"effort\":\"low\",\"exclude\":true},\"stream\":true,\"stream_options\":{\"include_usage\":true},\"tool_choice\":\"auto\",\"tools\":[{\"function\":{\"description\":\"Search public docs\",\"name\":\"panda_research_search\",\"parameters\":{\"additionalProperties\":false,\"properties\":{\"query\":{\"maxLength\":400,\"minLength\":1,\"type\":\"string\"}},\"required\":[\"query\"],\"type\":\"object\"},\"strict\":false},\"type\":\"function\"}],\"usage\":{\"include\":true}}");
});

const rmodels={
  'openai/gpt-oss-20b':{profile:'tavily-hosted',tag:'groq',provider:'Groq',reported:['openai/gpt-oss-20b'],out:'max_tokens',other:'max_completion_tokens',reasoning:true,maxPrice:{prompt:0.075,completion:0.3,request:0,image:0},endpoint,tokenizer:'GPT'},
  'openai/gpt-6-luna':{profile:'tavily-hosted-luna',tag:'azure/us',provider:'Azure',reported:['openai/gpt-6-luna','openai/gpt-6-luna-20260922'],out:'max_completion_tokens',other:'max_tokens',reasoning:true,maxPrice:{prompt:0.11,completion:0.55,request:0,image:0},tokenizer:'GPT',
    endpoint:()=>modernEndpoint('openai/gpt-6-luna','azure/us','Azure | openai/gpt-6-luna-20260922','Azure','max_completion_tokens',{prompt:'0.00000011',completion:'0.00000055',web_search:'0.01',input_cache_read:'0.000000011',input_cache_write:'0.0000001375',discount:0},1050000)},
  'openai/gpt-6.1-terra':{profile:'tavily-hosted-terra',tag:'azure/us',provider:'Azure',reported:['openai/gpt-6.1-terra','openai/gpt-6.1-terra-20261026'],out:'max_completion_tokens',other:'max_tokens',reasoning:true,maxPrice:{prompt:1.1,completion:5.5,request:0,image:0},tokenizer:'GPT',
    endpoint:()=>modernEndpoint('openai/gpt-6.1-terra','azure/us','Azure | openai/gpt-6.1-terra-20261026','Azure','max_completion_tokens',{prompt:'0.0000011',completion:'0.0000055',web_search:'0.01',input_cache_read:'0.000000055',input_cache_write:'0.000001375',discount:0},1050000)},
  'anthropic/claude-haiku-5.5':{profile:'tavily-hosted-haiku',tag:'amazon-bedrock',provider:'Amazon Bedrock',reported:['anthropic/claude-haiku-5.5','anthropic/claude-haiku-5.5-20261007'],out:'max_tokens',other:'max_completion_tokens',reasoning:false,maxPrice:{prompt:0.1,completion:0.5,request:0,image:0},tokenizer:'Claude',
    endpoint:()=>modernEndpoint('anthropic/claude-haiku-5.5','amazon-bedrock','Amazon Bedrock | anthropic/claude-haiku-5.5-20261007','Amazon Bedrock','max_tokens',{prompt:'0.0000001',completion:'0.0000005',web_search:'0.01',input_cache_read:'0.00000001',input_cache_write:'0.000000125',input_cache_write_1h:'0.0000002',discount:0},1000000)},
};
function modernEndpoint(id,tag,name,provider,out,pricing,ctx){return {tag,model_id:id,name,provider_name:provider,status:0,pricing:{...pricing,overrides:[{min_prompt_tokens:272000,prompt:'0.1',completion:'0.2'}]},context_length:ctx,max_completion_tokens:128000,max_prompt_tokens:null,supports_implicit_caching:false,supports_tool_choice:{none:true,auto:true,required:true,function:true},supported_parameters:['reasoning','include_reasoning',out,'tools','tool_choice','response_format']};}
const rnative=id=>({...native(),model:id});
function rfixture(id,overrides={}){
  const spec=rmodels[id],calls=[],counts={posts:0,grants:0},observations=[];
  const ident=(slug=spec.reported.at(-1),provider=spec.provider)=>({id:'gen-SYNTHETIC_ONLY',model:slug,provider});
  const fetcher=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/key'))return Response.json({data:{workspace_id:'synthetic-workspace'}});
    if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:id,tag:spec.tag,safety_retention:overrides.retention??false}]});
    if(url.endsWith('/endpoints')){const e=spec.endpoint();overrides.endpoint?.(e);return Response.json({data:{id,architecture:{tokenizer:spec.tokenizer},endpoints:[e]}});}
    counts.posts++;assert.equal(counts.grants,1);
    const identity=overrides.identity??ident(),frames=[{...identity,choices:[{index:0,delta:{role:'assistant',content:'Synthetic answer.'},finish_reason:'stop'}]},{...identity,choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:'stop'}],usage:{...usage(),...(overrides.usage??{})}}];
    overrides.frames?.(frames,ident);
    return new Response('data: '+frames.map(x=>JSON.stringify(x)).join('\n\ndata: ')+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  };
  const adapter=createResearchOpenRouter({profile:overrides.profile??spec.profile,apiKey:'SYNTHETIC_SECRET_ONLY',workspaceSha256:sha('synthetic-workspace'),privacyProfileHash:'a'.repeat(64),nativeProfileHash:'b'.repeat(64),policyCurrent:async()=>true,dispatchCurrent:()=>true,fetcher,observe:o=>observations.push(o)});
  return {adapter,calls,counts,observations,before:async()=>{counts.grants++;return true;}};
}
const rids=Object.keys(rmodels);
for(const id of rids)test('hosted research transport for '+id+' fixes its model, endpoint, output parameter, price cap and reasoning wire policy',async()=>{
  const spec=rmodels[id],f=rfixture(id),body=rnative(id),prepared=await f.adapter.prepare(body,signal());
  assert.deepEqual(f.calls.map(c=>c.url.replace('https://openrouter.ai/api/v1','')).sort(),['/endpoints/zdr','/key','/models/'+id+'/endpoints']);assert.equal(f.counts.posts,0);
  const result=await f.adapter.complete(prepared,f.before,signal()),wire=JSON.parse(f.calls.find(c=>c.init.method==='POST').init.body);
  assert.equal(wire.model,id);assert.equal(wire[spec.out],700);assert.equal(wire[spec.other],undefined);assert.equal(wire.max_completion_tokens===undefined,spec.out!=='max_completion_tokens');assert.equal(wire.include_reasoning,false);
  assert.deepEqual(wire.provider,{only:[spec.tag],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:spec.maxPrice});
  if(spec.reasoning)assert.deepEqual(wire.reasoning,{effort:'low',exclude:true});else assert.deepEqual(wire.reasoning,{enabled:false});
  assert.equal(wire.tool_choice,'auto');assert.deepEqual(wire.plugins,[]);assert.deepEqual(wire.messages,body.messages);assert.equal(wire.parallel_tool_calls,undefined);assert.equal(wire.temperature,undefined);
  assert.equal(result.receipt.model,id);assert.equal(result.receipt.provider,spec.provider);assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);assert.equal(result.usage.costNanoUsd,8625);
  assert.deepEqual(f.observations.map(o=>[o.stage,o.model,o.provider]),[['prepared',id,spec.tag],['validated',id,spec.tag]]);
});
test('policy hashes are stable per model and distinct across the four hosted profiles',async()=>{
  const hashes=[];
  for(const id of rids){const a=await rfixture(id).adapter.prepare(rnative(id),signal()),b=await rfixture(id).adapter.prepare(rnative(id),signal());assert.equal(a.policyHash,b.policyHash);hashes.push(a.policyHash);}
  assert.equal(new Set(hashes).size,4);assert.equal(hashes[0],'1b2fc53bd1217575d696bbf3812583bcb3f50b85e67f14ff0604c9c62ca8cfe8');
});
for(const id of rids)test('stream identity for '+id+' accepts only its reported slugs and provider name',async()=>{
  const spec=rmodels[id];
  for(const slug of spec.reported){const f=rfixture(id,{identity:{id:'gen-SYNTHETIC_ONLY',model:slug,provider:spec.provider}});const r=await f.adapter.complete(await f.adapter.prepare(rnative(id),signal()),f.before,signal());assert.equal(r.receipt.model,id);}
  const foreign=rids.filter(other=>other!==id).flatMap(other=>rmodels[other].reported).concat([spec.reported[0]+'-20990101',spec.reported[0]+'x']).filter(slug=>!spec.reported.includes(slug));
  for(const slug of foreign){const f=rfixture(id,{identity:{id:'gen-SYNTHETIC_ONLY',model:slug,provider:spec.provider}});await assert.rejects(f.adapter.complete(await f.adapter.prepare(rnative(id),signal()),f.before,signal()),unknown);assert.equal(f.counts.posts,1);}
  for(const provider of [...new Set(rids.map(other=>rmodels[other].provider))].filter(p=>p!==spec.provider).concat([spec.provider.toLowerCase(),spec.tag])){
    const f=rfixture(id,{identity:{id:'gen-SYNTHETIC_ONLY',model:spec.reported.at(-1),provider}});await assert.rejects(f.adapter.complete(await f.adapter.prepare(rnative(id),signal()),f.before,signal()),unknown);
  }
  // Later frames may not switch to a foreign slug or provider either.
  for(const change of [x=>{x[1].model=rmodels[rids.find(o=>o!==id)].reported[0];},x=>{x[1].provider='Other';}]){const f=rfixture(id,{frames:change});await assert.rejects(f.adapter.complete(await f.adapter.prepare(rnative(id),signal()),f.before,signal()),unknown);}
});
for(const id of rids.slice(1))test('approval failure for '+id+' performs no inference POST or send grant and wrong model/profile bodies are refused',async()=>{
  for(const overrides of [{retention:true},{endpoint:e=>{e.tag=e.tag+'/x';}},{endpoint:e=>{e.pricing.prompt='9';}},{endpoint:e=>{e.supports_implicit_caching=true;}},{endpoint:e=>{e.supported_parameters=e.supported_parameters.filter(p=>p!=='tools');}},{endpoint:e=>{e.supported_parameters=e.supported_parameters.filter(p=>p!==rmodels[id].out);}},{endpoint:e=>{e.pricing.overrides[0].min_prompt_tokens=16000;}}]){
    const f=rfixture(id,overrides);await assert.rejects(f.adapter.prepare(rnative(id),signal()),notSent);assert.equal(f.counts.posts,0);assert.equal(f.counts.grants,0);
  }
  const f=rfixture(id);await assert.rejects(f.adapter.prepare(native(),signal()),notSent);assert.equal(f.calls.length,0);
  const g=rfixture(id);await assert.rejects(g.adapter.prepare(rnative(rids.find(o=>o!==id&&o!==rids[0])),signal()),notSent);assert.equal(g.calls.length,0);
});
test('unknown or non-hosted profiles fail closed at construction and default stays GPT-OSS',async()=>{
  for(const profile of ['synthetic-echo','tavily-search','tavily-hosted-sol','','__proto__'])assert.throws(()=>createResearchOpenRouter({profile,apiKey:'SYNTHETIC_SECRET_ONLY',workspaceSha256:sha('w'),privacyProfileHash:'a'.repeat(64),nativeProfileHash:'b'.repeat(64),policyCurrent:async()=>true,dispatchCurrent:()=>true}),notSent);
  const f=fixture(),prepared=await f.adapter.prepare(native(),signal());assert.equal(prepared.policyHash,'1b2fc53bd1217575d696bbf3812583bcb3f50b85e67f14ff0604c9c62ca8cfe8');
  assert.ok(f.calls.some(c=>c.url.endsWith('/models/openai/gpt-oss-20b/endpoints')));
});
for(const id of rids.slice(1))test('cache-write usage is accepted and bounded by the reservation for '+id,async()=>{
  const ok=rfixture(id,{usage:{prompt_tokens:3000,completion_tokens:100,total_tokens:3100,cost:0.0001,prompt_tokens_details:{cached_tokens:500,cache_write_tokens:1000}}});
  const result=await ok.adapter.complete(await ok.adapter.prepare(rnative(id),signal()),ok.before,signal());assert.equal(result.receipt.cachedTokens,500);assert.equal(result.usage.inputTokens,3000);
  const bad=rfixture(id,{usage:{prompt_tokens:16000,completion_tokens:700,total_tokens:16700,cost:1,prompt_tokens_details:undefined}});
  await assert.rejects(bad.adapter.complete(await bad.adapter.prepare(rnative(id),signal()),bad.before,signal()),unknown);
  const audio=rfixture(id,{usage:{prompt_tokens_details:{audio_tokens:1}}});await assert.rejects(audio.adapter.complete(await audio.adapter.prepare(rnative(id),signal()),audio.before,signal()),unknown);
});
test('receipts verify only against the factory profile model and provider',async()=>{
  const luna=rfixture('openai/gpt-6-luna'),terra=rfixture('openai/gpt-6.1-terra'),result=await luna.adapter.complete(await luna.adapter.prepare(rnative('openai/gpt-6-luna'),signal()),luna.before,signal());
  assert.equal(luna.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);assert.equal(terra.adapter.verifyResult(result,result.receipt.nativeRequestHash),false);
  for(const change of [r=>{r.receipt.provider='Groq';},r=>{r.receipt.model='openai/gpt-6.1-terra';},r=>{r.receipt.model='openai/gpt-6-luna-20260922';}]){const x=structuredClone(result);change(x);assert.equal(luna.adapter.verifyResult(x,x.receipt.nativeRequestHash),false);}
});

// ---- C4 image input (D2 R1, point 8) ----
// NOTE: tests that send an image through validResearchProviderBody depend on the gateway accepting image_url parts (Worker B).
const visionIds=rids.slice(1);
const jpegUri=(bytes=49152)=>{const b=Buffer.alloc(bytes);b[0]=0xff;b[1]=0xd8;b[2]=0xff;return 'data:image/jpeg;base64,'+b.toString('base64');};
const imageBody=(id,uri=jpegUri(),system)=>{const b=rnative(id);if(system!==undefined)b.messages[0].content=system;b.messages[1]={role:'user',content:[{type:'text',text:'What is on this board?'},{type:'image_url',image_url:{url:uri}}]};return b;};
const posts=f=>f.calls.filter(c=>c.init.method==='POST');
test('the image constants line up: 65,559 URL bound and 18-byte placeholder',()=>{assert.equal(jpegUri().length,researchImageMaxUrl);assert.equal(researchImagePlaceholder,'data:image;base64,');});
for(const id of visionIds)test('vision policyHash for '+id+' includes imagePolicy; the wire never does',async()=>{
  const spec=rmodels[id],selected=researchProfileSelection(spec.profile),descriptor=hostedResearchModel(id),f=rfixture(id),prepared=await f.adapter.prepare(rnative(id),signal());
  const wirePolicy={model:id,stream:true,stream_options:{include_usage:true},[descriptor.outputParam]:700,reasoning:descriptor.reasoning==='disabled'?{enabled:false}:{effort:'low',exclude:true},include_reasoning:false,usage:{include:true},plugins:[],tool_choice:'auto',provider:{only:[descriptor.endpointTag],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{...descriptor.maxPrice}}};
  const input=extra=>({wireVersion:1,descriptor:selected,nativeProfileHash:'b'.repeat(64),privacyProfileHash:'a'.repeat(64),workspaceSha256:sha('synthetic-workspace'),keyHash:sha('SYNTHETIC_SECRET_ONLY'),wirePolicy,model:descriptor,maxInput:descriptor.maxInput,reservation:descriptor.reservationNanoUsd,wireBytes:descriptor.wireMax,streamBytes:512000,maxCalls:4,metadataEligibilityMs:8000,...extra});
  const withPolicy=hashResearchValue(input({imagePolicy:{maxBase64:65536,types:['image/png','image/jpeg'],placeholder:'data:image;base64,'}})),without=hashResearchValue(input({}));
  assert.notEqual(withPolicy,without);assert.equal(prepared.policyHash,withPolicy);
  await f.adapter.complete(prepared,f.before,signal());const wire=JSON.parse(posts(f)[0].init.body);
  assert.equal(Object.hasOwn(wire,'imagePolicy'),false);assert.equal(Object.keys(wire).some(k=>/image/i.test(k)),false);
});
test('a text-only vision body keeps the exact wire shape (no vision-only wire fields)',async()=>{
  const f=rfixture('openai/gpt-6-luna'),r=await f.adapter.complete(await f.adapter.prepare(rnative('openai/gpt-6-luna'),signal()),f.before,signal());
  assert.deepEqual(Object.keys(JSON.parse(posts(f)[0].init.body)).sort(),['include_reasoning','max_completion_tokens','messages','model','plugins','provider','reasoning','stream','stream_options','tool_choice','tools','usage']);assert.ok(r.receipt);
});
for(const id of visionIds)test('one image is posted unchanged for '+id+' and the posted wire is what is hashed',async()=>{
  const f=rfixture(id),body=imageBody(id),prepared=await f.adapter.prepare(body,signal()),result=await f.adapter.complete(prepared,f.before,signal());
  const wire=posts(f)[0].init.body;assert.equal(sha(wire),prepared.wireRequestHash);assert.equal(f.counts.posts,1);
  const parsed=JSON.parse(wire);assert.deepEqual(parsed.messages[1].content[1],{type:'image_url',image_url:{url:jpegUri()}});assert.equal(wire.split(jpegUri()).length-1,1);
  assert.ok(Buffer.byteLength(wire)<=14000+researchImageMaxUrl);assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
  assert.equal(result.receipt.nativeRequestHash,hashResearchValue(body));
});
test('image_tokens in prompt usage are accepted for a vision model and the receipt verifies',async()=>{
  const id='openai/gpt-6-luna',f=rfixture(id,{usage:{prompt_tokens:3000,completion_tokens:20,total_tokens:3020,cost:0.0004,prompt_tokens_details:{cached_tokens:0,image_tokens:1100}}});
  const result=await f.adapter.complete(await f.adapter.prepare(imageBody(id),signal()),f.before,signal());assert.equal(result.usage.inputTokens,3000);assert.equal(result.receipt.usageReceipt.prompt_tokens_details.image_tokens,1100);assert.equal(f.adapter.verifyResult(result,result.receipt.nativeRequestHash),true);
});
test('image_tokens in prompt usage are rejected for GPT-OSS (outcome unknown after the grant)',async()=>{
  const f=fixture({frames:frames=>{frames[1].usage.prompt_tokens_details={cached_tokens:0,image_tokens:1};}});
  await assert.rejects(complete(f),unknown);
});
test('the placeholder wire bound accepts exactly wireMax (48,000) bytes and rejects one more before any POST',async()=>{
  const id='openai/gpt-6-luna',base=rfixture(id),max=hostedResearchModel(id).wireMax;assert.equal(max,48000);
  await base.adapter.complete(await base.adapter.prepare(imageBody(id),signal()),base.before,signal());
  const delta=jpegUri().length-researchImagePlaceholder.length,missing=max-(Buffer.byteLength(posts(base)[0].init.body)-delta);assert.ok(missing>0,'baseline leaves headroom');
  const exact=rfixture(id),prepared=await exact.adapter.prepare(imageBody(id,jpegUri(),'Only public fixture docs.'+'x'.repeat(missing)),signal());await exact.adapter.complete(prepared,exact.before,signal());
  const wire=posts(exact)[0].init.body;assert.equal(Buffer.byteLength(wire)-delta,max);assert.equal(sha(wire),prepared.wireRequestHash);
  const over=rfixture(id),body=imageBody(id,jpegUri(),'Only public fixture docs.'+'x'.repeat(missing+1)),snapshot=structuredClone(body);
  await assert.rejects(over.adapter.prepare(body,signal()),notSent);assert.equal(over.calls.length,0);assert.equal(over.counts.posts,0);assert.deepEqual(body,snapshot);
});
test('an image URL at researchImageMaxUrl passes and one character more fails without any fetch',async()=>{
  const id='openai/gpt-6-luna',ok=rfixture(id);await ok.adapter.prepare(imageBody(id,jpegUri(49152)),signal());
  const over=jpegUri(49152).replace('base64,','base64,AAAA'); // 65,563 chars: over the bound and still canonical
  for(const uri of [over,jpegUri(49152)+'A',jpegUri(49152).slice(0,-1)]){const f=rfixture(id);await assert.rejects(f.adapter.prepare(imageBody(id,uri),signal()),notSent);assert.equal(f.calls.length,0);}
});
test('a non-canonical, wrongly typed or non-data image URL is rejected without any fetch',async()=>{
  const id='openai/gpt-6-luna',wrongMagic='data:image/png;base64,'+Buffer.from([0xff,0xd8,0xff,0,0,0]).toString('base64');
  for(const uri of [wrongMagic,'https://example.test/x.jpg','data:image/gif;base64,R0lGODlh','data:image/jpeg;base64,not base64!']){const f=rfixture(id);await assert.rejects(f.adapter.prepare(imageBody(id,uri),signal()),notSent);assert.equal(f.calls.length,0);}
});
test('two images in one body are rejected without any fetch',async()=>{
  const id='openai/gpt-6-luna',body=imageBody(id);body.messages[1].content.push({type:'image_url',image_url:{url:jpegUri(300)}});
  const f=rfixture(id);await assert.rejects(f.adapter.prepare(body,signal()),notSent);assert.equal(f.calls.length,0);
  const split=imageBody(id);split.messages.splice(1,0,{role:'user',content:[{type:'text',text:'earlier'},{type:'image_url',image_url:{url:jpegUri(300)}}]});
  const g=rfixture(id);await assert.rejects(g.adapter.prepare(split,signal()),notSent);assert.equal(g.calls.length,0);
});
test('an image on GPT-OSS is rejected without any fetch and its text-only golden stays byte-identical',async()=>{
  const gpt='openai/gpt-oss-20b',f=rfixture(gpt);await assert.rejects(f.adapter.prepare(imageBody(gpt),signal()),notSent);assert.equal(f.calls.length,0);
  const g=fixture();await assert.rejects(g.adapter.prepare(imageBody(gpt),signal()),notSent);assert.equal(g.calls.length,0);
  const h=fixture(),prepared=await h.adapter.prepare(native(),signal());await h.adapter.complete(prepared,h.before,signal());
  assert.equal(prepared.policyHash,'1b2fc53bd1217575d696bbf3812583bcb3f50b85e67f14ff0604c9c62ca8cfe8');assert.equal(prepared.wireRequestHash,'b4e81106c096df3818efa7810feb64af28f63990f0a8da8551f0b1927a88d28d');
});
