import {createHash} from 'node:crypto';
import {strictJson} from '../lightweight/client.ts';
import {researchJSON,researchObject} from '../opencode/research-values.ts';
import {nativeUserImageMatches} from '../opencode/research-image-binding.ts';
import {publicSearchCitationUrl} from '../search/citation-url.ts';
import {hostedTavilyRequestHash,type TavilySearchReceipt} from '../search/tavily.ts';
import {hashResearchJSON,type openResearchRuntimeStore,type ResearchBinding,type ResearchRunReceipt,type ResearchOperation} from './research-runtime-store.ts';

type Store=Awaited<ReturnType<typeof openResearchRuntimeStore>>;
type Envelope={sessionID:string;assistantMessageID:string;toolID:string;generation:string;inputHash:string;input:{query:string}};
type MCP={content:[{type:'text';text:string}]};
type Settlement={receipt:TavilySearchReceipt;mcp:MCP};
type Options={store:Store;binding:ResearchBinding;generation:string;currentReceipt():ResearchRunReceipt|null;
 readNative():Promise<{session:unknown;active:boolean;messages:unknown}>;allowPublicQuery(query:string):boolean;
 search(query:string,beforeSend:()=>Promise<boolean>,signal:AbortSignal,operation:Readonly<ResearchOperation>):Promise<TavilySearchReceipt>;
 observe?(event:Readonly<{stage:'verified'|'settled'|'released';operationKey:string;requestHash:string;at:number}>):unknown};
type Response={status:number;contentType:string;body:Buffer};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=(v:unknown,prefix:string):v is string=>typeof v==='string'&&new RegExp('^'+prefix+'_[a-f0-9]{12}[A-Za-z0-9]{14}$').test(v);
const exact=(v:unknown,names:string[]):v is Record<string,unknown>=>researchObject(v)&&Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.isWellFormed()&&v.length<=max;
const iso=(v:unknown):v is string=>typeof v==='string'&&v.length===24&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const response=(status:number,mcp?:MCP):Response=>({status,contentType:'application/json',body:Buffer.from(mcp?JSON.stringify(mcp):'{"error":"Search unavailable"}')});

