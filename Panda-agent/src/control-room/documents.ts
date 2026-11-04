import { createHash, createHmac, randomUUID } from 'node:crypto';
import { parseUploadedDocument } from '../ingestion/uploaded-document.ts';
import { uuid } from './validation.ts';
import { normalizeLexicalTerm, matchesLexicalTerm } from '../retrieval/lexical-terms.ts';

type Client = {database:{schema:(name:string)=>{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>}},storage:{from:(name:string)=>{download:(key:string)=>PromiseLike<{data:unknown;error:unknown}>}}};
type Admission = {kind:'admin';subject:string;client:Client} | {kind:'unauthorized'|'forbidden'|'unavailable'};
const response = (status:number,body:unknown) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail = (status:number,code:string) => response(status,{error:{code}});
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const digest = (bytes:Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function boundedBody(request:Request):Promise<string|null> {
 if(!request.body)return null; const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try { for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){void reader.cancel().catch(()=>{});return null;}parts.push(part.value);} return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)); }
 catch{return null;} finally{reader.releaseLock();}
}
export function createDocumentsHandlers(authenticate:()=>Promise<Admission>, enabled:()=>boolean) {
 const auth=async()=>{try{return await authenticate();}catch{return {kind:'unavailable'} as const;}};
 const denial=(a:Admission)=>fail(a.kind==='unauthorized'?401:a.kind==='forbidden'?403:503,a.kind);
 return {
  GET:async(request:Request) => {
   if(request.method!=='GET')return fail(405,'method_not_allowed');
   const a=await auth();if(a.kind!=='admin')return denial(a);
   if(!enabled())return fail(503,'unavailable');
   try {
    const params=new URL(request.url).searchParams, keys=[...params.keys()];
    if(keys.some(k=>!['q','cursor','limit'].includes(k)) || new Set(keys).size!==keys.length) return fail(400,'invalid_request');
    const query=params.get('q')??'',limitRaw=params.get('limit')??'20',cursor=params.get('cursor');
    if(query.length>100 || /[\x00-\x1f\x7f]/.test(query) || !/^(?:[1-9]|[1-4]\d|50)$/.test(limitRaw) || (cursor!==null && !/^[A-Za-z0-9_-]{1,2048}$/.test(cursor)))return fail(400,'invalid_request');
    let after:{title:string;kind:string;key:string}|null=null;
    if(cursor){const bytes=Buffer.from(cursor,'base64url');if(bytes.toString('base64url')!==cursor) return fail(400,'invalid_request');const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(v)||Object.keys(v).sort().join(',')!=='key,kind,title'||typeof v.title!=='string'||v.title.length>300||!['product_listing','uploaded_document'].includes(v.kind as string)||typeof v.key!=='string'||v.key.length>128)return fail(400,'invalid_request');after={title:v.title,kind:v.kind as string,key:v.key};}
    const r=await a.client.database.schema('public').rpc('panda_agent_external_documents_list',{p_query:query,p_limit:Number(limitRaw),p_after_title:after?.title??null,p_after_kind:after?.kind??null,p_after_key:after?.key??null});
    if(r.error||!object(r.data)||!Array.isArray(r.data.items)||r.data.items.length>Number(limitRaw)||!object(r.data.stats))return fail(503,'unavailable');
    const stats=r.data.stats;if(!['productDocuments','productChunks','uploadedDocuments','uploadedChunks'].every(k=>Number.isSafeInteger(stats[k])&&(stats[k] as number)>=0))return fail(503,'unavailable');
    const items=r.data.items.map(item=>{
     if(!object(item)||typeof item.title!=='string'||!item.title.trim()||item.title.length>300||/[\x00-\x1f\x7f]/.test(item.title))throw Error('Invalid document');
     if(item.kind==='product_listing'){
      if(typeof item.sku!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.sku)||item.status!=='available'||!Number.isSafeInteger(item.chunkCount)||(item.chunkCount as number)<0||(item.chunkCount as number)>64)throw Error('Invalid document');
      return {kind:'product_listing',title:item.title,sku:item.sku,status:'available',chunkCount:item.chunkCount};
     }
     if(item.kind!=='uploaded_document'||typeof item.reference!=='string'||!uuid(item.reference)||!['prepared','withdrawn','processing','failed'].includes(item.status as string)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw Error('Invalid document');
          if(item.status==='prepared'||item.status==='withdrawn'){
      if(!Number.isSafeInteger(item.version)||(item.version as number)<1||!Number.isSafeInteger(item.chunkCount)||(item.chunkCount as number)<1||(item.chunkCount as number)>256)throw Error('Invalid document');
      return {kind:'uploaded_document',title:item.title,reference:item.reference,status:item.status,version:item.version,chunkCount:item.chunkCount,createdAt:item.createdAt};
     }
     if(!Number.isSafeInteger(item.sourceVersion)||(item.sourceVersion as number)<1||typeof item.canRetry!=='boolean')throw Error('Invalid document');
     return {kind:'uploaded_document',title:item.title,reference:item.reference,status:item.status,sourceVersion:item.sourceVersion,canRetry:item.canRetry,createdAt:item.createdAt};
    });
    let nextCursor:null|string=null;if(r.data.nextCursor!==null){if(!object(r.data.nextCursor)||Object.keys(r.data.nextCursor).sort().join(',')!=='key,kind,title')return fail(503,'unavailable');nextCursor=Buffer.from(JSON.stringify(r.data.nextCursor)).toString('base64url');}
    const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    return response(200,{items,nextCursor,stats:{productDocuments:stats.productDocuments,productChunks:stats.productChunks,uploadedDocuments:stats.uploadedDocuments,uploadedChunks:stats.uploadedChunks}});
   }catch{return fail(503,'unavailable');}
  },
  STATUS:async(request:Request,reference:string) => {
   if(request.method!=='GET')return fail(405,'method_not_allowed');
   const a=await auth();if(a.kind!=='admin')return denial(a);
   if(!enabled())return fail(503,'unavailable');
   try {
    const params=new URL(request.url).searchParams,keys=[...params.keys()],raw=params.get('sourceVersion');
    if(!uuid(reference)||keys.length!==1||keys[0]!=='sourceVersion'||!raw||!/^[1-9]\d{0,15}$/.test(raw)||!Number.isSafeInteger(Number(raw)))return fail(400,'invalid_request');
    const r=await a.client.database.schema('public').rpc('panda_agent_external_status',{p_reference:reference,p_source_version:Number(raw)}),v=r.data;
    if(r.error||!object(v)||v.reference!==reference||v.sourceVersion!==Number(raw)||!['prepared','withdrawn','processing','failed','not_started'].includes(v.status as string)||typeof v.canRetry!=='boolean')return fail(503,'unavailable');
    let detail={};if(v.status==='prepared'||v.status==='withdrawn'){if(v.canRetry||!Number.isSafeInteger(v.version)||(v.version as number)<1||!Number.isSafeInteger(v.chunkCount)||(v.chunkCount as number)<1||(v.chunkCount as number)>256)return fail(503,'unavailable');detail={version:v.version,chunkCount:v.chunkCount};}
    const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    return response(200,{reference,sourceVersion:v.sourceVersion,status:v.status,canRetry:v.canRetry,...detail});
   }catch{return fail(503,'unavailable');}
  },
  DETAIL:async(request:Request,reference:string) => {
   if(request.method!=='GET')return fail(405,'method_not_allowed');
   const a=await auth();if(a.kind!=='admin')return denial(a);
   if(!enabled())return fail(503,'unavailable');
   try {
    const params=new URL(request.url).searchParams, values=[...params.keys()], raw=params.get('version');
    if(!uuid(reference)||values.length!==1||values[0]!=='version'||!raw||!/^[1-9]\d{0,15}$/.test(raw)||!Number.isSafeInteger(Number(raw)))return fail(400,'invalid_request');
    const r=await a.client.database.schema('public').rpc('panda_agent_external_document_read',{p_reference:reference,p_version:Number(raw)}),v=r.data;
    if(r.error||!object(v)||v.reference!==reference||v.version!==Number(raw)||v.status!=='prepared'||typeof v.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(v.fingerprint)||typeof v.title!=='string'||!v.title.trim()||v.title.length>180||!Array.isArray(v.chunks)||v.chunks.length<1||v.chunks.length>256)return fail(503,'unavailable');
    let total=0;const chunks=v.chunks.map((chunk,i)=>{if(!object(chunk)||chunk.ordinal!==i+1||typeof chunk.text!=='string'||!chunk.text.trim()||chunk.text.length>12000||!Array.isArray(chunk.sectionPath)||chunk.sectionPath.length>12||chunk.sectionPath.some((p:unknown)=>typeof p!=='string'||p.length>200))throw Error('Invalid chunk');total+=chunk.text.length;return {ordinal:chunk.ordinal,text:chunk.text,sectionPath:chunk.sectionPath};});
    if(total>20000)return fail(503,'unavailable');const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    const fresh=await current.client.database.schema('public').rpc('panda_agent_external_document_read',{p_reference:reference,p_version:Number(raw)});
    if(fresh.error||!object(fresh.data)||fresh.data.reference!==reference||fresh.data.version!==v.version||fresh.data.status!=='prepared'||fresh.data.fingerprint!==v.fingerprint||request.signal.aborted)return fail(503,'unavailable');
    return response(200,{reference,title:v.title,version:v.version,status:'prepared',chunks});
   }catch{return fail(503,'unavailable');}
  },
  SEARCH:async(request:Request,reference:string) => {
   if(request.method!=='POST')return fail(405,'method_not_allowed');
   const a=await auth();if(a.kind!=='admin')return denial(a);
   if(!enabled())return fail(503,'unavailable');
   try{if(request.headers.get('origin')!==new URL(request.url).origin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return fail(403,'forbidden');}catch{return fail(403,'forbidden');}
   if(!uuid(reference))return fail(400,'invalid_request');
   const raw=await boundedBody(request);if(raw===null)return fail(413,'too_large');
   let input:unknown;try{input=JSON.parse(raw);}catch{return fail(400,'invalid_request');}
   if(!object(input)||Object.keys(input).sort().join(',')!=='question,version'||!Number.isSafeInteger(input.version)||(input.version as number)<1||typeof input.question!=='string'||!input.question.isWellFormed()||!input.question.trim()||input.question.length>2000||/[\x00-\x1f\x7f]/.test(input.question))return fail(400,'invalid_request');
   try{
    const version=input.version as number,question=input.question;
    const read=await a.client.database.schema('public').rpc('panda_agent_external_document_read',{p_reference:reference,p_version:version}),v=read.data;
    if(read.error||!object(v)||v.reference!==reference||v.version!==version||v.status!=='prepared'||typeof v.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(v.fingerprint)||typeof v.title!=='string'||!v.title.trim()||v.title.length>180||!Array.isArray(v.chunks)||v.chunks.length<1||v.chunks.length>256)return fail(503,'unavailable');
    const stop=new Set(['the','and','for','with','what','does','this','that','how','are','can','its','which','about','tell','have']);
    const terms=[...new Set((question.toLowerCase().match(/[a-z0-9]+/g)??[]).filter(term=>term.length>2&&!stop.has(term)).map(normalizeLexicalTerm))];
    let total=0;const chunks=v.chunks.map((chunk,i)=>{
     if(!object(chunk)||chunk.ordinal!==i+1||typeof chunk.text!=='string'||!chunk.text.trim()||chunk.text.length>12000||typeof chunk.textSha256!=='string'||!/^[a-f0-9]{64}$/.test(chunk.textSha256)||digest(Buffer.from(chunk.text,'utf8'))!==chunk.textSha256||!Array.isArray(chunk.sectionPath)||chunk.sectionPath.length>12||chunk.sectionPath.some((p:unknown)=>typeof p!=='string'||p.length>200))throw Error('Invalid chunk');
     total+=chunk.text.length;const text=chunk.text.toLowerCase();return {ordinal:chunk.ordinal as number,text:chunk.text,sectionPath:chunk.sectionPath as string[],score:terms.filter(term=>matchesLexicalTerm(term,text)).length};
    });
    if(total>20000)return fail(503,'unavailable');
    const ranked=chunks.filter(c=>c.score>0).sort((x,y)=>y.score-x.score||x.ordinal-y.ordinal).slice(0,8);
    let remaining=20000;const passages=ranked.filter(c=>{if(c.text.length>remaining)return false;remaining-=c.text.length;return true;}).map((c,i)=>({rank:i+1,text:c.text,source:{kind:'uploaded_document',reference,version,title:v.title,ordinal:c.ordinal,sectionPath:c.sectionPath}}));
    const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    const fresh=await current.client.database.schema('public').rpc('panda_agent_external_document_read',{p_reference:reference,p_version:version});
    if(fresh.error||!object(fresh.data)||fresh.data.reference!==reference||fresh.data.version!==version||fresh.data.status!=='prepared'||fresh.data.fingerprint!==v.fingerprint||request.signal.aborted)return fail(503,'unavailable');
    const final=await auth();if(final.kind!=='admin'||final.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    return response(200,{outcome:passages.length?'retrieved':'insufficient',retrieval:'lexical',relevance:'unverified',passages});
   }catch{return fail(503,'unavailable');}
  },
  WITHDRAW:async(request:Request,reference:string) => {
   if(request.method!=='POST')return fail(405,'method_not_allowed');
   const a=await auth();if(a.kind!=='admin')return denial(a);
   if(!enabled())return fail(503,'unavailable');
   try {if(request.headers.get('origin')!==new URL(request.url).origin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return fail(403,'forbidden');}catch{return fail(403,'forbidden');}
   if(!uuid(reference))return fail(400,'invalid_request');
   const raw=await boundedBody(request);if(raw===null)return fail(413,'too_large');
   let input:unknown;try{input=JSON.parse(raw);}catch{return fail(400,'invalid_request');}
   if(!object(input)||Object.keys(input).join(',')!=='expectedVersion'||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<1||(input.expectedVersion as number)>=Number.MAX_SAFE_INTEGER)return fail(400,'invalid_request');
   if(request.signal.aborted)return fail(503,'unavailable');
   try {
    const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    const result=await current.client.database.schema('public').rpc('panda_agent_external_withdraw',{p_reference:reference,p_version:input.expectedVersion});
    if(result.error){if(object(result.error)&&result.error.code==='P0001'&&result.error.details==='version_conflict')return fail(409,'conflict');return fail(503,'unavailable');}
    if(!object(result.data)||result.data.reference!==reference||result.data.status!=='withdrawn'||result.data.version!==(input.expectedVersion as number)+1)return fail(503,'unavailable');
    const final=await auth();if(final.kind!=='admin'||final.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    return response(200,{reference,status:'withdrawn',version:result.data.version});
   }catch{return fail(503,'unavailable');}
  },
  POST:async(request:Request) => {
   if(request.method!=='POST')return fail(405,'method_not_allowed');
   const a=await auth();if(a.kind!=='admin')return denial(a);
   if(!enabled())return fail(503,'unavailable');
   try {if(request.headers.get('origin')!==new URL(request.url).origin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return fail(403,'forbidden');}catch{return fail(403,'forbidden');}
   const raw=await boundedBody(request);if(raw===null)return fail(413,'too_large');
   let value:unknown;try{value=JSON.parse(raw);}catch{return fail(400,'invalid_request');}
   if(!object(value)||Object.keys(value).sort().join(',')!=='expectedVersion,reference'||typeof value.reference!=='string'||!uuid(value.reference)||!Number.isSafeInteger(value.expectedVersion)||(value.expectedVersion as number)<1)return fail(400,'invalid_request');
   const secret=process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET;if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))return fail(503,'unavailable');
   try {
    const ref=value.reference,version=value.expectedVersion as number,nonce=randomUUID();
    const source=await a.client.database.schema('public').rpc('panda_agent_external_source',{p_reference:ref,p_version:version,p_nonce:nonce});
    if(source.error || !object(source.data))return fail(503,'unavailable');
    const data=source.data;
    if(data.status==='prepared'&&data.reference===ref&&Number.isSafeInteger(data.version)&&Number.isSafeInteger(data.chunkCount)){const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');return response(200,{reference:ref,status:'prepared',version:data.version,chunkCount:data.chunkCount});}
    if(data.reference!==ref||data.version!==version||typeof data.expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(data.expectedSha256)||!Number.isSafeInteger(data.expectedSize)||(data.expectedSize as number)<1||(data.expectedSize as number)>3145728||typeof data.mediaType!=='string')return fail(503,'unavailable');
    const ext=data.mediaType==='application/pdf'?'pdf':data.mediaType==='text/markdown'?'md':data.mediaType==='text/plain'?'txt':null;if(!ext)return fail(503,'unavailable');
    const read=await a.client.storage.from('panda-agent-intake-private').download(`intakes/${ref}/source.${ext}`);
    if(read.error||!(read.data instanceof Blob)||read.data.size!==data.expectedSize||read.data.size>3145728)return fail(503,'unavailable');
    const bytes=new Uint8Array(await read.data.arrayBuffer());if(digest(bytes)!==data.expectedSha256||request.signal.aborted)return fail(503,'unavailable');
    let parsed: Awaited<ReturnType<typeof parseUploadedDocument>>;
    try { parsed=await parseUploadedDocument({mediaType:data.mediaType,bytes,expectedSha256:data.expectedSha256}); }
    catch {
     const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
     const failed=await current.client.database.schema('public').rpc('panda_agent_external_fail',{p_reference:ref,p_nonce:nonce});
     if(failed.error||!object(failed.data)||failed.data.reference!==ref||failed.data.status!=='failed')return fail(503,'unavailable');
     return fail(422,'document_unprocessable');
    }
    const current=await auth();if(current.kind!=='admin'||current.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    const chunks=parsed.chunks.map((c:{text:string;content_sha256:string;section_path:string[]})=>({text:c.text,textSha256:c.content_sha256,sectionPath:c.section_path}));
    const payload=JSON.stringify({version:1,actor:a.subject,reference:ref,sourceVersion:version,originalSha256:parsed.originalSha256,normalizedSha256:parsed.normalizedSha256,parserVersion:parsed.parserVersion,chunks,nonce,expiresAt:Math.floor(Date.now()/1000)+60});
    const mac=createHmac('sha256',Buffer.from(secret,'hex')).update('pandabyte/external-ingestion/v1\0'+payload,'utf8').digest('hex');
    const saved=await current.client.database.schema('public').rpc('panda_agent_external_commit',{p_payload:payload,p_mac:mac});
    if(saved.error||!object(saved.data)||saved.data.reference!==ref||saved.data.status!=='prepared'||!Number.isSafeInteger(saved.data.version))return fail(503,'unavailable');
    const final=await auth();if(final.kind!=='admin'||final.subject!==a.subject||request.signal.aborted)return fail(503,'unavailable');
    return response(200,{reference:ref,status:'prepared',version:saved.data.version,chunkCount:chunks.length});
   }catch{return fail(503,'unavailable');}
  },
 };
}
