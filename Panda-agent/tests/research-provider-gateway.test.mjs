import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalResearchJSON, hashResearchValue, deriveResearchFrontier, createResearchProviderGateway, validResearchProviderBody, matchResearchStopResult } from '../src/opencode/research-provider-gateway.ts';

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
const hostedBody=value=>JSON.parse(JSON.stringify({...value,model:'openai/gpt-oss-20b'}).replaceAll('panda_research_echo','panda_research_search'));
function hostedResult(result,nativeRequestHash=key){return{...structuredClone(result),usage:{inputTokens:10,outputTokens:5,costNanoUsd:2250},receipt:{nativeRequestHash,generationId:'gen-SYNTHETIC_HOST',policyHash:key,wireRequestHash:key,reasoningTokens:2,cachedTokens:3,usageReceipt:{prompt_tokens:10,completion_tokens:5,prompt_tokens_details:{cached_tokens:3,cache_write_tokens:1},completion_tokens_details:{reasoning_tokens:2}}}};}
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

test('hosted body validation binds the selected actual model and700-token bound',()=>{
 assert.equal(validResearchProviderBody({...hostedBody(body),max_completion_tokens:700},'tavily-hosted'),true);
 assert.equal(validResearchProviderBody({...hostedBody(body),max_completion_tokens:701},'tavily-hosted'),false);
 assert.equal(validResearchProviderBody(hostedBody(body)),false);assert.equal(validResearchProviderBody(body,'tavily-hosted'),false);
});

test('hosted SSE retains preamble and calls, projects verified usage and hides receipts',async()=>{
 const input=hostedBody(body),value=hostedResult({content:'Looking up documentation.',toolCalls:[{...calls[0],name:'panda_research_search'}]},hashResearchValue(input));let verified=0,bound,completions=0;
 await fixture(async({gateway})=>{const r=await gateway.handle(request(input));assert.equal(r.status,200);const raw=r.body.toString();assert.ok(raw.indexOf('Looking up documentation.')<raw.indexOf('tool_calls'));assert.doesNotMatch(raw,/gen-SYNTHETIC_HOST|policyHash|wireRequestHash|costNanoUsd/);
  const frames=raw.split('\n\n').filter(x=>x.startsWith('data: {')).map(x=>JSON.parse(x.slice(6)));const footer=frames.at(-1);assert.deepEqual(footer.choices,[]);assert.deepEqual(footer.usage,{prompt_tokens:10,completion_tokens:5,total_tokens:15,prompt_tokens_details:{cached_tokens:3,cache_write_tokens:1},completion_tokens_details:{reasoning_tokens:2}});
  assert.equal((await gateway.handle(request(input))).status,200);assert.equal(completions,1);assert.equal(verified,2);assert.equal(bound.requestHash,hashResearchValue(input));
 },{profile:'tavily-hosted',verifyHostedResult:(binding,result,identity)=>{verified++;return binding.requestHash===identity.requestHash&&result.receipt.nativeRequestHash===identity.requestHash;},complete:async(_body,before,_signal,binding)=>{bound=binding;completions++;assert.equal(await before(),true);return value;}});
});

test('hosted policy requires its verifier and synthetic modes cannot accept paid receipts',async()=>{
 assert.throws(()=>createResearchProviderGateway({profile:'tavily-hosted',token,generation,sessionID,signal:new AbortController().signal}));
 assert.throws(()=>createResearchProviderGateway({token,generation,sessionID,signal:new AbortController().signal,verifyHostedResult:()=>true}));
 await fixture(async({gateway,settled})=>{assert.equal((await gateway.handle(request())).status,503);assert.equal(settled.length,0);},{complete:async(_b,before)=>{assert.equal(await before(),true);return hostedResult(finalResult);}});
 await fixture(async({gateway,settled})=>{assert.equal((await gateway.handle(request(hostedBody(body)))).status,503);assert.equal(settled.length,0);},{profile:'tavily-hosted',verifyHostedResult:()=>false,complete:async(_b,before)=>{assert.equal(await before(),true);return hostedResult(finalResult);}});
});

test('hosted frontier verifies paid attempt and exact native/provider preamble',()=>{
 const next=hostedBody(continued()),row=nativeAssistant();row.content[0].name='panda_research_search';row.content.unshift({type:'text',text:'Public documentation.'});next.messages.at(-2).content='Public documentation.';
 const result=hostedResult({content:'Public documentation.',toolCalls:[{...calls[0],name:'panda_research_search'}]}),attempt={attemptKey:key,requestHash:key,result};
 const verify=a=>a.result.receipt.nativeRequestHash===a.requestHash;
 assert.ok(deriveResearchFrontier(expected,[user,row],[attempt],next,'tavily-hosted',verify));
 assert.equal(deriveResearchFrontier(expected,[user,row],[attempt],next,'tavily-hosted'),null);
 row.content[0].text='Changed';assert.equal(deriveResearchFrontier(expected,[user,row],[attempt],next,'tavily-hosted',verify),null);row.content[0].text='Public documentation.';
 next.messages.at(-2).content+=' extra';assert.equal(deriveResearchFrontier(expected,[user,row],[attempt],next,'tavily-hosted',verify),null);
});