function verifiedReceipt(value:unknown,expectedRequestHash?:string):TavilySearchReceipt|null{
 if(!researchJSON(value,1048576)||!exact(value,['version','provider','operation','requestHash','requestId','startedAt','completedAt','durationMs','usage','sources'])
  ||value.version!==1||!(value.provider==='tavily'||value.provider==='pandabyte_site')||value.operation!=='search'||!hex(value.requestHash)||expectedRequestHash!==undefined&&value.requestHash!==expectedRequestHash
  ||value.requestId!==null&&!(typeof value.requestId==='string'&&/^[\x20-\x7e]{1,200}$/.test(value.requestId)&&value.requestId.trim())
  ||!iso(value.startedAt)||!iso(value.completedAt)||value.completedAt<value.startedAt
  ||typeof value.durationMs!=='number'||!Number.isFinite(value.durationMs)||value.durationMs<0||value.durationMs>60000
  ||!exact(value.usage,['credits','costNanoUsd'])||value.usage.costNanoUsd!==null
  ||value.usage.credits!==null&&!(typeof value.usage.credits==='number'&&Number.isFinite(value.usage.credits)&&value.usage.credits>=0&&value.usage.credits<=100)
  ||!Array.isArray(value.sources)||value.sources.length>3)return null;
 const urls=new Set<string>(),handles=new Set<string>();let bytes=0,characters=0;
 for(const source of value.sources){
  if(!exact(source,['handle','url','title','content','capturedAt'])||!text(source.url,500)||!publicSearchCitationUrl(source.url)
   ||!text(source.title,300)||!source.title.trim()||!text(source.content,6000)||!source.content.trim()
   ||!iso(source.capturedAt)||source.capturedAt<value.startedAt||source.capturedAt>value.completedAt
   ||source.handle!==`web:${hash(source.url)}:${hash(source.content)}:${hash(source.content)}`||urls.has(source.url)||handles.has(source.handle as string))return null;
  urls.add(source.url);handles.add(source.handle as string);bytes+=Buffer.byteLength(source.content);characters+=source.content.length;
 }
 if(bytes>16000||characters>16000)return null;
 return structuredClone(value) as TavilySearchReceipt;
}
type Source=TavilySearchReceipt['sources'][number];
const sourceAlias=(handle:string)=>'S'+hash(handle).slice(0,16);
/** Reject ambiguous model-facing labels, including conflicting source metadata. */
export function registerResearchSourceAlias(sources:Map<string,Source>,alias:string,source:Source):boolean{
 const prior=sources.get(alias);
 if(prior)return prior.handle===source.handle&&prior.url===source.url&&prior.content===source.content;
 sources.set(alias,source);return true;
}
const passageBreaks=new Set([9,10,11,12,13,32]);
/** The single host splitter: exact UTF-16 fragments whose concatenation is the content. */
export function researchPassages(content:string):string[]{
 const fragments:string[]=[];let start=0;
 while(start<content.length){
  let end=content.length;
  if(content.length-start>180){
   end=start+180;
   const last=content.charCodeAt(end-1);if(last>=0xd800&&last<=0xdbff)end--;
   const low=Math.max(start+119,end-60);
   for(let j=end-1;j>=low;j--)if(passageBreaks.has(content.charCodeAt(j))){end=j+1;break;}
  }
  fragments.push(content.slice(start,end));start=end;
 }
 return fragments;
}
const passageID=/^P(?:[1-9]|[1-5][0-9]|6[0-4])$/;
/** Resolve one supplied passage ID; null when absent or not citable as a whole. */
function selectablePassage(content:string,id:unknown):string|null{
 if(typeof id!=='string'||!passageID.test(id))return null;
 const passage=researchPassages(content)[Number(id.slice(1))-1];
 return passage!==undefined&&passage.trim()!==''&&publicAnswerText(passage,200)?passage:null;
}
export function researchSearchMCP(receipt:TavilySearchReceipt):MCP|null{
 const aliases=new Map<string,Source>();
 if(!receipt.sources.every(source=>registerResearchSourceAlias(aliases,sourceAlias(source.handle),source)))return null;
 const sources=receipt.sources.map(({handle,url,title,content,capturedAt})=>({handle:sourceAlias(handle),url,title,passages:researchPassages(content).map((text,index)=>({id:'P'+(index+1),text})),capturedAt}));
 if(sources.some(source=>source.passages.length>64))return null;
 const mcp:MCP={content:[{type:'text',text:JSON.stringify({kind:'tavily_excerpt',sources})}]};
 return Buffer.byteLength(mcp.content[0].text)<=24000&&Buffer.byteLength(JSON.stringify(mcp))<=32768?mcp:null;
}
function verifiedSettlement(value:unknown,requestHash:string):Settlement|null{
 if(!researchJSON(value,1048576)||!exact(value,['receipt','mcp']))return null;
 const receipt=verifiedReceipt(value.receipt,requestHash),mcp=receipt&&researchSearchMCP(receipt);
 if(!receipt||!mcp||hashResearchJSON(value.mcp)!==hashResearchJSON(mcp))return null;
 return {receipt,mcp};
}
function envelope(value:unknown):Envelope|null{
 if(!researchJSON(value,16384)||!exact(value,['sessionID','assistantMessageID','toolID','generation','inputHash','input'])
  ||!id(value.sessionID,'ses')||!id(value.assistantMessageID,'msg')||typeof value.toolID!=='string'||! /^[\x21-\x7e]{1,256}$/.test(value.toolID)
  ||!hex(value.generation)||!hex(value.inputHash)||!exact(value.input,['query'])||!text(value.input.query,400)||!value.input.query.trim()
  ||/[\p{Cc}\p{Cf}]/u.test(value.input.query)||hashResearchJSON(value.input)!==value.inputHash)return null;
 return structuredClone(value) as Envelope;
}

