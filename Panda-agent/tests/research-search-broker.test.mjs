import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openResearchRuntimeStore,hashResearchJSON} from '../src/server/research-runtime-store.ts';
import {hostedTavilyRequestHash,searchHostedPublicWeb} from '../src/search/tavily.ts';
import {createResearchSearchBroker,verifyResearchSearchFixtureAnswer,verifyResearchAnswer,isPublicResearchQuery,registerResearchSourceAlias,researchPassages,researchSearchMCP} from '../src/server/research-search-broker.ts';

const sha=s=>createHash('sha256').update(s).digest('hex'),alias=s=>'S'+sha(s.handle).slice(0,16),query='RP2040 PIO official documentation';
const sessionID='ses_000000000001abcdefghijklmn',messageID='msg_000000000002abcdefghijklmn',assistantID='msg_000000000003abcdefghijklmn';
const stamp='2026-11-11T00:00:00.000Z';
function source(content='PIO is a programmable input/output block.',suffix='pio'){
 const url='https://www.raspberrypi.com/documentation/'+suffix;
 return {handle:`web:${sha(url)}:${sha(content)}:${sha(content)}`,url,title:'Official public documentation',content,capturedAt:stamp};
}
function receipt(sources=[source()]){return{version:1,provider:'tavily',operation:'search',requestHash:hostedTavilyRequestHash(query),requestId:'synthetic-provider-receipt',startedAt:stamp,completedAt:stamp,durationMs:1,usage:{credits:1,costNanoUsd:null},sources};}
async function fixture(run,changes={},extra={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'panda-search-broker-'));
 const binding={binding:'a'.repeat(64),owner:'b'.repeat(64),sessionID,profileHash:'c'.repeat(64),imageId:'sha256:'+'d'.repeat(64),created:1};
 const generation='e'.repeat(64),turn={binding:binding.binding,owner:binding.owner,runID:randomUUID(),messageID,promptHash:sha('Find public RP2040 documentation.'),sourceRevision:'0'.repeat(64),generation,...(extra.imageSha256===undefined?{}:{imageSha256:extra.imageSha256})};
 const envelope={sessionID,assistantMessageID:assistantID,toolID:'call-search-1',generation,inputHash:hashResearchJSON({query}),input:{query}};
 const native={session:{id:sessionID,metadata:{pandaResearch:{binding:binding.binding,owner:binding.owner,profileHash:binding.profileHash}}},active:true,messages:[{id:messageID,type:'user',text:'Find public RP2040 documentation.',...(extra.files===undefined?{}:{files:extra.files}),time:{created:2}},{id:assistantID,type:'assistant',time:{created:3},content:[{type:'tool',id:envelope.toolID,name:'panda_research_search',state:{status:'running',input:{query}},time:{created:4,ran:4}}]}]};
 let dispatches=0,current=true;const store=await openResearchRuntimeStore(root,{isCurrent:()=>current});
 await store.createBinding(binding);assert.equal(await store.startGeneration(binding,null,generation),true);assert.equal((await store.claimCreate(binding,generation)).state,'dispatch');assert.equal(await store.markCreated(binding,generation,{sessionID,profileHash:binding.profileHash}),true);assert.equal((await store.admitRun(turn)).state,'admitted');assert.equal((await store.claimPrompt(turn)).state,'dispatch');
 const options={store,binding,generation,currentReceipt:()=>turn,readNative:async()=>native,allowPublicQuery:q=>q===query,
  search:async(_query,beforeSend)=>{assert.equal(await beforeSend(),true);dispatches++;return receipt();},...changes};
 const broker=createResearchSearchBroker(options),request=(value=envelope)=>({method:'POST',path:'/search',body:Buffer.from(JSON.stringify(value))});
 const operation=()=>({kind:'tool',key:hashResearchJSON({runID:turn.runID,assistantMessageID:assistantID,toolID:envelope.toolID}),requestHash:hashResearchJSON({name:'panda_research_search',input:envelope.input})});
 try{await run({store,binding,generation,turn,envelope,native,options,broker,request,operation,dispatches:()=>dispatches,setCurrent:v=>{current=v;}});}finally{await rm(root,{recursive:true,force:true});}
}

