import { createHash } from 'node:crypto';
import { answerQuestion } from '../retrieval/answers.ts';
import type { Adapters, CanonicalChunk, Product } from '../retrieval/contracts.ts';
import { validatePlaygroundEvaluation } from './playground-evaluation.ts';
import {playgroundContextProof} from './playground-context-proof.ts';
import {publicUrl,uuid} from './validation.ts';
import {isPlaygroundUsage,type PlaygroundUsage} from './playground-usage.ts';

type Admin = { kind:'admin'; subject:string; adapters:Adapters };
type Admission = Admin | {kind:'unauthorized'|'forbidden'|'unavailable'};
export type ComparisonPassage = {rank:number;title:string;sourceUrl:string;capturedAt:string;sectionPath:string[];text:string};
export type ComparisonContext = {passages:ComparisonPassage[];digest:string;provenanceDigest:string;revalidate:()=>Promise<boolean>};
type Operation = {model:string;requestId:string};
type Evaluated = {model:string;requestId:string;status:'evaluated';answer:string;evidence:Array<{rank:number;quote:string;reason:string}>;metrics:{elapsedMs:number;inputTokens:number|null;outputTokens:number|null;costUsd:number|null}};
type Result = Evaluated | {model:string;requestId:string;status:'not_admitted'|'quota'|'outcome_unknown'|'skipped'};
export type ComparisonDependencies = {
 authorize:()=>Promise<Admission>;
 configuredModels:()=>Promise<readonly string[]>;
 prepare:(actor:Admin,question:string,signal:AbortSignal)=>Promise<ComparisonContext>;
 // This callback must use the shared durable admission/cost guard; catalog data is not authority.
 evaluate:(input:Operation & {question:string;context:ComparisonContext},beforeSend:()=>Promise<boolean>,signal:AbortSignal)=>Promise<unknown>;
};
const plain=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const modelId=(x:unknown):x is string=>typeof x==='string'&&x.length<=200&&/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(x);
const digest=(passages:Array<{rank:number;text:string}>)=>createHash('sha256').update(JSON.stringify(passages.map(({rank,text})=>({rank,text})))).digest('hex');
const json=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status:number,code:string)=>json(status,{error:{code}});

async function body(request:Request) {
 if(!request.body)return null;
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
 try{for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>8192){void reader.cancel().catch(()=>{});throw Error('too_large');}parts.push(p.value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}
 finally{reader.releaseLock();}
}

function snapshot(value:ComparisonContext):ComparisonContext {
 if(!value||typeof value.revalidate!=='function'||!Array.isArray(value.passages)||value.passages.length>8||!/^[a-f0-9]{64}$/.test(value.provenanceDigest))throw Error('Invalid context');
 let chars=0;const passages=value.passages.map((p,i)=>{
  if(!p||p.rank!==i+1||typeof p.text!=='string'||!p.text.isWellFormed()||!p.text.trim()||p.text.length>12000||typeof p.title!=='string'||!p.title.trim()||p.title.length>300||!publicUrl(p.sourceUrl)||!Number.isFinite(Date.parse(p.capturedAt))||!Array.isArray(p.sectionPath)||p.sectionPath.length>12||p.sectionPath.some(s=>typeof s!=='string'||s.length>200))throw Error('Invalid context');
  chars+=p.text.length;return Object.freeze({rank:p.rank,text:p.text,title:p.title,sourceUrl:p.sourceUrl,capturedAt:p.capturedAt,sectionPath:Object.freeze([...p.sectionPath]) as unknown as string[]});
 });
 if(chars>20000||value.digest!==digest(passages))throw Error('Invalid context');
 return Object.freeze({passages:Object.freeze(passages) as unknown as ComparisonPassage[],digest:value.digest,provenanceDigest:value.provenanceDigest,revalidate:value.revalidate});
}