/** Only an authenticated, host-owned Docker channel may call this broker. */
export function createResearchSearchBroker(options:Options){
 if(!researchJSON(options.binding,4096)||!hex(options.generation)||!id(options.binding.sessionID,'ses'))throw Error('invalid_search_binding');
 const binding=structuredClone(options.binding),generation=options.generation;
 async function current(receipt:ResearchRunReceipt){
  try{const selected=options.currentReceipt();return !!selected&&researchJSON(selected,4096)&&hashResearchJSON(selected)===hashResearchJSON(receipt)&&await options.store.current(receipt);}catch{return false;}
 }
 async function running(receipt:ResearchRunReceipt,call:Envelope){
  try{
   const observed=await options.readNative();if(observed.active!==true||!researchJSON({session:observed.session,messages:observed.messages},1048576)
    ||!researchObject(observed.session)||observed.session.id!==binding.sessionID||!researchObject(observed.session.metadata)
    ||!exact(observed.session.metadata.pandaResearch,['binding','owner','profileHash'])
    ||observed.session.metadata.pandaResearch.binding!==binding.binding||observed.session.metadata.pandaResearch.owner!==binding.owner
    ||observed.session.metadata.pandaResearch.profileHash!==binding.profileHash||!Array.isArray(observed.messages)||observed.messages.length>200)return false;
   const rows=observed.messages;
   const users=rows.flatMap((row,index)=>researchObject(row)&&row.id===receipt.messageID&&row.type==='user'&&typeof row.text==='string'&&hash(row.text)===receipt.promptHash&&nativeUserImageMatches(row,receipt.imageSha256)?[index]:[]);
   if(users.length!==1||rows.slice(users[0]+1).some(row=>researchObject(row)&&row.type==='user'))return false;
   const assistants=rows.slice(users[0]+1).filter(row=>researchObject(row)&&row.type==='assistant'&&row.id===call.assistantMessageID);
   if(assistants.length!==1||!researchObject(assistants[0])||!Array.isArray(assistants[0].content))return false;
   const matches=assistants[0].content.filter(part=>researchObject(part)&&part.type==='tool'&&part.id===call.toolID);
   return matches.length===1&&researchObject(matches[0])&&matches[0].name==='panda_research_search'&&researchObject(matches[0].state)
    &&matches[0].state.status==='running'&&hashResearchJSON(matches[0].state.input)===call.inputHash;
  }catch{return false;}
 }
 return {async handle(request:{method:string;path:string;body:Buffer},externalSignal?:AbortSignal):Promise<Response>{
  const signal=externalSignal??new AbortController().signal;
  try{
   if(request.method!=='POST'||request.path!=='/search')return response(400);
   if(signal.aborted)return response(503);
   if(!Buffer.isBuffer(request.body)||request.body.length>16384)return response(403);
   let raw:unknown;try{raw=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(request.body));}catch{return response(403);}
   const call=envelope(raw),selected=options.currentReceipt();
   if(!call||!selected||!researchJSON(selected,4096)||call.sessionID!==binding.sessionID||call.generation!==generation
    ||selected.binding!==binding.binding||selected.owner!==binding.owner||selected.generation!==generation||options.allowPublicQuery(call.input.query)!==true)return response(403);
   const receipt=structuredClone(selected),requestHash=hostedTavilyRequestHash(call.input.query);
   if(!await current(receipt)||!await running(receipt,call)||signal.aborted)return response(403);
   const operation={kind:'tool' as const,key:hashResearchJSON({runID:receipt.runID,assistantMessageID:call.assistantMessageID,toolID:call.toolID}),requestHash:hashResearchJSON({name:'panda_research_search',input:call.input})};
   const observe=(stage:'verified'|'settled'|'released')=>{try{void Promise.resolve(options.observe?.(Object.freeze({stage,operationKey:operation.key,requestHash:operation.requestHash,at:performance.now()}))).catch(()=>{});}catch{/* Observations never grant or cancel work. */}};
   const claimed=await options.store.claimOperation(receipt,operation);
   if(claimed.state==='unknown'||claimed.state==='conflict')return response(409);
   let settlement:Settlement|null;
   if(claimed.state==='cached')settlement=verifiedSettlement(claimed.result,requestHash);
   else{
    let used=false;const sent:{grant?:string}={};
    const beforeSend=async()=>{
     if(used)return false;used=true;
     if(signal.aborted||!await current(receipt)||options.allowPublicQuery(call.input.query)!==true||!await running(receipt,call)||signal.aborted)return false;
     const grant=await options.store.markSending(receipt,operation);if(grant)sent.grant=grant.grant;return grant!==null;
    };
    const result=await options.search(call.input.query,beforeSend,signal,Object.freeze({...operation})),verified=verifiedReceipt(result,requestHash),mcp=verified&&researchSearchMCP(verified);
    if(!used||!sent.grant||!verified||!mcp)return response(503);
    observe('verified');
    settlement={receipt:verified,mcp};
    // Exact already-sent evidence may settle privately after cancellation; it never grants release.
    if(!await options.store.settleOperation(receipt,operation,sent.grant,settlement))return response(503);
    observe('settled');
   }
   if(!settlement||signal.aborted||!await current(receipt)||!await running(receipt,call)||signal.aborted
    ||!await options.store.authorizeRelease(receipt,operation,hashResearchJSON(settlement))||signal.aborted)return response(503);
   observe('released');return response(200,settlement.mcp);
  }catch{return response(503);}
 }};
}