test('native search settles exact private receipt before delivery and duplicates use cache',async()=>fixture(async f=>{
 const first=await f.broker.handle(f.request());assert.equal(first.status,200);const mcp=JSON.parse(first.body.toString());assert.equal(JSON.parse(mcp.content[0].text).kind,'tavily_excerpt');assert.equal(JSON.parse(mcp.content[0].text).sources[0].handle,alias(source()));
 assert.equal(mcp.content[0].text,JSON.stringify({kind:'tavily_excerpt',sources:[{handle:alias(source()),url:source().url,title:source().title,passages:[{id:'P1',text:source().content}],capturedAt:stamp}]}));assert.doesNotMatch(first.body.toString(),/synthetic-provider-receipt|credits|costNanoUsd/);
 const cached=await f.broker.handle(f.request());assert.equal(cached.status,200);assert.deepEqual(cached.body,first.body);assert.equal(f.dispatches(),1);
 const saved=await f.store.recoverOperation(f.turn,f.operation());assert.equal(saved.state,'cached');assert.equal(saved.result.receipt.usage.credits,1);assert.deepEqual(saved.result.mcp,mcp);
}));
test('search timing observes verification, settlement and release without affecting authority',async()=>fixture(async f=>{
 const events=[];f.options.observe=event=>{events.push(event);if(event.stage==='settled')throw Error('Synthetic observer fault');};
 assert.equal((await f.broker.handle(f.request())).status,200);assert.deepEqual(events.map(event=>event.stage),['verified','settled','released']);assert.ok(events.every((event,index)=>Number.isFinite(event.at)&&(!index||event.at>=events[index-1].at)));assert.equal(f.dispatches(),1);
}));
test('identical queries on distinct native tool calls keep distinct timing identities',async()=>fixture(async f=>{
 const calls=[],events=[];f.options.observe=event=>events.push(event);
 f.options.search=async(_q,before,_signal,operation)=>{assert.equal(Object.isFrozen(operation),true);assert.equal(await before(),true);calls.push(operation);return receipt();};
 const second=structuredClone(f.envelope);second.toolID='call-search-2';const part=structuredClone(f.native.messages[1].content[0]);part.id=second.toolID;f.native.messages[1].content.push(part);
 assert.equal((await f.broker.handle(f.request())).status,200);assert.equal((await f.broker.handle(f.request(second))).status,200);
 assert.equal(calls.length,2);assert.notEqual(calls[0].key,calls[1].key);assert.equal(calls[0].requestHash,calls[1].requestHash);assert.deepEqual(events.map(event=>event.operationKey),[calls[0].key,calls[0].key,calls[0].key,calls[1].key,calls[1].key,calls[1].key]);
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
test('a cached old-format content projection fails closed without a new search',async()=>fixture(async f=>{
 let searches=0;f.options.search=async()=>{searches++;return receipt();};
 const r=receipt(),old={content:[{type:'text',text:JSON.stringify({kind:'tavily_excerpt',sources:r.sources.map(s=>({...s,handle:alias(s)}))})}]};
 const operation=f.operation();assert.equal((await f.store.claimOperation(f.turn,operation)).state,'dispatch');const grant=await f.store.markSending(f.turn,operation);assert.ok(grant);
 assert.equal(await f.store.settleOperation(f.turn,operation,grant.grant,{receipt:r,mcp:old}),true);
 const result=await f.broker.handle(f.request());assert.equal(result.status,503);assert.doesNotMatch(result.body.toString(),/programmable/);assert.equal(searches,0);assert.equal(f.dispatches(),0);
}));
const prose=(length,seed='')=>{const words=['The','RP2040','PIO','block','runs','four','state','machines','with','cycle','accurate','timing','for','custom','serial','interfaces.'];let out=seed;for(let i=0;out.length<length;i++)out+=(out?' ':'')+words[i%words.length];return out.slice(0,length);};
test('a 16000-byte prose receipt projects within the MCP bound and settles',async()=>{
 const sources=[source(prose(5333,'One'),'one'),source(prose(5333,'Two'),'two'),source(prose(5334,'Three'),'three')],r=receipt(sources);
 assert.equal(sources.reduce((n,s)=>n+Buffer.byteLength(s.content),0),16000);
 const mcp=researchSearchMCP(r);assert.ok(mcp);assert.ok(Buffer.byteLength(mcp.content[0].text)<=24000);
 const parsed=JSON.parse(mcp.content[0].text);for(const [i,s] of parsed.sources.entries()){assert.deepEqual(Object.keys(s),['handle','url','title','passages','capturedAt']);assert.equal(s.passages.map(p=>p.text).join(''),sources[i].content);assert.deepEqual(s.passages.map(p=>p.id),s.passages.map((_,n)=>'P'+(n+1)));assert.ok(s.passages.every(p=>Object.keys(p).join()==='id,text'));}
 await fixture(async f=>{f.options.search=async(_q,before)=>{assert.equal(await before(),true);return r;};const result=await f.broker.handle(f.request());assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.body.toString()),mcp);});
});

test('simultaneous native duplicates cannot obtain two physical grants',async()=>fixture(async f=>{
 let release,entered;const ready=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});let sends=0;
 f.options.search=async(_q,before)=>{assert.equal(await before(),true);sends++;entered();await held;return receipt();};
 const first=f.broker.handle(f.request());await ready;assert.equal((await f.broker.handle(f.request())).status,409);release();assert.equal((await first).status,200);assert.equal(sends,1);
}));

