import {createHash} from 'node:crypto';
import {strictJson} from '../lightweight/client.ts';
import {researchJSON,researchObject} from '../opencode/research-values.ts';
import {publicSearchCitationUrl} from '../search/citation-url.ts';
import {hostedTavilyRequestHash,type TavilySearchReceipt} from '../search/tavily.ts';
import {hashResearchJSON,type openResearchRuntimeStore,type ResearchBinding,type ResearchRunReceipt} from './research-runtime-store.ts';

type Store=Awaited<ReturnType<typeof openResearchRuntimeStore>>;
type Envelope={sessionID:string;assistantMessageID:string;toolID:string;generation:string;inputHash:string;input:{query:string}};
type MCP={content:[{type:'text';text:string}]};
type Settlement={receipt:TavilySearchReceipt;mcp:MCP};
type Options={store:Store;binding:ResearchBinding;generation:string;currentReceipt():ResearchRunReceipt|null;
 readNative():Promise<{session:unknown;active:boolean;messages:unknown}>;allowPublicQuery(query:string):boolean;
 search(query:string,beforeSend:()=>Promise<boolean>,signal:AbortSignal):Promise<TavilySearchReceipt>};
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
  ||value.version!==1||value.provider!=='tavily'||value.operation!=='search'||!hex(value.requestHash)||expectedRequestHash!==undefined&&value.requestHash!==expectedRequestHash
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
function mcpFor(receipt:TavilySearchReceipt):MCP|null{
 const sources=receipt.sources.map(({handle,url,title,content,capturedAt})=>({handle,url,title,content,capturedAt}));
 const mcp:MCP={content:[{type:'text',text:JSON.stringify({kind:'tavily_excerpt',sources})}]};
 return Buffer.byteLength(mcp.content[0].text)<=24000&&Buffer.byteLength(JSON.stringify(mcp))<=32768?mcp:null;
}
function verifiedSettlement(value:unknown,requestHash:string):Settlement|null{
 if(!researchJSON(value,1048576)||!exact(value,['receipt','mcp']))return null;
 const receipt=verifiedReceipt(value.receipt,requestHash),mcp=receipt&&mcpFor(receipt);
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
   const users=rows.flatMap((row,index)=>researchObject(row)&&row.id===receipt.messageID&&row.type==='user'&&typeof row.text==='string'&&hash(row.text)===receipt.promptHash?[index]:[]);
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
    const result=await options.search(call.input.query,beforeSend,signal),verified=verifiedReceipt(result,requestHash),mcp=verified&&mcpFor(verified);
    if(!used||!sent.grant||!verified||!mcp)return response(503);
    settlement={receipt:verified,mcp};
    // Exact already-sent evidence may settle privately after cancellation; it never grants release.
    if(!await options.store.settleOperation(receipt,operation,sent.grant,settlement))return response(503);
   }
   if(!settlement||signal.aborted||!await current(receipt)||!await running(receipt,call)||signal.aborted
    ||!await options.store.authorizeRelease(receipt,operation,hashResearchJSON(settlement))||signal.aborted)return response(503);
   return response(200,settlement.mcp);
  }catch{return response(503);}
 }};
}

type FixtureAnswer={state:'invalid'}|{state:'insufficient'}|{state:'evidence';answer:string;citations:{handle:string;url:string;title:string;quote:string;capturedAt:string}[]};
/** C1 proves exact quoted fixture evidence; real-model prose has a separate later contract. */
export function verifyResearchSearchFixtureAnswer(raw:string,receipts:readonly TavilySearchReceipt[]):FixtureAnswer{
 const invalid={state:'invalid'} as const;
 try{
  if(!text(raw,24000)||Buffer.byteLength(raw)>24000||!Array.isArray(receipts)||!receipts.length||receipts.length>16)return invalid;
  const checked=receipts.map(r=>verifiedReceipt(r));if(checked.some(r=>r===null))return invalid;
  const value=strictJson(raw);if(!exact(value,['answer','evidence'])||!text(value.answer,600)||!Array.isArray(value.evidence))return invalid;
  const sources=checked.flatMap(r=>r!.sources);
  if(value.answer===''&&value.evidence.length===0)return sources.length===0?{state:'insufficient'}:invalid;
  if(value.evidence.length!==1||!exact(value.evidence[0],['handle','quote']))return invalid;
  const selection=value.evidence[0];if(!text(selection.quote,600)||!selection.quote.trim()||value.answer!==selection.quote)return invalid;
  const quote=selection.quote,matches=sources.filter(s=>s.handle===selection.handle&&s.content.includes(quote));
  if(matches.length!==1||sources.filter(s=>s.handle===selection.handle).length!==1)return invalid;
  const s=matches[0];return{state:'evidence',answer:value.answer,citations:[{handle:s.handle,url:s.url,title:s.title,quote,capturedAt:s.capturedAt}]};
 }catch{return invalid;}
}