type FixtureAnswer={state:'invalid'}|{state:'insufficient'}|{state:'evidence';answer:string;citations:{handle:string;url:string;title:string;quote:string;capturedAt:string}[]};
/** C1 proves exact quoted fixture evidence; real-model prose has a separate later contract. */
export function verifyResearchSearchFixtureAnswer(raw:string,receipts:readonly TavilySearchReceipt[]):FixtureAnswer{
 const invalid={state:'invalid'} as const;
 try{
  if(!text(raw,24000)||Buffer.byteLength(raw)>24000||!Array.isArray(receipts)||!receipts.length||receipts.length>16)return invalid;
  const checked=receipts.map(r=>verifiedReceipt(r));if(checked.some(r=>r===null||!researchSearchMCP(r)))return invalid;
  const value=strictJson(raw);if(!exact(value,['answer','evidence'])||!text(value.answer,600)||!Array.isArray(value.evidence))return invalid;
  const sources=new Map<string,Source>();for(const r of checked)for(const source of r!.sources)if(!registerResearchSourceAlias(sources,sourceAlias(source.handle),source))return invalid;
  if(value.answer===''&&value.evidence.length===0)return sources.size===0?{state:'insufficient'}:invalid;
  if(value.evidence.length!==1||!exact(value.evidence[0],['handle','passage']))return invalid;
  const selection=value.evidence[0],s=typeof selection.handle==='string'?sources.get(selection.handle):undefined;
  if(!s||typeof selection.passage!=='string'||!passageID.test(selection.passage))return invalid;
  const quote=researchPassages(s.content)[Number(selection.passage.slice(1))-1];
  if(quote===undefined||!quote.trim()||value.answer!==quote)return invalid;return{state:'evidence',answer:value.answer,citations:[{handle:s.handle,url:s.url,title:s.title,quote,capturedAt:s.capturedAt}]};
 }catch{return invalid;}
}

export function isPublicResearchQuery(query:unknown,scope:{words:readonly string[];required:readonly string[]}):boolean{
 try{
  if(typeof query!=='string'||query.length>400||! /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/.test(query)||!researchJSON(scope,4096)
   ||!exact(scope,['words','required'])||!Array.isArray(scope.words)||!scope.words.length||scope.words.length>32
   ||!Array.isArray(scope.required)||!scope.required.length||scope.required.length>8
   ||!scope.words.every(word=>typeof word==='string'&&/^[a-z0-9]{1,64}$/.test(word))
   ||!scope.required.every(word=>typeof word==='string'&&scope.words.includes(word))||new Set(scope.words).size!==scope.words.length||new Set(scope.required).size!==scope.required.length)return false;
  const words=query.toLowerCase().split(/[ -]/);return words.every(word=>scope.words.includes(word))&&scope.required.every(word=>words.includes(word));
 }catch{return false;}
}