test('fixture answer is parsed from native final JSON and resolves only exact admitted passages',()=>{
 const admitted=receipt(),s=admitted.sources[0],good={answer:s.content,evidence:[{handle:alias(s),passage:'P1'}]};
 assert.deepEqual(verifyResearchSearchFixtureAnswer(JSON.stringify(good),[admitted]),{state:'evidence',answer:s.content,citations:[{handle:s.handle,url:s.url,title:s.title,quote:s.content,capturedAt:stamp}]});
 assert.deepEqual(verifyResearchSearchFixtureAnswer('{"answer":"","evidence":[]}',[receipt([])]),{state:'insufficient'});
 for(const value of [{...good,extra:true},{...good,answer:'Inferred claim'},{...good,evidence:[...good.evidence,...good.evidence]},{answer:'Changed',evidence:[{handle:alias(s),passage:'P1'}]},{answer:s.content,evidence:[{handle:'foreign',passage:'P1'}]},{answer:s.content,evidence:[{handle:alias(s),passage:'P2'}]},{answer:s.content,evidence:[{handle:alias(s),passage:'P0'}]},{answer:s.content,evidence:[{handle:alias(s),quote:s.content}]},{answer:s.content,evidence:[{handle:alias(s),passage:'P1',quote:s.content}]},{answer:s.content,evidence:[{handle:alias(s),passage:1}]}])assert.deepEqual(verifyResearchSearchFixtureAnswer(JSON.stringify(value),[admitted]),{state:'invalid'});
 assert.equal(verifyResearchSearchFixtureAnswer(JSON.stringify(good),[admitted,admitted]).state,'evidence');assert.deepEqual(verifyResearchSearchFixtureAnswer('{"answer":"x","answer":"y"}',[admitted]),{state:'invalid'});
 const long=receipt([source(' '.repeat(180)+'Second passage text.','blank')]),l=long.sources[0];
 assert.deepEqual(verifyResearchSearchFixtureAnswer(JSON.stringify({answer:' '.repeat(180),evidence:[{handle:alias(l),passage:'P1'}]}),[long]),{state:'invalid'});
 assert.equal(verifyResearchSearchFixtureAnswer(JSON.stringify({answer:'Second passage text.',evidence:[{handle:alias(l),passage:'P2'}]}),[long]).citations[0].quote,'Second passage text.');
});

