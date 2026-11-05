import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {hmac,strictJson} from '../lightweight/client.ts';
import {parseGuideInput,type GuideInput,type GuideSkill} from './contracts.ts';
type Fragment={handle:string;text:string};
type Intent=Omit<GuideInput,'expectedVersion'>;
export type GuideRequest={threadId:string;turnId:string;productSku:string;skill:GuideSkill;intent:Intent;fragments:Fragment[]};
export type PreparedGuide={body:string;requestBodySha256:string;input:GuideRequest};
type Actor={subject:string;sessionId:string;signal?:AbortSignal};
const uuid=(s:unknown):s is string=>typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const hex=(s:unknown):s is string=>typeof s==='string' && /^[0-9a-f]{64}$/.test(s);
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const keys=(x:unknown,k:string[]):x is Record<string,unknown>=>!!x && typeof x==='object' && !Array.isArray(x) && Object.keys(x).length===k.length && k.every(v=>Object.hasOwn(x,v));
const text=(s:unknown,n:number):s is string=>typeof s==='string' && !!s.trim() && s.length<=n && !/\p{Surrogate}/u.test(s);
const validFragments=(f:unknown):f is Fragment[]=>Array.isArray(f) && f.length<=8 && f.every(v=>keys(v,['handle','text']) && text(v.handle,300) && text(v.text,12000)) && new Set(f.map(v=>v.handle)).size===f.length && f.reduce((n,v)=>n+v.text.length,0)<=20000;
const fieldLine=(source:string,quote:string)=>source.split(/\r\n|[\n\r\u0085\u2028\u2029]/).some(line=>{
 const match=/^[ \t]*(?:(?:[-*•]|â€¢)[ \t]*)?((?:MCU|Microcontroller):[ \t]*[A-Za-z0-9][A-Za-z0-9_-]{0,63})(?: \(description, line [1-9][0-9]{0,5}; listing claim\))?(?:Â?\u00a0)?[ \t]*$/i.exec(line);
 return match?.[1]===quote;
});
export function prepareGuide(input:GuideRequest):PreparedGuide {
 if(!keys(input,['threadId','turnId','productSku','skill','intent','fragments']) || !uuid(input.threadId) || !uuid(input.turnId) || !text(input.productSku,128) || input.productSku!==input.productSku.trim() || !keys(input.skill,['id','version','hash']) || input.skill.id!=='embedded-project-guide' || ![1,2].includes(input.skill.version as number) || !hex(input.skill.hash) || !validFragments(input.fragments))throw Error('Invalid guide input');
 if(!(keys(input.intent,['goal','board','components']) || keys(input.intent,['goal','board','revision','components'])))throw Error('Invalid guide intent');
 const parsed=parseGuideInput({...input.intent,expectedVersion:0});
 if(!parsed || parsed.goal!==input.intent.goal || parsed.board!==input.intent.board || parsed.revision!==input.intent.revision || parsed.components.some((v,i)=>v!==input.intent.components[i]))throw Error('Invalid guide intent');
 const copy=structuredClone(input),body=JSON.stringify({version:1,mode:'deterministic-guide-v1',...copy});
 if(Buffer.byteLength(body)>98304)throw Error('Guide body too large');
 return {body,requestBodySha256:sha(body),input:copy};
}
const codes:Record<number,string[]>={202:['pending'],409:['outcome_unknown','turn_conflict','capability_replayed','cancelled'],429:['busy','quota_exhausted'],503:['disabled','provider_unavailable'],422:['invalid_selection','budget_exceeded'],400:['invalid'],401:['unauthorized'],404:['not_found'],405:['method_not_allowed'],413:['too_large']};
export type GuideWire={version:1;state:'complete';guide:{template:'parking-monitor'|'project';questions:string[];nodes:6;workers:2};selections:{handle:string;quote:string}[];usage:{modelCalls:0;inputTokens:0;outputTokens:0;costNanoUsd:0}} | {version:1;state:'pending'|'unknown'|'rejected';code:string;usage:null};
export function verifyGuideResponse(p:{status:number;body:string;receipt:string|null;secret:string;nonce:string;bodySha256:string;fragments?:Fragment[]}):GuideWire {
 if(Buffer.byteLength(p.body)>16384 || !uuid(p.nonce) || !hex(p.bodySha256) || !p.receipt || !/^[A-Za-z0-9_-]{43}$/.test(p.receipt) || (p.fragments!==undefined && !validFragments(p.fragments)))throw Error('Invalid response');
 const expected=hmac(p.secret,`response.v1\n${p.nonce}\n${p.bodySha256}\n${sha(p.body)}`);
 if(!timingSafeEqual(Buffer.from(expected),Buffer.from(p.receipt)))throw Error('Invalid receipt');
 const x=strictJson(p.body);
 if(!x || typeof x!=='object' || (x as Record<string,unknown>).version!==1)throw Error('Invalid response');
 if(p.status===200 && keys(x,['version','state','guide','selections','usage']) && x.state==='complete'){
  const g=x.guide,u=x.usage;
  if(!validFragments(p.fragments) || !keys(g,['template','questions','nodes','workers']) || !['parking-monitor','project'].includes(g.template as string) || JSON.stringify(g.questions)!==JSON.stringify(['revision','wiring','framework','component-specifications']) || g.nodes!==6 || g.workers!==2 || !keys(u,['modelCalls','inputTokens','outputTokens','costNanoUsd']) || Object.values(u).some(v=>v!==0) || !Array.isArray(x.selections) || x.selections.length>1)throw Error('Invalid result');
  for(const s of x.selections)if(!keys(s,['handle','quote']) || !text(s.handle,300) || !text(s.quote,600) || !/^(?:MCU|Microcontroller):[ \t]*[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/i.test(s.quote) || !/[A-Za-z]/.test(s.quote.slice(s.quote.indexOf(':')+1)) || !/[0-9]/.test(s.quote.slice(s.quote.indexOf(':')+1)) || !p.fragments.some(f=>f.handle===s.handle && fieldLine(f.text,s.quote as string)))throw Error('Invalid quote');
  return x as GuideWire;
 }
 if(!keys(x,['version','state','code','usage']) || x.usage!==null || typeof x.code!=='string' || !codes[p.status]?.includes(x.code) || x.state!==(x.code==='pending'?'pending':x.code==='outcome_unknown'?'unknown':'rejected'))throw Error('Invalid response');
 return x as GuideWire;
}
export function createGuideClient(config:{baseUrl:string;secret:string;fetch?:typeof fetch;timeoutMs?:number}){
 const base=new URL(config.baseUrl),timeout=config.timeoutMs??35000;
 if(base.username || base.password || base.search || base.hash || base.pathname!=='/' || (base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname))) || !text(config.secret,4096) || !Number.isInteger(timeout) || timeout<1 || timeout>60000)throw Error('Invalid transport');
 async function send(action:'runguide'|'readguide'|'cancelguide',actor:Actor,threadId:string,turnId:string,sku:string,body:string,fragments?:Fragment[]):Promise<GuideWire>{
  if(!text(actor.subject,512) || !text(actor.sessionId,512) || !uuid(threadId) || !uuid(turnId) || !text(sku,128) || (action!=='cancelguide' && !validFragments(fragments)))throw Error('Invalid capability');
  const nonce=randomUUID(),bodySha256=sha(body),iat=Math.floor(Date.now()/1000),claim={v:1,aud:'panda-lightweight-guide-v1',action,sub:sha(actor.subject),sid:sha(actor.sessionId),turnId,sku,nonce,iat,exp:iat+60,bodySha256};
  const segment=Buffer.from(JSON.stringify(claim)).toString('base64url'),token=`${segment}.${hmac(config.secret,segment)}`;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout),abort=()=>controller.abort();actor.signal?.addEventListener('abort',abort,{once:true});if(actor.signal?.aborted)controller.abort();
  try{
   const res=await (config.fetch??fetch)(new URL(action==='runguide'?'/v1/guides/run':action==='readguide'?'/v1/guides/status':'/v1/guides/cancel',base),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body,signal:controller.signal,redirect:'error',cache:'no-store'});
   if(!res.body)throw Error('Missing body');const reader=res.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw Error('Too large');}chunks.push(value);}
   return verifyGuideResponse({status:res.status,body:new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),receipt:res.headers.get('x-panda-receipt'),secret:config.secret,nonce,bodySha256,fragments});
  }catch{throw Error('Guide outcome unknown');}finally{clearTimeout(timer);actor.signal?.removeEventListener('abort',abort);}
 }
 return {
  run:async ({subject,sessionId,prepared,signal}:Actor & {prepared:PreparedGuide})=>{const p=prepareGuide(prepared.input);if(p.body!==prepared.body || p.requestBodySha256!==prepared.requestBodySha256)throw Error('Invalid prepared request');return send('runguide',{subject,sessionId,signal},p.input.threadId,p.input.turnId,p.input.productSku,p.body,p.input.fragments);},
  status:async ({subject,sessionId,threadId,turnId,productSku,requestBodySha256,fragments,signal}:Actor & {threadId:string;turnId:string;productSku:string;requestBodySha256:string;fragments:Fragment[]})=>{if(!hex(requestBodySha256))throw Error('Invalid digest');return send('readguide',{subject,sessionId,signal},threadId,turnId,productSku,JSON.stringify({version:1,threadId,turnId,requestBodySha256}),fragments);},
  cancel:async ({subject,sessionId,threadId,turnId,productSku,requestBodySha256,signal}:Actor & {threadId:string;turnId:string;productSku:string;requestBodySha256:string})=>{if(!hex(requestBodySha256))throw Error('Invalid digest');return send('cancelguide',{subject,sessionId,signal},threadId,turnId,productSku,JSON.stringify({version:1,threadId,turnId,requestBodySha256}));},
 };
}
