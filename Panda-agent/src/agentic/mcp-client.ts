import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {hmac,strictJson} from '../lightweight/client.ts';
import {uuid} from '../server/chat-contracts.ts';

export const mcpDocumentId='espressif-esp-idf-5.5.1-esp32-gpio';
export const mcpDocumentUrl='https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,want:string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).sort().join(',')===[...want].sort().join(',');
type Prepared={body:string;digest:string;turnId:string;documentId:typeof mcpDocumentId};
type Actor={subject:string;sessionId:string;signal?:AbortSignal};
export type McpDocument={documentId:typeof mcpDocumentId;url:typeof mcpDocumentUrl;title:string;framework:'esp-idf';chip:'esp32';version:'5.5.1';fetchedAt:string;bodySha256:string;header:'#include "driver/gpio.h"'};
export type McpWire={version:1;state:'complete';document:McpDocument;usage:{modelCalls:0;inputTokens:0;outputTokens:0;costNanoUsd:0}}|{version:1;state:'pending'|'unknown'|'rejected';code:string;usage:null};
export function prepareMcp(turnId:string,documentId:string):Prepared{
 if(!uuid(turnId)||documentId!==mcpDocumentId)throw Error('Invalid MCP input');
 const body=JSON.stringify({version:1,turnId,documentId});return {body,digest:hash(body),turnId,documentId};
}
export function parseMcpDocument(v:unknown):McpDocument{
 if(!keys(v,['documentId','url','title','framework','chip','version','fetchedAt','bodySha256','header'])||v.documentId!==mcpDocumentId||v.url!==mcpDocumentUrl||v.title!=='ESP-IDF v5.5.1 ESP32 GPIO'||v.framework!=='esp-idf'||v.chip!=='esp32'||v.version!=='5.5.1'||typeof v.fetchedAt!=='string'||v.fetchedAt.length>40||!Number.isFinite(Date.parse(v.fetchedAt))||!hex(v.bodySha256)||v.header!=='#include "driver/gpio.h"')throw Error('Invalid MCP document');
 return v as McpDocument;
}
export function createMcpClient(config:{baseUrl:string;secret:string;fetch?:typeof fetch;timeoutMs?:number}){
 const url=new URL(config.baseUrl), timeoutMs=config.timeoutMs??12000;
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))||!config.secret||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid MCP transport');
 async function send(action:'runmcp'|'readmcp'|'cancelmcp',actor:Actor,turnId:string,body:string):Promise<McpWire>{
  if(!uuid(turnId)||![actor.subject,actor.sessionId].every(x=>typeof x==='string'&&x.trim()&&x.length<=512&&!/\p{Surrogate}/u.test(x)))throw Error('Invalid MCP actor');
  const nonce=randomUUID(),bodySha256=hash(body),iat=Math.floor(Date.now()/1000);
  const claims={v:1,aud:'panda-lightweight-mcp-v1',action,sub:hash(actor.subject),sid:hash(actor.sessionId),turnId,sku:mcpDocumentId,nonce,iat,exp:iat+60,bodySha256};
  const segment=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs);actor.signal?.addEventListener('abort',abort,{once:true});if(actor.signal?.aborted)abort();
  try{
   const response=await (config.fetch??fetch)(new URL('/v1/mcp/'+({runmcp:'run',readmcp:'status',cancelmcp:'cancel'}[action]),url),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${segment}.${hmac(config.secret,segment)}`},body,redirect:'error',cache:'no-store',signal:controller.signal});
   if(!response.body)throw Error('Missing body');
   const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('Large MCP result');}parts.push(value);}}finally{reader.releaseLock();}
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)),receipt=response.headers.get('x-panda-receipt');
   const expected=hmac(config.secret,`response.v1\n${nonce}\n${bodySha256}\n${hash(raw)}`);
   if(!receipt||!/^[A-Za-z0-9_-]{43}$/.test(receipt)||!timingSafeEqual(Buffer.from(expected),Buffer.from(receipt)))throw Error('Invalid MCP receipt');
   const v=strictJson(raw);
   if(response.status===200&&keys(v,['version','state','document','usage'])&&v.version===1&&v.state==='complete'&&keys(v.usage,['modelCalls','inputTokens','outputTokens','costNanoUsd'])&&Object.values(v.usage).every(x=>x===0))return {...v,document:parseMcpDocument(v.document)} as McpWire;
   const codes:Record<number,string[]>={202:['pending'],409:['outcome_unknown','turn_conflict','capability_replayed','cancelled'],429:['busy','quota_exhausted'],503:['disabled','provider_unavailable'],422:['invalid_selection','budget_exceeded'],400:['invalid'],401:['unauthorized'],404:['not_found'],413:['too_large']};
   if(!keys(v,['version','state','code','usage'])||v.version!==1||typeof v.code!=='string'||!codes[response.status]?.includes(v.code)||v.usage!==null||v.state!==(v.code==='pending'?'pending':v.code==='outcome_unknown'?'unknown':'rejected'))throw Error('Invalid MCP result');
   return v as McpWire;
  }catch{throw Error('MCP outcome unknown');}finally{clearTimeout(timer);actor.signal?.removeEventListener('abort',abort);}
 }
 const observation=(action:'readmcp'|'cancelmcp',args:Actor&{turnId:string;requestBodySha256:string})=>{
  if(!hex(args.requestBodySha256))throw Error('Invalid original digest');
  return send(action,args,args.turnId,JSON.stringify({version:1,turnId:args.turnId,requestBodySha256:args.requestBodySha256}));
 };
 return {
  run:({prepared,...actor}:Actor&{prepared:Prepared})=>{const next=prepareMcp(prepared.turnId,prepared.documentId);if(next.body!==prepared.body||next.digest!==prepared.digest)throw Error('Invalid prepared MCP');return send('runmcp',actor,next.turnId,next.body);},
  status:(args:Actor&{turnId:string;requestBodySha256:string})=>observation('readmcp',args),
  cancel:(args:Actor&{turnId:string;requestBodySha256:string})=>observation('cancelmcp',args),
 };
}