const code=s=>s.charCodeAt(0);
test('passage splitter keeps exact content and the normative break edges',()=>{
 const a=n=>'a'.repeat(n),lengths=s=>researchPassages(s).map(p=>p.length);
 assert.deepEqual(researchPassages(''),[]);
 assert.deepEqual(lengths(a(400)),[180,180,40]);
 assert.deepEqual(lengths(a(179)+' '+a(220)),[180,180,40]);// break at end-1 (inclusive top edge)
 assert.deepEqual(lengths(a(120)+' '+a(279)),[121,180,99]);// break at low=start+120 (lowest usable, inclusive)
 assert.deepEqual(lengths(a(119)+' '+a(280)),[180,180,40]);// break at low-1 is not used
 assert.deepEqual(lengths(a(150)+' '+a(10)+' '+a(238)),[162,180,58]);// latest break wins
 const smile='\u{1F600}';
 assert.deepEqual(lengths(a(179)+smile+a(219)),[179,180,41]);// surrogate pair at 179/180, no break
 assert.equal(researchPassages(a(179)+smile+a(219))[1].startsWith(smile),true);
 assert.deepEqual(lengths(a(178)+smile+a(220)),[180,180,40]);// pair at 178/179 is whole
 assert.deepEqual(lengths(a(119)+' '+a(59)+smile+a(219)),[120,180,100]);// surrogate: low=start+119 inclusive
 assert.deepEqual(lengths(a(118)+' '+a(60)+smile+a(219)),[179,180,41]);// below surrogate low not used
 assert.deepEqual(lengths(a(180)),[180]);assert.deepEqual(lengths(a(90)+' '+a(89)),[180]);// final 180 never shortened
 assert.deepEqual(lengths(a(181)),[180,1]);assert.deepEqual(lengths(a(150)+' '+a(30)),[151,30]);// 181 remaining
 assert.deepEqual(researchPassages(' '.repeat(400)).map(p=>p.length),[180,180,40]);assert.ok(researchPassages(' '.repeat(400)).every(p=>!p.trim()));
 assert.deepEqual(lengths('  '+a(398)),[180,180,40]);assert.deepEqual(lengths(a(398)+'  '),[180,180,40]);
 for(const ch of [' ','﻿',' ','　'])assert.deepEqual(lengths(a(150)+ch+a(249)),[180,180,40]);
 for(const ch of ['\t','\n','\v','\f','\r'])assert.deepEqual(lengths(a(150)+ch+a(249)),[151,180,69]);
});
test('passage splitter invariants hold for random and 6000-unit sources',()=>{
 let state=7;const rand=n=>{state=(state*1103515245+12345)%2147483648;return state%n;};
 const alphabet=['a','b',' ','\n','\r','\t',' ','\u{1F600}','é','﻿','x','y','z'];
 const inputs=[prose(6000),'a'.repeat(6000),(('a'.repeat(120)+' ').repeat(50)).slice(0,6000),' '.repeat(6000)];
 for(let i=0;i<400;i++){let s='';const n=rand(1200);while(s.length<n)s+=alphabet[rand(alphabet.length)];inputs.push(s);}
 for(const s of inputs){
  const parts=researchPassages(s);assert.equal(parts.join(''),s);
  parts.forEach((p,i)=>{assert.ok(p.length>0&&p.length<=180);if(i<parts.length-1)assert.ok(p.length>=120);assert.ok(p.isWellFormed());const last=code(p.slice(-1));assert.ok(!(last>=0xd800&&last<=0xdbff));});
  if(s.length<=6000)assert.ok(parts.length<=51);
 }
});

