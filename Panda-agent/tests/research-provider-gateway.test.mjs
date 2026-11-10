import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalResearchJSON, hashResearchValue, deriveResearchFrontier, createResearchProviderGateway } from '../src/opencode/research-provider-gateway.ts';

const token = 'a'.repeat(64), generation = 'b'.repeat(64), key = 'c'.repeat(64);
const sessionID = 'ses_000000000001abcdefghijklmn', messageID = 'msg_000000000002abcdefghijklmn', assistantID = 'msg_000000000003abcdefghijklmn';
const sha = value => createHash('sha256').update(value).digest('hex');
const expected = { messageID, promptHash: sha('Now') };
const user = { id: messageID, type: 'user', text: 'Now', time: { created: 2 } };
const body = { model: 'panda-fixture', stream: true, messages: [{role:'system',content:'Native system'}, {role:'user',content:'Before'}, {role:'assistant',content:'History'}, {role:'user',content:'Now'}],
  tools: [{type:'function',function:{name:'panda_research_echo',description:'Synthetic echo',parameters:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:400}},required:['query'],additionalProperties:false}}}] };
const usage = {inputTokens:10,outputTokens:5,costNanoUsd:0};
const calls = [{id:'call-1',name:'panda_research_echo',arguments:{query:'public fixture'}}];
const toolResult = {toolCalls:calls,usage};
const finalResult = {content:'Synthetic answer',usage};
const nativeAssistant = (emitted = calls) => ({id:assistantID,type:'assistant',finish:'tool_calls',time:{created:3,completed:6},content:emitted.map(c=>({type:'tool',id:c.id,name:c.name,state:{status:'completed',input:structuredClone(c.arguments),content:[{type:'text',text:'Synthetic result '+c.id}]},time:{created:4,ran:4,completed:5}}))});
const continued = (emitted = calls) => ({...body,messages:[...body.messages,{role:'assistant',content:null,tool_calls:emitted.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments)}}))},...emitted.map(c=>({role:'tool',tool_call_id:c.id,content:'Synthetic result '+c.id}))]});
const headers = {authorization:'Bearer '+token,'content-type':'application/json','x-panda-native-session':sessionID,'x-panda-native-kind':'primary','x-panda-native-generation':generation};
const request = (value = body, extra = {}) => ({method:'POST',path:'/v1/chat/completions',headers,body:JSON.stringify(value),...extra});
async function fixture(run, overrides={}) {
  const events=[], settled=[]; let state='fresh', stored;
  const gateway=createResearchProviderGateway({token,generation,sessionID,signal:new AbortController().signal,
    authorize:async identity=>{events.push('authorize');return {requestHash:identity.requestHash};},
    current:async()=>true,
    claim:async()=>{events.push('claim');if(state==='settled')return {state:'cached',result:stored};if(state!=='fresh')return {state:'unknown'};state='claimed';return {state:'dispatch'};},
    beforeSend:async()=>{events.push('send');return {nonce:'synthetic-grant'};},
    complete:async(_body,before)=>{assert.equal(await before(),true);events.push('complete');return toolResult;},
    settle:async(_binding,grant,result)=>{assert.deepEqual(grant,{nonce:'synthetic-grant'});events.push('settle');settled.push(result);stored=result;state='settled';},
    authorizeRelease:async()=>{events.push('release');return true;},...overrides});
  try {await run({gateway,events,settled});} finally {await gateway.close();}
}

