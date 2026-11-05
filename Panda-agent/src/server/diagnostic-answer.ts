import {answerVendorDiagnostic,compatibleDiagnosticScope} from '../diagnostics/vendor-answer.ts';
import {fetchVendorDocument} from '../diagnostics/vendor-fetch.ts';
import {vendorCatalog} from '../diagnostics/vendor-catalog.ts';
import {createToolBroker,searchVendorManifest} from '../diagnostics/tool-broker.ts';
import {ChatStoreError} from './chat-store.ts';
import type {ChatActor,ActivityReporter} from './chat-contracts.ts';
import type {createDiagnosticStore,DiagnosticExecution} from './diagnostic-store.ts';
type Store=ReturnType<typeof createDiagnosticStore>;
type Document=Pick<Awaited<ReturnType<typeof fetchVendorDocument>>,'fetchedAt'|'contentHash'|'fragments'>;
const referenceText=(value:Record<string,unknown>|null)=>{
 if(!value||value.state!=='complete'||!Array.isArray(value.references)||value.references.length!==1)return null;
 const ref=value.references[0] as Record<string,unknown>;
 if(ref.title!==vendorCatalog.title||ref.url!==vendorCatalog.sourceUrl||typeof ref.capturedAt!=='string'||!Number.isFinite(Date.parse(ref.capturedAt)))return null;
 return `Unreviewed external reference (not approved board evidence): [${vendorCatalog.title}](${vendorCatalog.sourceUrl}), retrieved ${ref.capturedAt}.`;
};
export function createDiagnosticAnswer(deps:{current:(subject:string,sessionId:string)=>Promise<boolean>;externalEnabled:()=>boolean;fetchDocument?:(catalogId:string,options:{signal?:AbortSignal})=>Promise<Document>}){
 return async(actor:ChatActor,thread:string,requestId:string,execution:DiagnosticExecution,store:Store,request:Request,progress:ActivityReporter,reconcile=false)=>{
  const current=async()=>!!actor.sessionId&&!request.signal.aborted&&await deps.current(actor.subject,actor.sessionId)&&!request.signal.aborted;
  if(!await current())throw new ChatStoreError('unauthenticated');
  progress('reading_sources');const scope=await store.scope(execution.input);
  const result=answerVendorDiagnostic(execution.input,scope);
  let optional:string|null=null;
  if(result.answer.citations.length===0&&scope===null&&compatibleDiagnosticScope(execution.input)){
   if(execution.toolDispatched||reconcile){optional=referenceText(execution.toolResult)??'The optional lookup was not repeated after interruption. You can start a new request.';}
   else if(deps.externalEnabled()){
    let version:number|null=null,claimed=false;
    try{
     const state=await store.toolState();version=state.version;
     if(state.enabled&&state.hash===searchVendorManifest.hash&&await current()&&await store.claimTool(thread,requestId,state.version)){
      claimed=true;progress('searching_sources');
      const broker=createToolBroker({enabled:true,currentGrant:async()=>{if(!await current())return false;const next=await store.toolState();return next.enabled&&next.version===state.version&&next.hash===searchVendorManifest.hash;},invoke:async(_input,signal)=>{
       const fetched=await (deps.fetchDocument??fetchVendorDocument)(vendorCatalog.id,{signal});
       return {references:[{kind:'external',title:vendorCatalog.title,url:vendorCatalog.sourceUrl,capturedAt:fetched.fetchedAt,excerpt:''}]};
      }});
      const found=await broker.search({topic:'gpio',chip:'esp32',frameworkVersion:'5.5.1'},request.signal);
      const saved={state:'complete',references:found.references.map(r=>({title:r.title,url:r.url,capturedAt:r.capturedAt}))};
      await store.recordTool(thread,requestId,state.version,saved);optional=referenceText(saved);
     }
    }catch{
     optional='The optional documentation lookup was unavailable. No automatic retry was made.';
     if(claimed&&version!==null){try{await store.recordTool(thread,requestId,version,{state:'unavailable',references:[]});}catch{/* Completion checks the authoritative outcome and grant. */}}
    }
   }
  }
  if(!await current())throw new ChatStoreError('unauthenticated');progress('checking_citations');
  const introduction=execution.input.screenshotId?'Using your pasted error text. Automatic image reading is unavailable; no text was extracted from the screenshot.\n\n':'';
  result.answer.text=introduction+result.answer.text+(optional?'\n\n'+optional:'');
  return result;
 };
}