const catalogEntry=(r=receipt(),operationKey='1'.repeat(64))=>({operationKey,resultHash:hashResearchJSON({receipt:r,mcp:researchSearchMCP(r)}),receipt:r});
const multi=()=>receipt([source('Short first source.','first'),source('b'.repeat(150)+' Second-passage-of-the-longer-source.','second')]);
test('hosted final answer accepts one closing fenced JSON block after a preamble and discards the preamble',()=>{
 const r=multi(),[s1]=r.sources,catalog=[catalogEntry(r)],json=JSON.stringify({answer:'PIO is programmable.',evidence:[{handle:alias(s1),passage:'P1'}]});
 const check=raw=>verifyResearchAnswer(raw,catalog,raw);
 for(const raw of ['The search returned the datasheet. Unverified http://example.com claim.\n\n```json\n'+json+'\n```','```json\n'+json+'\n```\n'])
  {const result=check(raw);assert.equal(result.state,'evidence');assert.equal(result.answer,'PIO is programmable. [S1]');}
 for(const raw of ['Preamble.\n```json\n'+json+'\n```\nTrailing text.','A\n```json\n'+json+'\n```\n```json\n'+json+'\n```','Use `code` here.\n```json\n'+json+'\n```',
  'Preamble.\n```\n'+json+'\n```','Preamble.\n```JSON\n'+json+'\n```','Preamble. '+json,'Preamble.\n```json\n'+json+' extra\n```'])
  assert.deepEqual(check(raw),{state:'invalid'});
 assert.deepEqual(verifyResearchAnswer('```json\n'+json+'\n```',catalog,'other'),{state:'invalid'});
});
test('hosted final answer selects passage IDs, rejects free quotes and records passageID',()=>{
 const r=multi(),[s1,s2]=r.sources,catalog=[catalogEntry(r)],ok=evidence=>{const raw=JSON.stringify({answer:'PIO is programmable.',evidence});return verifyResearchAnswer(raw,catalog,raw);};
 const both=ok([{handle:alias(s2),passage:'P2'},{handle:alias(s1),passage:'P1'}]);assert.equal(both.state,'evidence');
 assert.deepEqual(both.citations.map(c=>c.quote),['Second-passage-of-the-longer-source.','Short first source.']);
 assert.deepEqual(both.usedSources,[{operationKey:catalog[0].operationKey,resultHash:catalog[0].resultHash,sourceHandle:s2.handle,passageID:'P2',quote:'Second-passage-of-the-longer-source.'},{operationKey:catalog[0].operationKey,resultHash:catalog[0].resultHash,sourceHandle:s1.handle,passageID:'P1',quote:'Short first source.'}]);
 assert.deepEqual(both.usedSources.map(u=>Object.keys(u)),[['operationKey','resultHash','sourceHandle','passageID','quote'],['operationKey','resultHash','sourceHandle','passageID','quote']]);
 assert.equal(ok([{handle:alias(s2),passage:'P1'},{handle:alias(s2),passage:'P2'}]).state,'evidence');
 for(const evidence of [[{handle:alias(s1),passage:'P2'}],[{handle:alias(s2),passage:'P3'}],[{handle:alias(s1),passage:'P0'}],[{handle:alias(s1),passage:'P65'}],[{handle:alias(s1),passage:'p1'}],[{handle:alias(s1),passage:'P01'}],[{handle:alias(s1),passage:' P1'}],[{handle:alias(s1),passage:1}],
  [{handle:alias(s1),quote:s1.content}],[{handle:alias(s1),passage:'P1',quote:s1.content}],[{handle:alias(s1),passage:'P1'},{handle:alias(s1),passage:'P1'}],[{handle:alias(s1),passage:'P1'},{handle:alias(s2),passage:'P1'},{handle:alias(s2),passage:'P2'}],[{handle:'foreign',passage:'P1'}],[{handle:s1.handle,passage:'P1'}]])
  assert.deepEqual(ok(evidence),{state:'invalid'},JSON.stringify(evidence));
});
test('answers keep [S1]/[S2] markers matching their evidence, get one appended when none, and refuse any other marker',()=>{
 const r=multi(),[s1,s2]=r.sources,catalog=[catalogEntry(r)],run=(answer,evidence)=>{const raw=JSON.stringify({answer,evidence});return verifyResearchAnswer(raw,catalog,raw);};
 const one=[{handle:alias(s1),passage:'P1'}],two=[...one,{handle:alias(s2),passage:'P2'}];
 assert.equal(run('PIO is programmable [S1].',one).answer,'PIO is programmable [S1].');
 assert.equal(run('A [S1]. B [S2].',two).answer,'A [S1]. B [S2].');
 assert.equal(run('A and B.',two).answer,'A and B. [S1][S2]');
 assert.equal(run('A and B [S1][S2].',two).answer,'A and B [S1][S2].');
 for(const answer of ['A [S2].','A [S3].','A [S0].','A [S01].','A [s1].','A [S1, S2].','A [1].','[S1]','A [web].','See [S1](javascript:alert(1)).','A [S1](/admin).','A ![S1](x).','[S1]: x','A [[S1]].','A [S1]].','A [[S1].','A [S1][x].'])
  assert.deepEqual(run(answer,answer==='A [S2].'?one:two),{state:'invalid'},answer);
});
test('non-selectable blank, CR and format-character passages invalidate the answer',()=>{
 for(const [content,passage] of [[' '.repeat(180)+'Visible tail.','P1'],['Line one\r\nLine two.','P1'],['Soft­hyphen text.','P1'],['Zero​width.','P1']]){
  const r=receipt([source(content,'bad')]),catalog=[catalogEntry(r)],raw=JSON.stringify({answer:'Claim.',evidence:[{handle:alias(r.sources[0]),passage}]});
  assert.deepEqual(verifyResearchAnswer(raw,catalog,raw),{state:'invalid'});
 }
 const r=receipt([source(' '.repeat(180)+'Visible tail.','bad')]),catalog=[catalogEntry(r)],raw=JSON.stringify({answer:'Claim.',evidence:[{handle:alias(r.sources[0]),passage:'P2'}]});
 assert.equal(verifyResearchAnswer(raw,catalog,raw).citations[0].quote,'Visible tail.');
});