test('canonical hashing rejects unsafe JSON and ignores only object key order',()=>{
  assert.equal(canonicalResearchJSON({z:[2,1],a:{y:true,x:null}}),'{'+'"a":{"x":null,"y":true},"z":[2,1]}');
  assert.equal(hashResearchValue({b:2,a:1}),sha('{"a":1,"b":2}'));
  const cycle={};cycle.next=cycle;
  for(const value of [cycle,{x:undefined},{x:Infinity},new Date(),{get x(){throw Error('executed');}},Object.assign([], {extra:true})]) assert.throws(()=>canonicalResearchJSON(value));
  assert.notEqual(hashResearchValue([1,2]),hashResearchValue([2,1]));
});
test('initial frontier uses only admitted user and excludes completed older turns',()=>{
  const rows=[{id:'msg_000000000000abcdefghijklmn',type:'assistant',content:[],time:{created:1,completed:1}},user];
  assert.deepEqual(deriveResearchFrontier(expected,rows,[],body),{frontier:{v:1,messageID,steps:[]},associations:[]});
  assert.equal(deriveResearchFrontier(expected,[{...user,text:'foreign'}],[],body),null);
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant()],[],body),null);
  assert.equal(deriveResearchFrontier(expected,[user],[],{...body,messages:[{role:'user',content:'Other'}]}),null);
});
test('settled tool calls produce ordered verified frontier and one native association',()=>{
  const emitted=[...calls,{id:'call-2',name:'panda_research_echo',arguments:{query:'second fixture'}}];
  const result=deriveResearchFrontier(expected,[user,nativeAssistant(emitted)],[{attemptKey:key,result:{toolCalls:emitted,usage}}],continued(emitted));
  assert.deepEqual(result,{frontier:{v:1,messageID,steps:[{attemptKey:key,assistantMessageID:assistantID,calls:emitted.map(c=>({id:c.id,name:c.name,inputHash:sha(JSON.stringify(c.arguments)),status:'completed',contentHash:sha(JSON.stringify(['Synthetic result '+c.id]))}))}]},associations:[{attemptKey:key,assistantMessageID:assistantID}]});
});
test('frontier rejects lazy publication, stop continuation and changed native association',()=>{
  assert.equal(deriveResearchFrontier(expected,[user],[{attemptKey:key,result:toolResult}],continued()),null);
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant()],[{attemptKey:key,result:finalResult}],continued()),null);
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant()],[{attemptKey:key,result:toolResult,assistantMessageID:'msg_000000000004abcdefghijklmn'}],continued()),null);
});
test('frontier rejects extra, foreign, duplicate, unresolved and forged provider tool results',()=>{
  const attempt=[{attemptKey:key,result:toolResult}];
  const mutations=[a=>{a.content[0].state.input.query='changed';},a=>{a.content[0].name='foreign';},a=>{a.content.push(structuredClone(a.content[0]));},a=>{a.content[0].state.status='running';},a=>{delete a.time.completed;}];
  for(const mutate of mutations){const a=nativeAssistant();mutate(a);assert.equal(deriveResearchFrontier(expected,[user,a],attempt,continued()),null);}
  const forged=continued();forged.messages.at(-1).content='forged';
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant()],attempt,forged),null);
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant(),{...user,id:'msg_000000000005abcdefghijklmn'}],attempt,continued()),null);
  const changed=continued();changed.messages.at(-2).tool_calls[0].function.arguments='{"query":"changed"}';
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant()],attempt,changed),null);
});
test('all prior settled steps must remain in order with their original associations',()=>{
  const secondID='msg_000000000004abcdefghijklmn', secondKey='d'.repeat(64);
  const secondCalls=[{id:'call-2',name:'panda_research_echo',arguments:{query:'next'}}];
  const second=nativeAssistant(secondCalls);second.id=secondID;second.time={created:7,completed:10};for(const p of second.content)p.time={created:8,ran:8,completed:9};
  const attempts=[{attemptKey:key,result:toolResult,assistantMessageID:assistantID},{attemptKey:secondKey,result:{toolCalls:secondCalls,usage}}];
  const next={...continued(),messages:[...continued().messages,...continued(secondCalls).messages.slice(body.messages.length)]};
  const valid=deriveResearchFrontier(expected,[user,nativeAssistant(),second],attempts,next);
  assert.equal(valid.frontier.steps.length,2);
  assert.equal(deriveResearchFrontier(expected,[user,second,nativeAssistant()],attempts,next),null);
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant(),second],attempts.toReversed(),next),null);
});
test('native error result hashes the exact empty normalized text array',()=>{
  const a=nativeAssistant();a.content[0].state={status:'error',input:calls[0].arguments,error:'Private error'};
  const next=continued();next.messages.at(-1).content=[];
  const result=deriveResearchFrontier(expected,[user,a],[{attemptKey:key,result:toolResult}],next);
  assert.equal(result.frontier.steps[0].calls[0].contentHash,sha('[]'));
});
test('SSE emits actual tool call arguments and settled receipt before release',async()=>fixture(async({gateway,events,settled})=>{
  const r=await gateway.handle(request());assert.equal(r.status,200);assert.equal(r.contentType,'text/event-stream');
  const chunks=r.body.toString().split('\n\n').filter(Boolean);assert.equal(chunks.at(-1),'data: [DONE]');
  const frames=chunks.slice(0,-1).map(line=>JSON.parse(line.slice(6)));
  const delta=frames.flatMap(f=>f.choices[0].delta.tool_calls??[]);
  assert.equal(delta[0].id,'call-1');assert.equal(delta[0].function.name,'panda_research_echo');
  assert.deepEqual(JSON.parse(delta.map(c=>c.function.arguments??'').join('')),{query:'public fixture'});
  assert.equal(frames.at(-1).choices[0].finish_reason,'tool_calls');assert.deepEqual(settled,[toolResult]);
  assert.ok(events.indexOf('settle')<events.indexOf('release'));
}));
test('final synthetic text ends with stop and usage remains private settlement data',async()=>fixture(async({gateway,settled})=>{
  const r=await gateway.handle(request());assert.equal(r.status,200);assert.match(r.body.toString(),/Synthetic answer/);assert.match(r.body.toString(),/"finish_reason":"stop"/);assert.doesNotMatch(r.body.toString(),/costNanoUsd/);assert.deepEqual(settled,[finalResult]);
},{complete:async(_body,before)=>{assert.equal(await before(),true);return finalResult;}}));
test('identical settled replay uses stored result without another synthetic dispatch',async()=>fixture(async({gateway,events})=>{
  assert.equal((await gateway.handle(request())).status,200);assert.equal((await gateway.handle(request())).status,200);
  assert.equal(events.filter(e=>e==='complete').length,1);assert.equal(events.filter(e=>e==='release').length,2);
}));
test('changed body and unresolved new frontier remain denied by durable host claims',async()=>{
  for(const state of ['conflict','unknown'])await fixture(async({gateway,events})=>{
    assert.equal((await gateway.handle(request({...body,temperature:0.5}))).status,409);
    assert.equal(events.includes('send'),false);assert.equal(events.includes('complete'),false);
  },{claim:async()=>({state})});
});
test('tool arguments cannot smuggle duplicate keys or malformed native schema fields',async()=>fixture(async({gateway,events})=>{
  const next=continued();next.messages.at(-2).tool_calls[0].function.arguments='{"query":"first","query":"second"}';
  const invalidSchemas=[next,{...body,tools:[{...body.tools[0],function:{...body.tools[0].function,parameters:{...body.tools[0].function.parameters,additionalProperties:true}}}]}, {...body,temperature:Infinity}];
  // JSON cannot represent Infinity, so its null normalization must also be rejected.
  for(const value of invalidSchemas)assert.equal((await gateway.handle(request(value))).status,400);
  assert.deepEqual(events,[]);
}));
test('non-array native content and unfinished older context cannot authorize continuation',()=>{
  const a=nativeAssistant();a.content[0].state.content='Synthetic result call-1';
  assert.equal(deriveResearchFrontier(expected,[user,a],[{attemptKey:key,result:toolResult}],continued()),null);
  const old={id:'msg_000000000001abcdefghijklmn',type:'assistant',time:{created:1},content:[]};
  assert.equal(deriveResearchFrontier(expected,[old,user],[],body),null);
});
test('unknown attempt never retries even after a failed/disconnected synthetic completion',async()=>fixture(async({gateway,events})=>{
  assert.equal((await gateway.handle(request())).status,503);assert.equal((await gateway.handle(request())).status,409);assert.equal(events.filter(e=>e==='send').length,1);
},{complete:async(_body,before)=>{assert.equal(await before(),true);throw Error('synthetic disconnect');}}));
test('invalid bearer, native binding, kind and request surface never reach authority',async()=>fixture(async({gateway,events})=>{
  for(const h of [{...headers,authorization:'Bearer '+'f'.repeat(64)},{...headers,'x-panda-native-session':'ses_000000000099abcdefghijklmn'},{...headers,'x-panda-native-generation':'f'.repeat(64)},{...headers,'x-panda-native-kind':'title'},{...headers,'x-panda-native-kind':'compaction'},{...headers,'x-panda-native-kind':'generate'},{...headers,origin:'https://example.com'}])assert.ok((await gateway.handle(request(body,{headers:h}))).status>=400);
  for(const change of [{method:'GET'},{path:'/v1/chat/completions?retry=1'},{headers:{...headers,'content-type':'text/plain'}}])assert.equal((await gateway.handle(request(body,change))).status,400);
  assert.deepEqual(events,[]);
}));
test('duplicate JSON keys, malformed UTF8, schemas, message fields and body limits fail closed',async()=>fixture(async({gateway,events})=>{
  const bad=[{...body,model:'real-model'},{...body,stream:false},{...body,functions:[]},{...body,messages:[{role:'user',content:'x',extra:true}]},{...body,messages:[{role:'user',content:'\ud800'}]}, {...body,messages:[{role:'user',content:'x'.repeat(98305)}]}, {...body,tools:[{type:'function',function:{name:'shell',parameters:{}}}]}, {...body,tools:[{type:'function',function:{name:'panda_research_echo',parameters:{type:'object',properties:{secret:{type:'string'}},required:['secret']}}}]}];
  for(const value of bad)assert.equal((await gateway.handle(request(value))).status,400);
  for(const raw of ['{"model":"panda-fixture","model":"panda-fixture"}',Buffer.from([0xc0,0xaf]),' '.repeat(131073)])assert.equal((await gateway.handle(request(body,{body:raw}))).status,400);
  assert.deepEqual(events,[]);
}));
test('complete cannot bypass or repeat the physical send grant',async()=>{
  await fixture(async({gateway,settled})=>{assert.equal((await gateway.handle(request())).status,503);assert.deepEqual(settled,[]);},{complete:async()=>finalResult});
  await fixture(async({gateway})=>{assert.equal((await gateway.handle(request())).status,200);},{complete:async(_body,before)=>{assert.equal(await before(),true);assert.equal(await before(),false);return finalResult;}});
});
test('cancel before send denies physical admission while post-send cancellation settles privately',async()=>{
  let current=true;
  await fixture(async({gateway,settled})=>{assert.equal((await gateway.handle(request())).status,503);assert.deepEqual(settled,[]);},{current:async()=>current,complete:async(_body,before)=>{current=false;assert.equal(await before(),false);return finalResult;}});
  current=true;
  await fixture(async({gateway,settled})=>{const response=await gateway.handle(request());assert.equal(response.status,503);assert.doesNotMatch(response.body.toString(),/Synthetic answer/);assert.deepEqual(settled,[finalResult]);},{current:async()=>current,authorizeRelease:async()=>current,complete:async(_body,before)=>{assert.equal(await before(),true);current=false;return finalResult;}});
});
test('rotation/source retirement or request abort after send still preserve an exact verified settlement',async()=>{
  for(const reason of ['rotate','source_retired','aborted']){
    const abort=new AbortController();let current=true;
    await fixture(async({gateway,settled})=>{assert.equal((await gateway.handle(request(),abort.signal)).status,503);assert.deepEqual(settled,[finalResult]);},{current:async()=>current,authorizeRelease:async()=>false,complete:async(_body,before)=>{assert.equal(await before(),true);current=false;if(reason==='aborted')abort.abort();return finalResult;}});
  }
});
test('invalid or oversized verified responses never settle or release',async()=>{
  const bad=[{content:'x',usage:{...usage,costNanoUsd:1}},{content:'x',usage:{...usage,inputTokens:16001}},{content:'x',usage:{...usage,outputTokens:1025}},{content:'x'.repeat(24001),usage},{content:'\ud800',usage},{content:'x',toolCalls:calls,usage},{toolCalls:[...calls,...calls],usage},{toolCalls:[{...calls[0],arguments:{query:'x',__pandaNative:{}}}],usage},{toolCalls:[{...calls[0],name:'shell'}],usage}];
  for(const result of bad)await fixture(async({gateway,settled})=>{assert.equal((await gateway.handle(request())).status,503);assert.deepEqual(settled,[]);},{complete:async(_body,before)=>{await before();return result;}});
});
test('settlement failure and release rejection expose no synthetic content',async()=>{
  for(const overrides of [{settle:async()=>{throw Error('private failure');}},{authorizeRelease:async()=>false}])await fixture(async({gateway})=>{const r=await gateway.handle(request());assert.equal(r.status,503);assert.doesNotMatch(r.body.toString(),/public fixture|private failure/);},overrides);
});
test('gateway keeps trusted input deeply immutable and hashes every reviewed body field',async()=>{
  let seen;
  await fixture(async({gateway})=>{assert.equal((await gateway.handle(request())).status,200);assert.equal(seen,sha(canonicalResearchJSON(body)));},{authorize:async identity=>{seen=identity.requestHash;assert.equal(Object.isFrozen(identity.body.messages[0]),true);assert.throws(()=>{identity.body.messages[0].content='changed';},TypeError);return {};}});
});
test('native 2.2.5 max_completion_tokens reaches guarded completion with whole-body identity',async()=>{
  const producer={model:'panda-fixture',messages:[{role:'system',content:'Native system'},{role:'user',content:'Now'}],tools:structuredClone(body.tools),stream:true,stream_options:{include_usage:true},max_completion_tokens:1024};
  producer.tools[0].function.strict=false;
  let observed;
  await fixture(async({gateway})=>{assert.equal((await gateway.handle(request(producer))).status,200);assert.deepEqual(observed,producer);},
    {authorize:async identity=>{assert.equal(identity.requestHash,sha(canonicalResearchJSON(producer)));assert.notEqual(identity.requestHash,hashResearchValue({...producer,max_completion_tokens:1}));return {};},
      complete:async(reviewed,before)=>{observed=reviewed;assert.equal(await before(),true);return finalResult;}});
});
test('both token-limit spellings keep integer bounds and conflicting fields never reach authority',async()=>{
  for(const field of ['max_tokens','max_completion_tokens']){
    for(const limit of [1,1024])await fixture(async({gateway})=>{assert.equal((await gateway.handle(request({...body,[field]:limit}))).status,200);});
    await fixture(async({gateway,events})=>{
      for(const limit of [0,-1,1025,1.5,null,'1024',true,Infinity,NaN])assert.equal((await gateway.handle(request({...body,[field]:limit}))).status,400);
      const raw=JSON.stringify({...body,[field]:1}).replace('"'+field+'":1','"'+field+'":1e999');
      assert.equal((await gateway.handle(request(body,{body:raw}))).status,400);assert.deepEqual(events,[]);
    });
  }
  await fixture(async({gateway,events})=>{
    for(const limits of [{max_tokens:1024,max_completion_tokens:1024},{max_tokens:1,max_completion_tokens:1024}])assert.equal((await gateway.handle(request({...body,...limits}))).status,400);
    assert.deepEqual(events,[]);
  });
});
test('loopback HTTP adapter returns bounded SSE through the same guarded handler',async()=>fixture(async({gateway})=>{
  const url=await gateway.listen();const r=await fetch(url+'/chat/completions',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/"finish_reason":"tool_calls"/);
}));