const longToolID = 'call_model_12345678-1234-1234-1234-123456789abc';
const loweredToolID = 'call_model_12345678-1234-1234-1234-12345';
function hostedHistory(groups, model = 'openai/gpt-oss-20b') {
 const next = { ...hostedBody(body), model }, rows = [structuredClone(user)], attempts = [];
 for (const [index, group] of groups.entries()) {
  const emitted = group.map(({ id }) => ({ id, name: 'panda_research_search', arguments: { query: 'RP2040 PIO documentation' } }));
  const row = nativeAssistant(emitted), shift = index * 4;
  row.id = 'msg_' + String(index + 3).padStart(12, '0') + 'abcdefghijklmn'; row.time = { created: 3 + shift, completed: 6 + shift };
  for (const part of row.content) part.time = { created: 4 + shift, ran: 4 + shift, completed: 5 + shift };
  rows.push(row);
  attempts.push({ attemptKey: (index + 12).toString(16).repeat(64), requestHash: String(index + 4).repeat(64), result: hostedResult({ toolCalls: emitted }, String(index + 4).repeat(64)) });
  next.messages.push({ role: 'assistant', content: null, tool_calls: emitted.map((call, position) => ({ id: group[position].historyID, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) },
   ...emitted.map((call, position) => ({ role: 'tool', tool_call_id: group[position].historyID, content: 'Synthetic result ' + call.id })));
 }
 return { rows, attempts, next };
}
const verifyHistoryAttempt = attempt => attempt.result.receipt.nativeRequestHash === attempt.requestHash;

test('hosted history maps the exact47-character native call only on replay and retains short IDs', () => {
 for (const [id, historyID] of [[longToolID, loweredToolID], ['call-short', 'call-short']]) {
  const fixture = hostedHistory([[{ id, historyID }]]), before = structuredClone(fixture); let verified = 0;
  const result = deriveResearchFrontier(expected, fixture.rows, fixture.attempts, fixture.next, 'tavily-hosted', attempt => {
   verified++; assert.equal(attempt.result.toolCalls[0].id, id); return verifyHistoryAttempt(attempt);
  });
  assert.ok(result); assert.equal(verified, 1); assert.equal(result.frontier.steps[0].calls[0].id, id);
  assert.deepEqual(fixture, before);
  assert.equal(deriveResearchFrontier(expected, fixture.rows, fixture.attempts, fixture.next, 'tavily-hosted', () => false), null);
 }
});

test('hosted history rejects forged suffixes, unnormalized history and changed native or result IDs', () => {
 const fixture = hostedHistory([[{ id: longToolID, historyID: loweredToolID }]]);
 assert.ok(deriveResearchFrontier(expected, fixture.rows, fixture.attempts, fixture.next, 'tavily-hosted', verifyHistoryAttempt));
 for (const mutate of [
  value => { value.next.messages.at(-2).tool_calls[0].id = longToolID; },
  value => { value.next.messages.at(-2).tool_calls[0].id = loweredToolID + 'forged'; },
  value => { value.next.messages.at(-1).tool_call_id = longToolID; },
  value => { value.next.messages.at(-1).tool_call_id = loweredToolID.slice(0, -1) + 'X'; },
  value => { value.rows[1].content[0].id = loweredToolID; },
  value => { value.rows[1].content[0].id = loweredToolID + 'FORGED!'; },
  value => { value.attempts[0].result.toolCalls[0].id = loweredToolID + 'FORGED!'; },
  value => { value.next.messages.at(-2).tool_calls[0].function.name = 'panda_research_echo'; },
  value => { value.next.messages.at(-2).tool_calls[0].function.arguments = '{"query":"changed"}'; },
 ]) {
  const changed = structuredClone(fixture); mutate(changed);
  assert.equal(deriveResearchFrontier(expected, changed.rows, changed.attempts, changed.next, 'tavily-hosted', verifyHistoryAttempt), null);
 }
});

test('hosted history denies mapped collisions within calls and across the whole current frontier', () => {
 const otherID = 'call_model_22345678-1234-1234-1234-123456789abc', otherHistory = 'call_model_22345678-1234-1234-1234-12345';
 for (const groups of [
  [[{ id: longToolID, historyID: loweredToolID }, { id: otherID, historyID: otherHistory }]],
  [[{ id: longToolID, historyID: loweredToolID }], [{ id: otherID, historyID: otherHistory }]],
 ]) {
  const fixture = hostedHistory(groups);
  assert.ok(deriveResearchFrontier(expected, fixture.rows, fixture.attempts, fixture.next, 'tavily-hosted', verifyHistoryAttempt));
  for (const collidingID of [loweredToolID + 'OTHER!!', loweredToolID]) {
   const colliding = groups.map(group => group.map(call => call.id === otherID ? { id: collidingID, historyID: loweredToolID } : call));
   const collision = hostedHistory(colliding);
   assert.equal(deriveResearchFrontier(expected, collision.rows, collision.attempts, collision.next, 'tavily-hosted', verifyHistoryAttempt), null);
  }
 }
});

test('synthetic history retains long IDs and never applies hosted replay normalization', () => {
 for (const profile of ['synthetic-echo', 'tavily-search']) {
  const emitted = [{ id: longToolID, name: profile === 'synthetic-echo' ? 'panda_research_echo' : 'panda_research_search', arguments: { query: 'public fixture' } }];
  const next = continued(emitted); next.tools = structuredClone(body.tools); next.tools[0].function.name = emitted[0].name;
  const row = nativeAssistant(emitted), attempt = { attemptKey: key, result: { toolCalls: emitted, usage } };
  assert.ok(deriveResearchFrontier(expected, [user, row], [attempt], next, profile));
  const changed = structuredClone(next); changed.messages.at(-2).tool_calls[0].id = loweredToolID; changed.messages.at(-1).tool_call_id = loweredToolID;
  assert.equal(deriveResearchFrontier(expected, [user, row], [attempt], changed, profile), null);
 }
});

test('hosted SSE emits the original settled long ID without history normalization', async () => {
 const input = hostedBody(body), value = hostedResult({ toolCalls: [{ id: longToolID, name: 'panda_research_search', arguments: { query: 'RP2040 PIO documentation' } }] }, hashResearchValue(input));
 await fixture(async ({ gateway, settled }) => {
  const response = await gateway.handle(request(input)); assert.equal(response.status, 200);
  const frames = response.body.toString().split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
  const emitted = frames.flatMap(frame => frame.choices[0]?.delta.tool_calls ?? []);
  assert.equal(emitted[0].id, longToolID); assert.equal(settled[0].toolCalls[0].id, longToolID);
 }, { profile: 'tavily-hosted', verifyHostedResult: (binding, result) => binding.requestHash === result.receipt.nativeRequestHash, complete: async (_body, before) => { assert.equal(await before(), true); return value; } });
});

test('final paid stop must belong to this record and equal the exact native final text',()=>{
 const finalID='msg_000000000004abcdefghijklmn',firstHash='d'.repeat(64),lastHash='e'.repeat(64),finalKey='f'.repeat(64);
 const turn={binding:key,owner:token,runID:'00000000-0000-4000-8000-000000000001',messageID,promptHash:expected.promptHash,sourceRevision:key,generation};
 const tool=hostedResult({toolCalls:[{...calls[0],name:'panda_research_search'}]},firstHash),stop=hostedResult({content:'Verified final text.'},lastHash);
 const attempts=[{attemptKey:key,requestHash:firstHash,resultHash:hashResearchValue(tool),result:tool,assistantMessageID:assistantID},{attemptKey:finalKey,requestHash:lastHash,resultHash:hashResearchValue(stop),result:stop}];
 const row=nativeAssistant();row.content[0].name='panda_research_search';const rows=[user,row,{id:finalID,type:'assistant',finish:'stop',time:{created:7,completed:8},content:[{type:'text',text:stop.content}]},{id:'msg_000000000005abcdefghijklmn',type:'idle',outcome:'succeeded',time:{created:9}}];
 const record={receipt:turn,state:'accepted',operations:attempts.map(a=>({kind:'primary',key:a.attemptKey,requestHash:a.requestHash,resultHash:a.resultHash,state:'settled'}))};
 record.operations[0].association={assistantMessageID:assistantID,callsDigest:hashResearchValue([{id:calls[0].id,name:'panda_research_search',inputHash:hashResearchValue(calls[0].arguments),status:'completed',contentHash:hashResearchValue(['Synthetic result '+calls[0].id])}])};
 const input={profile:'tavily-hosted',receipt:turn,record,session:{outcome:'succeeded',time:{created:1,updated:8,busy:2,idle:9}},active:false,messages:rows,attempts},verify=a=>a.result.receipt.nativeRequestHash===a.requestHash;
 assert.deepEqual(matchResearchStopResult(input,verify),{operationKey:finalKey,resultHash:attempts[1].resultHash,assistantMessageID:finalID,content:stop.content,callsDigest:hashResearchValue([])});
 for(const mutate of [v=>{v.messages[2].content[0].text+=' extra';},v=>{v.attempts[1].result.receipt.generationId='gen-FOREIGN';},v=>{v.attempts[1].requestHash=key;},v=>{v.record.receipt={...v.record.receipt,runID:'00000000-0000-4000-8000-000000000002'};},v=>{v.attempts[0].assistantMessageID=finalID;},v=>{v.record.operations[1].state='sent';}]){const changed=structuredClone(input);mutate(changed);assert.equal(matchResearchStopResult(changed,verify),null);}
});
test('initial frontier uses only admitted user and excludes completed older turns',()=>{
  const rows=[{id:'msg_000000000000abcdefghijklmn',type:'assistant',content:[],time:{created:1,completed:1}},user];
  assert.deepEqual(deriveResearchFrontier(expected,rows,[],body),{frontier:{v:1,messageID,steps:[]},associations:[]});
  assert.equal(deriveResearchFrontier(expected,[{...user,text:'foreign'}],[],body),null);
  assert.equal(deriveResearchFrontier(expected,[user,nativeAssistant()],[],body),null);
  assert.equal(deriveResearchFrontier(expected,[user],[],{...body,messages:[{role:'user',content:'Other'}]}),null);
});

test('search profile gateway and frontier accept only selected search tool identities', async () => {
  const selectedCalls = [{ ...calls[0], name: 'panda_research_search' }];
  const selectedBody = structuredClone(body); selectedBody.tools[0].function.name = 'panda_research_search';
  const selectedContinuation = continued(selectedCalls); selectedContinuation.tools = selectedBody.tools;
  assert.ok(deriveResearchFrontier(expected, [user], [], selectedBody, 'tavily-search'));
  assert.ok(deriveResearchFrontier(expected, [user, nativeAssistant(selectedCalls)], [{ attemptKey: key, result: { toolCalls: selectedCalls, usage } }], selectedContinuation, 'tavily-search'));
  assert.equal(deriveResearchFrontier(expected, [user], [], body, 'tavily-search'), null);
  assert.equal(deriveResearchFrontier(expected, [user], [], selectedBody), null);
  assert.equal(deriveResearchFrontier(expected, [user], [], selectedBody, 'foreign'), null);
  await fixture(async ({ gateway, events }) => {
    assert.equal((await gateway.handle(request(body))).status, 400); assert.deepEqual(events, []);
    const result = await gateway.handle(request(selectedBody)); assert.equal(result.status, 200);
    assert.match(result.body.toString(), /panda_research_search/);
  }, { profile: 'tavily-search', complete: async (_body, before) => { assert.equal(await before(), true); return { toolCalls: selectedCalls, usage }; } });
  await fixture(async ({ gateway, settled }) => { assert.equal((await gateway.handle(request(selectedBody))).status, 503); assert.deepEqual(settled, []); }, { profile: 'tavily-search' });
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
test('native error result binds the exact OpenCode error envelope on the wire and hashes the empty projection',()=>{
  const error={type:'tool.execution',message:'Public search unavailable'},wire=JSON.stringify({error,content:[]});
  const errored=(stateError=error)=>{const a=nativeAssistant();a.content[0].state={status:'error',input:calls[0].arguments,error:stateError};return a;};
  const send=value=>{const next=continued();next.messages.at(-1).content=value;return next;};
  const result=deriveResearchFrontier(expected,[user,errored()],[{attemptKey:key,result:toolResult}],send(wire));
  assert.equal(result.frontier.steps[0].calls[0].status,'error');assert.equal(result.frontier.steps[0].calls[0].contentHash,sha('[]'));
  assert.ok(deriveResearchFrontier(expected,[user,errored()],[{attemptKey:key,result:toolResult}],send([{type:'text',text:wire}])));
  for(const [state,value] of [[error,[]],[error,''],[error,JSON.stringify({error:{...error,message:'Other'},content:[]})],[error,JSON.stringify({content:[],error})],[error,wire+' '],
   ['Private error',wire],[{...error,extra:1},wire],[{type:'tool.execution',message:'Private native detail'},JSON.stringify({error:{type:'tool.execution',message:'Private native detail'},content:[]})],[{type:'tool.other',message:error.message},JSON.stringify({error:{type:'tool.other',message:error.message},content:[]})],[{type:'Tool Execution',message:'x'},JSON.stringify({error:{type:'Tool Execution',message:'x'},content:[]})],[{type:'tool.execution',message:''},JSON.stringify({error:{type:'tool.execution',message:''},content:[]})]])
   assert.equal(deriveResearchFrontier(expected,[user,errored(state)],[{attemptKey:key,result:toolResult}],send(value)),null);
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

const hostedProfiles = { 'tavily-hosted': 'openai/gpt-oss-20b', 'tavily-hosted-luna': 'openai/gpt-6-luna', 'tavily-hosted-terra': 'openai/gpt-6.1-terra', 'tavily-hosted-haiku': 'anthropic/claude-haiku-5.5' };
const reservations = { 'tavily-hosted': 1410001, 'tavily-hosted-luna': 4785001, 'tavily-hosted-terra': 47850001, 'tavily-hosted-haiku': 6750001 };
function costFrontier(profile, costNanoUsd, inputTokens) {
 const row = nativeAssistant(); row.content[0].name = 'panda_research_search';
 const next = { ...hostedBody(continued()), model: hostedProfiles[profile] };
 const result = hostedResult({ toolCalls: [{ ...calls[0], name: 'panda_research_search' }] }); result.usage.costNanoUsd = costNanoUsd; if (inputTokens !== undefined) result.usage.inputTokens = inputTokens;
 return deriveResearchFrontier(expected, [user, row], [{ attemptKey: key, requestHash: key, result }], next, profile, a => a.result.receipt.nativeRequestHash === a.requestHash);
}

test('hosted family: each profile binds only its own model and rejects unknown profiles', () => {
 for (const [profile, model] of Object.entries(hostedProfiles)) {
  assert.equal(validResearchProviderBody({ ...hostedBody(body), model, max_completion_tokens: 700 }, profile), true, profile);
  assert.equal(validResearchProviderBody({ ...hostedBody(body), model, max_completion_tokens: 701 }, profile), false, profile);
  for (const other of Object.values(hostedProfiles)) if (other !== model) assert.equal(validResearchProviderBody({ ...hostedBody(body), model: other }, profile), false);
  // An extra outgoing message key (for example Anthropic cache_control) is rejected, never ignored.
  for (const index of [0, 1, 2]) {
   const extra = { ...hostedBody(body), model }; extra.messages[index] = { ...extra.messages[index], cache_control: { type: 'ephemeral' } };
   assert.equal(validResearchProviderBody(extra, profile), false, profile + ' message ' + index);
  }
 }
 for (const profile of ['tavily-hosted-sonnet', 'tavily-hosted-', 'hosted']) assert.equal(validResearchProviderBody(hostedBody(body), profile), false);
});

test('hosted result cost cap is the selected model reservation, per profile', () => {
 for (const [profile, reservation] of Object.entries(reservations)) {
  assert.ok(costFrontier(profile, reservation), profile + ' at reservation');
  assert.equal(costFrontier(profile, reservation + 1), null, profile + ' above reservation');
  const maxInput = profile === 'tavily-hosted' ? 16000 : 32000;
  assert.ok(costFrontier(profile, 1, maxInput), profile + ' at input cap');assert.equal(costFrontier(profile, 1, maxInput + 1), null, profile + ' above input cap');
 }
 // A Terra-sized cost is valid only for Terra.
 assert.ok(costFrontier('tavily-hosted-terra', 20000000));
 for (const profile of ['tavily-hosted', 'tavily-hosted-luna', 'tavily-hosted-haiku']) assert.equal(costFrontier(profile, 20000000), null, profile);
});

test('matchResearchStopResult requires a hosted profile and uses its cost cap', () => {
 const finalID = 'msg_000000000004abcdefghijklmn', lastHash = 'e'.repeat(64), finalKey = 'f'.repeat(64);
 const turn = { binding: key, owner: token, runID: '00000000-0000-4000-8000-000000000001', messageID, promptHash: expected.promptHash, sourceRevision: key, generation };
 const verify = a => a.result.receipt.nativeRequestHash === a.requestHash;
 const build = cost => {
  const stop = hostedResult({ content: 'Verified final text.' }, lastHash); stop.usage.costNanoUsd = cost;
  const attempts = [{ attemptKey: finalKey, requestHash: lastHash, resultHash: hashResearchValue(stop), result: stop }];
  const rows = [user, { id: finalID, type: 'assistant', finish: 'stop', time: { created: 7, completed: 8 }, content: [{ type: 'text', text: stop.content }] }, { id: 'msg_000000000005abcdefghijklmn', type: 'idle', outcome: 'succeeded', time: { created: 9 } }];
  const record = { receipt: turn, state: 'accepted', operations: [{ kind: 'primary', key: finalKey, requestHash: lastHash, resultHash: hashResearchValue(stop), state: 'settled', association: { assistantMessageID: finalID, callsDigest: hashResearchValue([]) } }] };
  return { receipt: turn, record, session: { outcome: 'succeeded', time: { created: 1, updated: 8, busy: 2, idle: 9 } }, active: false, messages: rows, attempts };
 };
 const terra = build(20000000);
 assert.ok(matchResearchStopResult({ ...terra, profile: 'tavily-hosted-terra' }, verify));
 for (const profile of ['tavily-hosted', 'tavily-hosted-luna', 'tavily-hosted-haiku']) assert.equal(matchResearchStopResult({ ...terra, profile }, verify), null, profile);
 const missing = { ...terra };
 for (const bad of [missing, { ...terra, profile: 'tavily-search' }, { ...terra, profile: 'synthetic-echo' }, { ...terra, profile: 'tavily-hosted-foreign' }, { ...terra, profile: undefined }]) assert.equal(matchResearchStopResult(bad, verify), null);
 assert.ok(matchResearchStopResult({ ...build(1410001), profile: 'tavily-hosted' }, verify));
 assert.equal(matchResearchStopResult({ ...build(1410002), profile: 'tavily-hosted' }, verify), null);
});

test('history call IDs: openai profiles truncate to 40; Haiku sanitizes [^A-Za-z0-9_-] to _ without truncation (observed OpenCode 2.2.5)', () => {
 const id64 = 'call_' + 'A'.repeat(59), idPunct = 'call_model.1234:5678-1234-1234-1234-123456789abc';
 assert.equal(id64.length, 64);
 for (const [profile, model] of Object.entries(hostedProfiles)) {
  const max = model.startsWith('openai/') ? 40 : null, sanitize = model.startsWith('anthropic/');
  for (const id of [id64, idPunct, 'call-short']) {
   const clean = sanitize ? id.replace(/[^A-Za-z0-9_-]/g, '_') : id;
   const historyID = max === null ? clean : clean.slice(0, max), wrongID = clean !== id ? id : max === null ? id.slice(0, 40) : id;
   const fixture = hostedHistory([[{ id, historyID }]], model);
   const verifyId = attempt => attempt.result.receipt.nativeRequestHash === attempt.requestHash;
   assert.ok(deriveResearchFrontier(expected, fixture.rows, fixture.attempts, fixture.next, profile, verifyId), profile + ' ' + id.length);
   if (wrongID !== historyID) {
    const bad = hostedHistory([[{ id, historyID: wrongID }]], model);
    assert.equal(deriveResearchFrontier(expected, bad.rows, bad.attempts, bad.next, profile, verifyId), null, profile + ' wrong history id');
   }
  }
 }
});
test('Haiku history IDs that collide after sanitizing are rejected', () => { const profile = Object.entries(hostedProfiles).find(([, model]) => model.startsWith('anthropic/'))[0], model = hostedProfiles[profile]; const verifyId = attempt => attempt.result.receipt.nativeRequestHash === attempt.requestHash; const fixture = hostedHistory([[{ id: 'call.a', historyID: 'call_a' }, { id: 'call:a', historyID: 'call_a' }]], model); assert.equal(deriveResearchFrontier(expected, fixture.rows, fixture.attempts, fixture.next, profile, verifyId), null);});

// ---- C4 image binding ----
const visionNames = ['tavily-hosted-luna', 'tavily-hosted-terra', 'tavily-hosted-haiku'];
const imgBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic png body')]);
const imgSha = sha(imgBytes), imgUri = 'data:image/png;base64,' + imgBytes.toString('base64');
const imgPart = (url = imgUri) => ({ type: 'image_url', image_url: { url } });
const imgContent = (text = 'Now', url) => [{ type: 'text', text }, imgPart(url)];
const imgFile = (over = {}) => ({ data: imgBytes.toString('base64'), mime: 'image/png', source: { type: 'inline' }, name: 'image.png', ...over });
const imgRow = { ...user, files: [imgFile()] }, imgExpected = { ...expected, imageSha256: imgSha };
const visionBody = profile => { const b = { ...hostedBody(body), model: hostedProfiles[profile] }; b.messages = structuredClone(b.messages); b.messages.at(-1).content = imgContent(); return b; };
const allow = () => true;

test('provider body accepts one trailing image only for vision profiles and only in a user message', () => {
 for (const profile of visionNames) {
  assert.equal(validResearchProviderBody(visionBody(profile), profile), true, profile);
  const textOnly = { ...visionBody(profile) }; textOnly.messages = textOnly.messages.map(m => ({ ...m })); textOnly.messages.at(-1).content = 'Now';
  assert.equal(validResearchProviderBody(textOnly, profile), true, 'text-only unchanged');
  const variants = [];
  const add = mutate => { const b = structuredClone(visionBody(profile)); mutate(b); variants.push(b); };
  add(b => { b.messages[0].content = imgContent('System'); });
  add(b => { b.messages[2].content = imgContent('History'); });
  add(b => { b.messages[2] = { role: 'assistant', content: null, tool_calls: undefined }; b.messages[2].content = imgContent('History'); delete b.messages[2].tool_calls; });
  add(b => { b.messages.push({ role: 'tool', tool_call_id: 'call-1', content: imgContent('Result') }); });
  add(b => { b.messages.at(-1).content.push(imgPart()); });
  add(b => { b.messages[1].content = imgContent('Before'); });
  add(b => { b.messages.at(-1).content = [imgPart(), { type: 'text', text: 'Now' }]; });
  add(b => { b.messages.at(-1).content = [imgPart()]; });
  add(b => { b.messages.at(-1).content[1].image_url.detail = 'high'; });
  add(b => { b.messages.at(-1).content[1].image_url.url = 'https://example.test/a.png'; });
  add(b => { b.messages.at(-1).content[1].image_url.url = imgUri.replace('image/png', 'image/jpeg'); });
  add(b => { b.messages.at(-1).content[1].image_url.url = imgUri.replace(/=+$/, ''); });
  add(b => { b.messages.at(-1).content[1].image_url.url = 'data:image/png;base64,' + 'A'.repeat(65540); });
  add(b => { b.messages.at(-1).content[1] = { type: 'image_url', url: imgUri }; });
  for (const [index, variant] of variants.entries()) assert.equal(validResearchProviderBody(variant, profile), false, profile + ' variant ' + index);
 }
 for (const profile of ['tavily-hosted', 'tavily-search', 'synthetic-echo']) {
  const b = structuredClone(visionBody('tavily-hosted-luna')); b.model = profile === 'tavily-hosted' ? 'openai/gpt-oss-20b' : profile === 'tavily-search' ? 'panda-fixture' : 'panda-fixture';
  assert.equal(validResearchProviderBody(b, profile), false, 'non-vision ' + profile);
 }
});

test('frontier binds the single image to the bound user message and the receipt hash', () => {
 for (const profile of visionNames) {
  const next = visionBody(profile);
  assert.ok(deriveResearchFrontier(imgExpected, [imgRow], [], next, profile, allow), profile);
  assert.equal(deriveResearchFrontier(expected, [imgRow], [], next, profile, allow), null, 'image on a text receipt');
  assert.equal(deriveResearchFrontier(expected, [user], [], next, profile, allow), null, 'image in provider body on a text receipt');
  assert.equal(deriveResearchFrontier(imgExpected, [user], [], next, profile, allow), null, 'receipt image but native row has none');
  assert.equal(deriveResearchFrontier(imgExpected, [imgRow], [], { ...next, messages: next.messages.map((m, i, all) => i === all.length - 1 ? { ...m, content: 'Now' } : m) }, profile, allow), null, 'missing image on an image receipt');
  assert.equal(deriveResearchFrontier({ ...imgExpected, imageSha256: sha('other') }, [imgRow], [], next, profile, allow), null, 'wrong hash');
  assert.equal(deriveResearchFrontier({ ...imgExpected, imageSha256: 'ABC' }, [imgRow], [], next, profile, allow), null, 'non-hex hash');
  assert.equal(deriveResearchFrontier(imgExpected, [{ ...imgRow, files: [imgFile(), imgFile()] }], [], next, profile, allow), null, 'extra native file');
  assert.equal(deriveResearchFrontier(imgExpected, [{ ...imgRow, files: [imgFile({ mime: 'image/jpeg' })] }], [], next, profile, allow), null, 'wrong native mime');
  assert.equal(deriveResearchFrontier(imgExpected, [{ ...imgRow, files: [imgFile({ data: imgBytes.toString('base64').replace(/=+$/, '') })] }], [], next, profile, allow), null, 'non-canonical native base64');
  const other = Buffer.concat([imgBytes, Buffer.from('x')]), swapped = structuredClone(next); swapped.messages.at(-1).content[1].image_url.url = 'data:image/png;base64,' + other.toString('base64');
  assert.equal(deriveResearchFrontier(imgExpected, [imgRow], [], swapped, profile, allow), null, 'provider image bytes differ from the receipt');
  const history = structuredClone(next); history.messages[1].content = imgContent('Before');
  history.messages.at(-1).content = imgContent();
  assert.equal(deriveResearchFrontier(imgExpected, [imgRow], [], history, profile, allow), null, 'image in history');
  const earlier = structuredClone(next); earlier.messages[1].content = imgContent('Before'); earlier.messages.at(-1).content = 'Now';
  assert.equal(deriveResearchFrontier(expected, [user], [], earlier, profile, allow), null, 'image only in a history message');
  const changedText = structuredClone(next); changedText.messages.at(-1).content[0].text = 'Now there';
  assert.equal(deriveResearchFrontier(imgExpected, [imgRow], [], changedText, profile, allow), null, 'text part must hash to promptHash');
  const note = { ...imgRow, text: 'Now' + 'ERROR: Cannot read "image.png" (this model does not support image input). Inform the user.' };
  assert.equal(deriveResearchFrontier(imgExpected, [note], [], next, profile, allow), null, 'OpenCode text-only note changes the row text');
  const noteBody = structuredClone(next); noteBody.messages.at(-1).content = note.text;
  assert.equal(deriveResearchFrontier(expected, [note], [], noteBody, profile, allow), null, 'note text fails the promptHash frontier');
 }
 const textBody = { ...hostedBody(body) }; assert.ok(deriveResearchFrontier(expected, [user], [], textBody, 'tavily-hosted', allow), 'text-only GPT-OSS unchanged');
 const gptNote = { ...user, text: 'Now' + 'ERROR: Cannot read "image.png" (this model does not support image input). Inform the user.' };
 assert.equal(deriveResearchFrontier(expected, [gptNote], [], textBody, 'tavily-hosted', allow), null);
 assert.equal(deriveResearchFrontier(imgExpected, [imgRow], [], visionBody('tavily-hosted-luna'), 'tavily-hosted', allow), null, 'GPT-OSS never carries an image');
});

test('image survives a tool round: the same image is re-sent only inside the bound user message', () => {
 for (const profile of visionNames) {
  const model = hostedProfiles[profile], fixture = hostedHistory([[{ id: 'call-1', historyID: 'call-1' }]], model);
  const lastUser = fixture.next.messages.findLastIndex(m => m.role === 'user'); fixture.next.messages[lastUser].content = imgContent();
  const rows = [structuredClone(imgRow), ...fixture.rows.slice(1)];
  assert.ok(deriveResearchFrontier(imgExpected, rows, fixture.attempts, fixture.next, profile, verifyHistoryAttempt), profile);
  const dropped = structuredClone(fixture.next); dropped.messages[lastUser].content = 'Now';
  assert.equal(deriveResearchFrontier(imgExpected, rows, fixture.attempts, dropped, profile, verifyHistoryAttempt), null, 'image missing after the tool round');
  const moved = structuredClone(fixture.next); moved.messages.push({ role: 'user', content: imgContent('Again') });
  assert.equal(deriveResearchFrontier(imgExpected, rows, fixture.attempts, moved, profile, verifyHistoryAttempt), null, 'extra user message with an image');
  const inTool = structuredClone(fixture.next); inTool.messages.at(-1).content = imgContent('Synthetic result call-1');
  assert.equal(deriveResearchFrontier(imgExpected, rows, fixture.attempts, inTool, profile, verifyHistoryAttempt), null, 'image inside a tool result');
  const inAssistant = structuredClone(fixture.next); inAssistant.messages[lastUser + 1].content = imgContent('Public documentation.');
  assert.equal(deriveResearchFrontier(imgExpected, rows, fixture.attempts, inAssistant, profile, verifyHistoryAttempt), null, 'image inside an assistant message');
 }
});

test('final paid stop with an image receipt requires the exact stored image row', () => {
 const profile = 'tavily-hosted-luna', finalID = 'msg_000000000004abcdefghijklmn', firstHash = 'd'.repeat(64), lastHash = 'e'.repeat(64), finalKey = 'f'.repeat(64);
 const turn = { binding: key, owner: token, runID: '00000000-0000-4000-8000-000000000001', messageID, promptHash: expected.promptHash, sourceRevision: key, generation, imageSha256: imgSha };
 const tool = hostedResult({ toolCalls: [{ ...calls[0], name: 'panda_research_search' }] }, firstHash), stop = hostedResult({ content: 'Verified final text.' }, lastHash);
 const attempts = [{ attemptKey: key, requestHash: firstHash, resultHash: hashResearchValue(tool), result: tool, assistantMessageID: assistantID }, { attemptKey: finalKey, requestHash: lastHash, resultHash: hashResearchValue(stop), result: stop }];
 const row = nativeAssistant(); row.content[0].name = 'panda_research_search';
 const rows = [structuredClone(imgRow), row, { id: finalID, type: 'assistant', finish: 'stop', time: { created: 7, completed: 8 }, content: [{ type: 'text', text: stop.content }] }, { id: 'msg_000000000005abcdefghijklmn', type: 'idle', outcome: 'succeeded', time: { created: 9 } }];
 const record = { receipt: turn, state: 'accepted', operations: attempts.map(a => ({ kind: 'primary', key: a.attemptKey, requestHash: a.requestHash, resultHash: a.resultHash, state: 'settled' })) };
 record.operations[0].association = { assistantMessageID: assistantID, callsDigest: hashResearchValue([{ id: calls[0].id, name: 'panda_research_search', inputHash: hashResearchValue(calls[0].arguments), status: 'completed', contentHash: hashResearchValue(['Synthetic result ' + calls[0].id]) }]) };
 const input = { profile, receipt: turn, record, session: { outcome: 'succeeded', time: { created: 1, updated: 8, busy: 2, idle: 9 } }, active: false, messages: rows, attempts }, verify = a => a.result.receipt.nativeRequestHash === a.requestHash;
 assert.deepEqual(matchResearchStopResult(input, verify), { operationKey: finalKey, resultHash: attempts[1].resultHash, assistantMessageID: finalID, content: stop.content, callsDigest: hashResearchValue([]) });
 for (const mutate of [v => { delete v.messages[0].files; }, v => { v.messages[0].files = []; }, v => { v.messages[0].files[0].mime = 'image/jpeg'; }, v => { v.messages[0].files.push(imgFile()); },
  v => { v.receipt = { ...v.receipt, imageSha256: sha('other') }; v.record.receipt = v.receipt; }, v => { delete v.receipt.imageSha256; delete v.record.receipt.imageSha256; }]) {
  const changed = structuredClone(input); mutate(changed); assert.equal(matchResearchStopResult(changed, verify), null);
 }
});

test('a non-primary request kind carrying an image is denied before body review', async () => {
 const denied = [];
 await fixture(async ({ gateway, events }) => {
  const response = await gateway.handle(request(visionBody('tavily-hosted-luna'), { headers: { ...headers, 'x-panda-native-kind': 'title' } }));
  assert.equal(response.status, 403); assert.deepEqual(denied, ['title']); assert.deepEqual(events, []);
 }, { denied: async kind => { denied.push(kind); } });
});