test('hosted final answer binds the paid stop text and exact settled source result',()=>{
 const r=receipt(),s=r.sources[0],catalog=[catalogEntry(r)],raw=JSON.stringify({answer:'PIO provides programmable input and output.',evidence:[{handle:alias(s),passage:'P1'}]});
 const result=verifyResearchAnswer(raw,catalog,raw);assert.equal(result.state,'evidence');assert.equal(result.citations[0].url,s.url);assert.deepEqual(result.usedSources,[{operationKey:catalog[0].operationKey,resultHash:catalog[0].resultHash,sourceHandle:s.handle,passageID:'P1',quote:s.content}]);
 assert.deepEqual(catalog[0].resultHash,hashResearchJSON({receipt:r,mcp:{content:[{type:'text',text:JSON.stringify({kind:'tavily_excerpt',sources:[{handle:alias(s),url:s.url,title:s.title,passages:[{id:'P1',text:s.content}],capturedAt:s.capturedAt}]})}]}}));
 const oldFormat=structuredClone(catalog);oldFormat[0].resultHash=hashResearchJSON({receipt:r,mcp:{content:[{type:'text',text:JSON.stringify({kind:'tavily_excerpt',sources:r.sources.map(x=>({...x,handle:alias(x)}))})}]}});assert.deepEqual(verifyResearchAnswer(raw,oldFormat,raw),{state:'invalid'});
 assert.deepEqual(verifyResearchAnswer(raw,catalog,raw+' '),{state:'invalid'});
 const changed=structuredClone(catalog);changed[0].receipt.sources[0].content+=' Forged';assert.deepEqual(verifyResearchAnswer(raw,changed,raw),{state:'invalid'});
 changed[0]=catalogEntry(r);changed[0].resultHash=hashResearchJSON({receipt:r,mcp:{content:[{type:'text',text:JSON.stringify({kind:'tavily_excerpt',sources:r.sources})}]}});assert.deepEqual(verifyResearchAnswer(raw,changed,raw),{state:'invalid'});
 changed[0].resultHash='f'.repeat(64);assert.deepEqual(verifyResearchAnswer(raw,changed,raw),{state:'invalid'});
 const empty='{"answer":"","evidence":[]}';assert.deepEqual(verifyResearchAnswer(empty,[],empty),{state:'insufficient'});assert.deepEqual(verifyResearchAnswer(empty,catalog,empty),{state:'insufficient'});
});

