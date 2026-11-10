import {parseQuestion} from '../retrieval/answers.ts';
import {uuid} from './validation.ts';
import {runRagWorkflow,type RagWorkflowDependencies} from './rag-workflow.ts';

export type WorkflowAdmission={kind:'admin';subject:string;dependencies:RagWorkflowDependencies}|{kind:'unauthorized'|'forbidden'|'unavailable'};
const json=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status:number,code:string)=>json(status,{error:{code}});
export async function readWorkflowBody(request:Request,signal:AbortSignal){
 if(!request.body)throw Error('invalid_request');const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>8192){cancel();throw Error('too_large');}parts.push(part.value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))) as unknown;}finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}
export function createPlaygroundWorkflowHandler(authenticate:()=>Promise<WorkflowAdmission>){
 return async(request:Request)=>{
  if(request.method!=='POST')return fail(405,'method_not_allowed');
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
  let admission:WorkflowAdmission;try{admission=await authenticate();}catch{return fail(503,'unavailable');}
  if(admission.kind!=='admin')return fail(admission.kind==='unauthorized'?401:admission.kind==='forbidden'?403:503,admission.kind);
  if(request.headers.get('origin')!==new URL(request.url).origin)return fail(403,'forbidden');
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return fail(415,'unsupported_media_type');
  let value:unknown;try{value=await readWorkflowBody(request,signal);}catch(e){if(signal.aborted)return fail(503,'unavailable');return fail((e as Error).message==='too_large'?413:400,(e as Error).message==='too_large'?'too_large':'invalid_request');}
  if(!value||typeof value!=='object'||Array.isArray(value))return fail(400,'invalid_request');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['question','evaluate','requestId'].includes(k))||!parseQuestion({question:v.question})||(v.evaluate!==undefined&&typeof v.evaluate!=='boolean')||(v.evaluate===true?typeof v.requestId!=='string'||!uuid(v.requestId)||v.requestId!==v.requestId.toLowerCase():v.requestId!==undefined))return fail(400,'invalid_request');
  try{return json(200,await runRagWorkflow({question:(v.question as string).trim(),evaluate:v.evaluate===true,requestId:v.requestId as string|undefined,signal},admission.dependencies));}
  catch(e){const code=(e as {code?:unknown})?.code;return fail(503,['quota','not_admitted','outcome_unknown'].includes(String(code))?String(code):'unavailable');}
 };
}
