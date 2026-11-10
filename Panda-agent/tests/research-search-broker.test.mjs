import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openResearchRuntimeStore,hashResearchJSON} from '../src/server/research-runtime-store.ts';
import {hostedTavilyRequestHash,searchHostedPublicWeb} from '../src/search/tavily.ts';
import {createResearchSearchBroker,verifyResearchSearchFixtureAnswer} from '../src/server/research-search-broker.ts';

const sha=s=>createHash('sha256').update(s).digest('hex'),query='RP2040 PIO official documentation';
const sessionID='ses_000000000001abcdefghijklmn',messageID='msg_000000000002abcdefghijklmn',assistantID='msg_000000000003abcdefghijklmn';
const stamp='2026-11-11T00:00:00.000Z';
function source(content='PIO is a programmable input/output block.',suffix='pio'){
 const url='https://www.raspberrypi.com/documentation/'+suffix;
 return {handle:`web:${sha(url)}:${sha(content)}:${sha(content)}`,url,title:'Official public documentation',content,capturedAt:stamp};
}
function receipt(sources=[source()]){return{version:1,provider:'tavily',operation:'search',requestHash:hostedTavilyRequestHash(query),requestId:'synthetic-provider-receipt',startedAt:stamp,completedAt:stamp,durationMs:1,usage:{credits:1,costNanoUsd:null},sources};}
async function fixture(run,changes={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'panda-search-broker-'));
 const binding={binding:'a'.repeat(64),owner:'b'.repeat(64),sessionID,profileHash:'c'.repeat(64),imageId:'sha256:'+'d'.repeat(64),created:1};
 const generation='e'.repeat(64),turn={binding:binding.binding,owner:binding.owner,runID:randomUUID(),messageID,promptHash:sha('Find public RP2040 documentation.'),sourceRevision:'0'.repeat(64),generation};
 const envelope={sessionID,assistantMessageID:assistantID,toolID:'call-search-1',generation,inputHash:hashResearchJSON({query}),input:{query}};
 const native={session:{id:sessionID,metadata:{pandaResearch:{binding:binding.binding,owner:binding.owner,profileHash:binding.profileHash}}},active:true,messages:[{id:messageID,type:'user',text:'Find public RP2040 documentation.',time:{created:2}},{id:assistantID,type:'assistant',time:{created:3},content:[{type:'tool',id:envelope.toolID,name:'panda_research_search',state:{status:'running',input:{query}},time:{created:4,ran:4}}]}]};
 let dispatches=0,current=true;const store=await openResearchRuntimeStore(root,{isCurrent:()=>current});
 await store.createBinding(binding);assert.equal(await store.startGeneration(binding,null,generation),true);assert.equal((await store.claimCreate(binding,generation)).state,'dispatch');assert.equal(await store.markCreated(binding,generation,{sessionID,profileHash:binding.profileHash}),true);assert.equal((await store.admitRun(turn)).state,'admitted');assert.equal((await store.claimPrompt(turn)).state,'dispatch');
 const options={store,binding,generation,currentReceipt:()=>turn,readNative:async()=>native,allowPublicQuery:q=>q===query,
  search:async(_query,beforeSend)=>{assert.equal(await beforeSend(),true);dispatches++;return receipt();},...changes};
 const broker=createResearchSearchBroker(options),request=(value=envelope)=>({method:'POST',path:'/search',body:Buffer.from(JSON.stringify(value))});
 const operation=()=>({kind:'tool',key:hashResearchJSON({runID:turn.runID,assistantMessageID:assistantID,toolID:envelope.toolID}),requestHash:hashResearchJSON({name:'panda_research_search',input:envelope.input})});
 try{await run({store,binding,generation,turn,envelope,native,options,broker,request,operation,dispatches:()=>dispatches,setCurrent:v=>{current=v;}});}finally{await rm(root,{recursive:true,force:true});}
}