test('hosted source selection follows verified native catalog order despite different capture times',()=>{
 const r=receipt(),s=r.sources[0],later=structuredClone(r);later.requestId='later receipt';later.requestHash=hostedTavilyRequestHash('RP2040 PIO datasheet');later.startedAt=later.completedAt=later.sources[0].capturedAt='2026-11-11T00:01:00.000Z';later.sources[0].title='Later title';const catalog=[catalogEntry(r),catalogEntry(later,'2'.repeat(64))],raw=JSON.stringify({answer:'PIO is programmable.',evidence:[{handle:alias(s),passage:'P1'}]});
 const result=verifyResearchAnswer(raw,catalog,raw);assert.equal(result.state,'evidence');assert.equal(result.usedSources[0].operationKey,catalog[0].operationKey);assert.equal(result.citations[0].title,s.title);assert.equal(result.citations[0].capturedAt,s.capturedAt);
 r.completedAt=r.sources[0].capturedAt='2026-11-11T00:00:02.000Z';later.startedAt=stamp;later.completedAt=later.sources[0].capturedAt='2026-11-11T00:00:01.000Z';
 const reversedTimes=verifyResearchAnswer(raw,[catalogEntry(r),catalogEntry(later,'2'.repeat(64))],raw);assert.equal(reversedTimes.state,'evidence');assert.equal(reversedTimes.usedSources[0].operationKey,catalog[0].operationKey);assert.equal(reversedTimes.citations[0].title,s.title);assert.equal(reversedTimes.citations[0].capturedAt,r.sources[0].capturedAt);
});

test('unproven, repeated, oversized or linked final claims do not pass citation release',()=>{
 const r=receipt(),s=r.sources[0],catalog=[catalogEntry(r)];
 assert.deepEqual(verifyResearchAnswer(JSON.stringify({answer:'Uncited refusal text.',evidence:[]}),[],JSON.stringify({answer:'Uncited refusal text.',evidence:[]})),{state:'insufficient'});
 for(const value of [{answer:'PIO is programmable [1, 2].',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'PIO is programmable [1-2].',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'PIO is programmable [1].',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'PIO is programmable [web:source].',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'PIO is programmable [Source 1].',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'Go [here](https://evil.invalid)',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'<img src=x>',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'https://evil.invalid',evidence:[{handle:alias(s),passage:'P1'}]},{answer:'PIO',evidence:[{handle:alias(s),passage:'P2'}]},{answer:'PIO',evidence:[{handle:'foreign',passage:'P1'}]},{answer:'PIO',evidence:[{handle:alias(s),passage:'P1'},{handle:alias(s),passage:'P1'}]},{answer:'x'.repeat(1201),evidence:[{handle:alias(s),passage:'P1'}]},{answer:'PIO',evidence:[{handle:alias(s),passage:'P1'}],extra:true}]){const raw=JSON.stringify(value);assert.deepEqual(verifyResearchAnswer(raw,catalog,raw),{state:'invalid'});}
});