export type ResearchEvidenceCatalogEntry={operationKey:string;resultHash:string;receipt:TavilySearchReceipt};
type ResearchAnswer={state:'invalid'}|{state:'insufficient'}|{state:'evidence';answer:string;citations:{handle:string;url:string;title:string;quote:string;capturedAt:string}[];usedSources:{operationKey:string;resultHash:string;sourceHandle:string;passageID:string;quote:string}[]};
const publicAnswerText=(value:unknown,max:number):value is string=>text(value,max)&&!/[\p{Cf}\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value);
/** Inputs come from this run's released tool receipts and its exact verified paid stop result. */
export function verifyResearchAnswer(rawText:string,catalog:readonly ResearchEvidenceCatalogEntry[],expectedStopText:string):ResearchAnswer{
 const invalid={state:'invalid'} as const;
 try{
  if(!text(rawText,24000)||Buffer.byteLength(rawText)>24000||rawText!==expectedStopText||!researchJSON(catalog,1048576)||!Array.isArray(catalog)||catalog.length>16)return invalid;
  const sources=new Map<string,{source:Source;operationKey:string;resultHash:string}>(),aliases=new Map<string,Source>(),operations=new Set<string>();
  for(const entry of catalog){
   if(!exact(entry,['operationKey','resultHash','receipt'])||!hex(entry.operationKey)||!hex(entry.resultHash)||operations.has(entry.operationKey))return invalid;
   operations.add(entry.operationKey);const receipt=verifiedReceipt(entry.receipt),mcp=receipt&&researchSearchMCP(receipt);
   if(!receipt||!mcp||hashResearchJSON({receipt,mcp})!==entry.resultHash)return invalid;
   for(const source of receipt.sources){const alias=sourceAlias(source.handle);if(!registerResearchSourceAlias(aliases,alias,source))return invalid;
    if(!sources.has(alias))sources.set(alias,{source,operationKey:entry.operationKey,resultHash:entry.resultHash});}
  }
  // Observed real Claude Haiku 5.5 (11 Nov 2026): a short preamble then one closing ```json block. Only that block is parsed;
  // the unverified preamble is discarded and never rendered. Bare strict JSON remains the primary form.
  const fence=/^[^`]*```json\n([^`]*)\n```\s*$/.exec(rawText),candidate=rawText.trimStart().startsWith('{')?rawText:fence?fence[1]:null;
  if(candidate===null)return invalid;
  const value=strictJson(candidate);
  if(!exact(value,['answer','evidence'])||!publicAnswerText(value.answer,1200)||!Array.isArray(value.evidence)||value.evidence.length>2)return invalid;
  // Observed real Haiku 5.5: a helpful uncited refusal with evidence:[]; without evidence the text is never shown, so it is insufficient.
  if(value.evidence.length===0)return{state:'insufficient'};
  // [S1]/[S2] mark the first/second evidence selection (citation ids S1/S2); any other bracket stays refused.
  const markers=[...value.answer.matchAll(/\[S(\d+)\]/g)].map(m=>m[1]);
  if(markers.some(n=>n!=='1'&&n!=='2'||Number(n)>value.evidence.length))return invalid;
  const bare=value.answer.replace(/\[S[12]\]/g,'');
  // A marker may not become link text, an image or a reference definition, and no other bracket may remain.
  if(/!\[S\d|\[S\d+\](?:[(:]|\[(?!S\d+\]))/.test(value.answer)||/[[\]]/.test(bare))return invalid;
  if(!bare.trim()||!value.evidence.length||/(?:\b[a-z][a-z0-9+.-]*:\/\/|www\.|\[[^\]]*\]\([^)]*\)|<[^>]+>|\[S\d+\]|\[(?:web|source|citation|ref(?:erence)?)[^\]]*\]|(?:^|[^A-Za-z0-9_`])\[[^\]\n]+\])/i.test(bare))return invalid;
  const citations:Extract<ResearchAnswer,{state:'evidence'}>['citations']=[],usedSources:Extract<ResearchAnswer,{state:'evidence'}>['usedSources']=[],pairs=new Set<string>();
  for(const selection of value.evidence){
   if(!exact(selection,['handle','passage'])||typeof selection.handle!=='string'||typeof selection.passage!=='string')return invalid;
   const pair=JSON.stringify([selection.handle,selection.passage]),admitted=sources.get(selection.handle);
   const quote=admitted?selectablePassage(admitted.source.content,selection.passage):null;
   if(pairs.has(pair)||!admitted||quote===null)return invalid;pairs.add(pair);
   const {source,operationKey,resultHash}=admitted;
   citations.push({handle:source.handle,url:source.url,title:source.title,quote,capturedAt:source.capturedAt});
   usedSources.push({operationKey,resultHash,sourceHandle:source.handle,passageID:selection.passage,quote});
  }
  // A model that wrote no marker still gets one per citation at the end, so the UI always links its sources.
  const answer=markers.length?value.answer:value.answer.trimEnd()+' '+citations.map((_,i)=>`[S${i+1}]`).join('');
  return{state:'evidence',answer,citations,usedSources};
 }catch{return invalid;}
}