test('native search settles exact private receipt before delivery and duplicates use cache',async()=>fixture(async f=>{
 const first=await f.broker.handle(f.request());assert.equal(first.status,200);const mcp=JSON.parse(first.body.toString());assert.equal(JSON.parse(mcp.content[0].text).kind,'tavily_excerpt');assert.doesNotMatch(first.body.toString(),/synthetic-provider-receipt|credits|costNanoUsd/);
 const cached=await f.broker.handle(f.request());assert.equal(cached.status,200);assert.deepEqual(cached.body,first.body);assert.equal(f.dispatches(),1);
 const saved=await f.store.recoverOperation(f.turn,f.operation());assert.equal(saved.state,'cached');assert.equal(saved.result.receipt.usage.credits,1);assert.deepEqual(saved.result.mcp,mcp);
}));

test('the hosted adapter receipt with a printable request ID settles through the broker',async()=>fixture(async f=>{
 const s=source();let sends=0;
 f.options.search=(q,beforeSend,signal)=>searchHostedPublicWeb(q,{apiKey:'synthetic-test-key',beforeSend,signal,now:()=>new Date(stamp),lookupImpl:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:async()=>{sends++;return new Response(JSON.stringify({request_id:'request 123',usage:{credits:1},results:[{url:s.url,title:s.title,content:s.content}]}),{headers:{'content-type':'application/json'}});}});
 assert.equal((await f.broker.handle(f.request())).status,200);assert.equal(sends,1);const cached=await f.store.recoverOperation(f.turn,f.operation());assert.equal(cached.state,'cached');assert.equal(cached.result.receipt.requestId,'request 123');
}));

test('foreign native identity, inactive state and denied public scope cannot claim a search',async()=>{
 await fixture(async f=>{for(const mutate of [v=>{v.sessionID='ses_000000000009abcdefghijklmn';},v=>{v.assistantMessageID='msg_000000000009abcdefghijklmn';},v=>{v.toolID='foreign';},v=>{v.generation='f'.repeat(64);},v=>{v.inputHash='f'.repeat(64);},v=>{v.extra=true;}]){const v=structuredClone(f.envelope);mutate(v);assert.equal((await f.broker.handle(f.request(v))).status,403);}f.native.active=false;assert.equal((await f.broker.handle(f.request())).status,403);assert.equal((await f.store.readRun(f.turn)).operations.length,0);assert.equal(f.dispatches(),0);});
 await fixture(async f=>{assert.equal((await f.broker.handle(f.request())).status,403);assert.equal((await f.store.readRun(f.turn)).operations.length,0);},{allowPublicQuery:()=>false});
});

test('strict wire, later users, changed owner and changed native tool input fail before claim',async()=>fixture(async f=>{
 for(const r of [{...f.request(),path:'/echo'},{...f.request(),method:'GET'},{...f.request(),body:Buffer.from('{"input":{},"input":{}}')},{...f.request(),body:Buffer.alloc(16385,32)}])assert.notEqual((await f.broker.handle(r)).status,200);
 f.native.messages.push({id:'msg_000000000004abcdefghijklmn',type:'user',text:'Later',time:{created:5}});assert.equal((await f.broker.handle(f.request())).status,403);f.native.messages.pop();
 f.native.session.metadata.pandaResearch.owner='f'.repeat(64);assert.equal((await f.broker.handle(f.request())).status,403);f.native.session.metadata.pandaResearch.owner=f.binding.owner;
 f.native.messages[1].content[0].state.input.query='Changed';assert.equal((await f.broker.handle(f.request())).status,403);assert.equal((await f.store.readRun(f.turn)).operations.length,0);
}));

test('an unknown sent request is never dispatched again',async()=>fixture(async f=>{
 let sends=0;f.options.search=async(_q,before)=>{assert.equal(await before(),true);sends++;throw Error('transport lost');};
 assert.equal((await f.broker.handle(f.request())).status,503);assert.equal((await f.broker.handle(f.request())).status,409);assert.equal(sends,1);assert.equal((await f.store.readRun(f.turn)).operations[0].state,'sent');
}));

test('a completion that skipped the send grant cannot settle or release',async()=>fixture(async f=>{
 f.options.search=async()=>receipt();assert.equal((await f.broker.handle(f.request())).status,503);assert.equal((await f.store.readRun(f.turn)).operations[0].state,'claimed');assert.equal((await f.broker.handle(f.request())).status,409);
}));