test('public scope rejects discarded non-ASCII, punctuation and encoded private payloads',()=>{
 const scope={words:['rp2040','pio','official','documentation','datasheet'],required:['rp2040','pio']};
 for(const value of ['RP2040 PIO official documentation','rp2040-pio datasheet'])assert.equal(isPublicResearchQuery(value,scope),true);
 for(const value of ['RP2040 PIO 中文payload','RP2040 PIO%20private','RP2040 PIO /secret','RP2040 PIO\nsecret','RP2040 PIO \u200b',' RP2040 PIO','RP2040 PIO ','RP2040 official documentation','RP2040 PIO privatecustomer'])assert.equal(isPublicResearchQuery(value,scope),false);
 assert.equal(isPublicResearchQuery('RP2040 PIO',{...scope,required:['secret']}),false);
});

test('aliases reject substitution, near matches and conflicting identities',()=>{
 const r=receipt(),s=r.sources[0],catalog=[catalogEntry(r)];
 for(const handle of [s.handle,alias(s)+'0',alias(s).slice(0,-1)+'z','S0000000000000000']){
  const raw=JSON.stringify({answer:'PIO',evidence:[{handle,passage:'P1'}]});
  assert.equal(verifyResearchAnswer(raw,catalog,raw).state,'invalid');
  assert.equal(verifyResearchSearchFixtureAnswer(JSON.stringify({answer:s.content,evidence:[{handle,passage:'P1'}]}),[r]).state,'invalid');
 }
 const map=new Map();assert.equal(registerResearchSourceAlias(map,'S0000000000000000',s),true);
 assert.equal(registerResearchSourceAlias(map,'S0000000000000000',structuredClone(s)),true);
 assert.equal(registerResearchSourceAlias(map,'S0000000000000000',source('Different source','other')),false);
 assert.equal(registerResearchSourceAlias(map,'S0000000000000000',{...s,title:'Changed title',capturedAt:'2026-11-11T00:01:00.000Z'}),true);
 for(const changed of [{...s,handle:'web:other'},{...s,url:'https://example.com/other'},{...s,content:'Different'}])assert.equal(registerResearchSourceAlias(map,'S0000000000000000',changed),false);
});

const imageBytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('synthetic png body')]),imageSha=sha(imageBytes);
const imageFile=(over={})=>({data:imageBytes.toString('base64'),mime:'image/png',source:{type:'inline'},name:'image.png',...over});
test('image receipt authorizes a search only while the native user row carries exactly that image',async()=>{
 await fixture(async f=>{assert.equal((await f.broker.handle(f.request())).status,200);assert.equal(f.dispatches(),1);},{},{imageSha256:imageSha,files:[imageFile()]});
 for(const files of [undefined,[],[imageFile(),imageFile()],[imageFile({mime:'image/jpeg'})],[imageFile({name:'image.jpg'})],[imageFile({source:{type:'file'}})],[imageFile({extra:1})],[imageFile({data:Buffer.concat([imageBytes,Buffer.from('zz')]).toString('base64')})]])
  await fixture(async f=>{assert.equal((await f.broker.handle(f.request())).status,403,JSON.stringify(files)?.slice(0,60));assert.equal((await f.store.readRun(f.turn)).operations.length,0);assert.equal(f.dispatches(),0);},{},{imageSha256:imageSha,...(files===undefined?{}:{files})});
});
test('a text-only receipt rejects a native user row that carries any image',async()=>{
 await fixture(async f=>{assert.equal((await f.broker.handle(f.request())).status,403);assert.equal(f.dispatches(),0);},{},{files:[imageFile()]});
 await fixture(async f=>{assert.equal((await f.broker.handle(f.request())).status,200);},{},{files:[]});
});