export function createModelComparisonHandlers(deps:ComparisonDependencies) {
 const admit=async():Promise<Admission>=>{try{return await deps.authorize();}catch{return {kind:'unavailable'};}};
 const denial=(a:Admission)=>fail(a.kind==='unauthorized'?401:a.kind==='forbidden'?403:503,a.kind);
 const models=async()=>{const m=await deps.configuredModels();if(!Array.isArray(m)||m.length>128||m.some(x=>!modelId(x))||new Set(m).size!==m.length)throw Error('Invalid configuration');return [...m];};
 return {
  GET:async()=>{
   const a=await admit();if(a.kind!=='admin')return denial(a);
   try{const configured=await models(),last=await admit();if(last.kind!=='admin'||last.subject!==a.subject)return fail(503,'unavailable');return json(200,{execution:configured.length?'configured_unverified':'unconfigured',models:configured,maxModels:4});}catch{return fail(503,'unavailable');}
  },
  POST:async(request:Request)=>{
   if(request.method!=='POST')return fail(405,'method_not_allowed');
   const a=await admit();if(a.kind!=='admin')return denial(a);
   if(request.headers.get('origin')!==new URL(request.url).origin)return fail(403,'forbidden');
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return fail(415,'unsupported_media_type');
   let input:unknown;try{input=await body(request);}catch(e){return fail((e as Error).message==='too_large'?413:400,(e as Error).message==='too_large'?'too_large':'invalid_request');}
   if(!plain(input)||Object.keys(input).sort().join(',')!=='operations,question'||typeof input.question!=='string'||!input.question.isWellFormed()||!input.question.trim()||input.question.length>2000||/[\x00-\x1f\x7f]/.test(input.question)||!Array.isArray(input.operations)||input.operations.length<1||input.operations.length>4)return fail(400,'invalid_request');
   const operations:Operation[]=[];const ids=new Set<string>(),selected=new Set<string>();
   for(const op of input.operations){if(!plain(op)||Object.keys(op).sort().join(',')!=='model,requestId'||!modelId(op.model)||typeof op.requestId!=='string'||!uuid(op.requestId)||op.requestId!==op.requestId.toLowerCase()||ids.has(op.requestId)||selected.has(op.model))return fail(400,'invalid_request');ids.add(op.requestId);selected.add(op.model);operations.push({model:op.model,requestId:op.requestId});}
   let allowed:string[];try{allowed=await models();}catch{return fail(503,'unconfigured');}
   if(operations.some(op=>!allowed.includes(op.model)))return fail(503,'unconfigured');
   if(request.signal.aborted)return fail(503,'unavailable');
   let context:ComparisonContext;
   try{context=snapshot(await deps.prepare(a,input.question,request.signal));}catch{return fail(503,'unavailable');}
   const current=async()=>{try{if(request.signal.aborted)return false;const fresh=await admit();return fresh.kind==='admin'&&fresh.subject===a.subject&&await context.revalidate()&&!request.signal.aborted;}catch{return false;}};
   const results:Result[]=[];let stopped=false;
   for(const op of operations){
    if(stopped||!context.passages.length){results.push({...op,status:'skipped'});continue;}
    if(!await current())return fail(503,'unavailable');
    const started=performance.now();
    try{
     const raw=await deps.evaluate({...op,question:input.question,context},current,request.signal);
     if(!await current())return fail(503,'unavailable');
     const envelope=plain(raw)&&Object.keys(raw).sort().join(',')==='evaluation,usage';
     const checked=validatePlaygroundEvaluation(envelope?raw.evaluation:raw,context.passages.map(p=>({handle:String(p.rank),text:p.text})));
     if(!checked)throw Error('Invalid model response');
     const usage:PlaygroundUsage|null=envelope&&isPlaygroundUsage(raw.usage)?raw.usage:null;
     results.push({...op,status:'evaluated',answer:checked.answer,evidence:checked.evidence,metrics:{elapsedMs:Math.round(performance.now()-started),inputTokens:usage?.inputTokens??null,outputTokens:usage?.outputTokens??null,costUsd:usage?usage.costNanoUsd/1e9:null}});
    }catch(error){
     const code=(error as {code?:unknown})?.code;
     results.push({...op,status:code==='quota'?'quota':code==='not_admitted'?'not_admitted':'outcome_unknown'});stopped=true;
    }
   }
   try{if(!await current())return fail(503,'unavailable');}catch{return fail(503,'unavailable');}
   return json(200,{context:{passages:context.passages,digest:context.digest},results});
  },
 };
}

// Capture the existing canonical pipeline once. Never manufacture canonical approval flags.
export async function prepareProductComparisonContext(actor:Admin,question:string,signal:AbortSignal):Promise<ComparisonContext> {
 const base=actor.adapters;let chunks:CanonicalChunk[]=[],fragments:Array<{handle:string;text:string}>=[],revalidate:(()=>Promise<boolean>)|undefined,product:Product|undefined,fingerprint='';
 const result=await answerQuestion({subject:actor.subject},{question},{...base,ranking:{mode:'lexical'},resolveIdentity:async(...args)=>{const identity=await base.resolveIdentity(...args);if(identity.kind==='resolved')product=identity.product;return identity;},currentScope:async(...args)=>{const scope=await base.currentScope(...args);if(scope){chunks=scope.chunks;fingerprint=scope.fingerprint;}return scope;},select:async(_q,selected,context)=>{fragments=selected;revalidate=context?.revalidate;return {selections:[]};}});
 if(signal.aborted||['unavailable','unauthorized','invalid'].includes(result.kind))throw Error('Context unavailable');
 const byHandle=new Map(chunks.map(c=>[c.handle,c]));
 const passages=fragments.map((f,i)=>{const c=byHandle.get(f.handle);if(!c)throw Error('Unknown fragment');return {rank:i+1,text:f.text,title:c.title,sourceUrl:c.sourceUrl,capturedAt:c.capturedAt,sectionPath:c.sectionPath};});
 const provenanceDigest=product?playgroundContextProof(product,fingerprint,fragments,chunks):createHash('sha256').update('no-resolved-product').digest('hex');
 return snapshot({passages,digest:digest(passages),provenanceDigest,revalidate:async()=>!signal.aborted&&(revalidate?await revalidate():passages.length===0)&&!signal.aborted});
}