test('cancellation, source retirement and rotation after send retain settlement privately',async()=>{
 for(const transition of ['cancelled','source_retired','rotate','source_check'])await fixture(async f=>{
  f.options.search=async(_q,before)=>{assert.equal(await before(),true);if(transition==='rotate')assert.equal(await f.store.startGeneration(f.binding,f.generation,'f'.repeat(64)),true);else if(transition==='source_check')f.setCurrent(false);else assert.equal(await f.store.cancelRun(f.turn,transition),true);return receipt();};
  const result=await f.broker.handle(f.request());assert.equal(result.status,503);assert.doesNotMatch(result.body.toString(),/programmable|documentation/);assert.equal((await f.store.recoverOperation(f.turn,f.operation())).state,'cached');assert.equal(await f.store.current(f.turn),false);
 });
});

test('aborting after send preserves the verified receipt without model delivery',async()=>fixture(async f=>{
 const controller=new AbortController();f.options.search=async(_q,before)=>{assert.equal(await before(),true);controller.abort();return receipt();};
 assert.equal((await f.broker.handle(f.request(),controller.signal)).status,503);assert.equal((await f.store.recoverOperation(f.turn,f.operation())).state,'cached');
}));

test('malformed receipts and double-escaped oversized MCP remain unknown',async()=>{
 const variants=[r=>{r.requestHash='f'.repeat(64);},r=>{r.sources[0].handle='web:forged';},r=>{r.sources[0].url='https://secret.localdomain/docs';},r=>{r.usage.credits=Infinity;},r=>{r.sources[0].capturedAt='bad';},r=>{r.extra=true;},r=>{r.sources=[source('"'.repeat(5000),'one'),source('"'.repeat(5000),'two')];}];
 for(const mutate of variants)await fixture(async f=>{f.options.search=async(_q,before)=>{assert.equal(await before(),true);const value=receipt();mutate(value);return value;};assert.equal((await f.broker.handle(f.request())).status,503);assert.equal((await f.store.readRun(f.turn)).operations[0].state,'sent');});
});

test('corrupt cached MCP projection cannot be delivered as a verified search',async()=>fixture(async f=>{
 const operation=f.operation();assert.equal((await f.store.claimOperation(f.turn,operation)).state,'dispatch');const grant=await f.store.markSending(f.turn,operation);assert.ok(grant);
 assert.equal(await f.store.settleOperation(f.turn,operation,grant.grant,{receipt:receipt(),mcp:{content:[{type:'text',text:'forged'}]}}),true);
 assert.equal((await f.broker.handle(f.request())).status,503);assert.equal(f.dispatches(),0);
}));

test('simultaneous native duplicates cannot obtain two physical grants',async()=>fixture(async f=>{
 let release,entered;const ready=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});let sends=0;
 f.options.search=async(_q,before)=>{assert.equal(await before(),true);sends++;entered();await held;return receipt();};
 const first=f.broker.handle(f.request());await ready;assert.equal((await f.broker.handle(f.request())).status,409);release();assert.equal((await first).status,200);assert.equal(sends,1);
}));

test('fixture answer is parsed from native final JSON and resolves only exact admitted quotes',()=>{
 const admitted=receipt(),s=admitted.sources[0],good={answer:s.content,evidence:[{handle:s.handle,quote:s.content}]};
 assert.deepEqual(verifyResearchSearchFixtureAnswer(JSON.stringify(good),[admitted]),{state:'evidence',answer:s.content,citations:[{handle:s.handle,url:s.url,title:s.title,quote:s.content,capturedAt:stamp}]});
 assert.deepEqual(verifyResearchSearchFixtureAnswer('{"answer":"","evidence":[]}',[receipt([])]),{state:'insufficient'});
 for(const value of [{...good,extra:true},{...good,answer:'Inferred claim'},{...good,evidence:[...good.evidence,...good.evidence]},{answer:'Changed',evidence:[{handle:s.handle,quote:'Changed'}]},{answer:s.content,evidence:[{handle:'foreign',quote:s.content}]}])assert.deepEqual(verifyResearchSearchFixtureAnswer(JSON.stringify(value),[admitted]),{state:'invalid'});
 assert.deepEqual(verifyResearchSearchFixtureAnswer(JSON.stringify(good),[admitted,admitted]),{state:'invalid'});assert.deepEqual(verifyResearchSearchFixtureAnswer('{"answer":"x","answer":"y"}',[admitted]),{state:'invalid'});
});
