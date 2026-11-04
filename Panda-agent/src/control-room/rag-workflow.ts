import {Annotation,END,START,StateGraph} from '@langchain/langgraph';
import {Document} from '@langchain/core/documents';
import {CallbackManager} from '@langchain/core/callbacks/manager';
import {getCurrentRunTree} from 'langsmith/singletons/traceable';
import type {ReadyProductContext} from '../retrieval/product-context-set.ts';
import {lexicalOverlap,validatePlaygroundEvaluation} from './playground-evaluation.ts';
import {isPlaygroundUsage} from './playground-usage.ts';

export type WorkflowStage='authorize'|'retrieve'|'augment'|'generate'|'validate'|'release';
type Prepared=ReadyProductContext|{kind:'clarification'|'insufficient'|'unavailable'};
export type RagWorkflowDependencies={
 authorize:()=>Promise<boolean>;
 prepare:(question:string,signal:AbortSignal)=>Promise<Prepared>;
 generate?:(input:{question:string;requestId:string;context:ReadyProductContext;documents:Document[]},beforeSend:()=>Promise<boolean>,signal:AbortSignal)=>Promise<{evaluation:unknown;usage?:unknown}>;
 generationScope?:'single_product'|'multiple_products';
};
type Model={status:'not_requested'|'guard_unavailable'}|{status:'not_run';reason:'multi_product_guard_unavailable'|'no_retrieved_context'}|{status:'evaluated';answer:string;evidence:{rank:number;quote:string;reason:string}[]};

/** Request-scoped graph. Private passages/functions stay in closures, never graph state or checkpoints. */
export async function runRagWorkflow(input:{question:string;evaluate:boolean;requestId?:string;signal:AbortSignal},deps:RagWorkflowDependencies){
 const privateCallbacks=()=>{
  const enabled=(v:string|undefined)=>v!==undefined&&v!==''&&!['false','0'].includes(v.toLowerCase());
  if(['LANGSMITH_TRACING','LANGSMITH_TRACING_V2','LANGCHAIN_TRACING','LANGCHAIN_TRACING_V2','LANGCHAIN_VERBOSE'].some(k=>enabled(process.env[k])))throw Error('Workflow observability unavailable');
  const parent=getCurrentRunTree(true);if(parent&&parent.tracingEnabled!==false)throw Error('Workflow observability unavailable');
  if(CallbackManager.configure([],[],undefined,undefined,undefined,undefined,{verbose:false})?.handlers.length)throw Error('Workflow observability unavailable');
 };
 privateCallbacks();
 const started=performance.now(),workflow:{stage:WorkflowStage;status:'completed'|'skipped';elapsedMs:number}[]=[];
 let context:ReadyProductContext|undefined,documents:Document[]=[],outcome:'retrieved'|'clarification'|'insufficient'='insufficient';
 let model:Model=input.evaluate?{status:'not_run',reason:'no_retrieved_context'}:{status:'not_requested'};
 let raw:{evaluation:unknown;usage?:unknown}|undefined,attempted=false;
 const current=async()=>!input.signal.aborted&&await deps.authorize()===true&&(!context||await context.revalidate())&&!input.signal.aborted;
 const node=(stage:WorkflowStage,work:()=>Promise<'completed'|'skipped'|void>)=>async()=>{
  input.signal.throwIfAborted();privateCallbacks();const at=performance.now();const status=await work();input.signal.throwIfAborted();
  workflow.push({stage,status:status??'completed',elapsedMs:Math.round(performance.now()-at)});return {step:workflow.length};
 };
 const state=Annotation.Root({step:Annotation<number>});
 const graph=new StateGraph(state)
  .addNode('authorize',node('authorize',async()=>{if(!await current())throw Error('Workflow unavailable');}))
  .addNode('retrieve',node('retrieve',async()=>{const value=await deps.prepare(input.question,input.signal);if(value.kind==='unavailable')throw Error('Workflow unavailable');if(value.kind==='ready'){context=value;outcome='retrieved';}else outcome=value.kind;}))
  .addNode('augment',node('augment',async()=>{if(!context)throw Error('Workflow unavailable');documents=context.passages.map(p=>new Document({pageContent:p.text,metadata:{rank:p.rank,productSku:p.productSku,productTitle:p.productTitle,title:p.title,sourceUrl:p.sourceUrl,capturedAt:p.capturedAt,sectionPath:[...p.sectionPath]}}));}))
  .addNode('generate',node('generate',async()=>{
   if(!input.evaluate)return 'skipped';
   if(context!.products.length>1&&deps.generationScope!=='multiple_products'){model={status:'not_run',reason:'multi_product_guard_unavailable'};return 'skipped';}
   if(!deps.generate){model={status:'guard_unavailable'};return 'skipped';}
   if(attempted||!input.requestId||!await current())throw Error('Workflow unavailable');
   attempted=true;raw=await deps.generate({question:input.question,requestId:input.requestId,context:context!,documents},current,input.signal);
  }))
  .addNode('validate',node('validate',async()=>{
   if(!raw)return 'skipped';
   const checked=validatePlaygroundEvaluation(raw.evaluation,context!.passages.map(p=>({handle:String(p.rank),text:p.text})));
   if(!checked)throw Object.assign(Error('Model outcome unknown'),{code:'outcome_unknown'});
   model={status:'evaluated',answer:checked.answer,evidence:checked.evidence};if(!checked.evidence.length)outcome='insufficient';
  }))
  .addNode('release',node('release',async()=>{if(!await current())throw Error('Workflow unavailable');}))
  .addEdge(START,'authorize').addEdge('authorize','retrieve')
  .addConditionalEdges('retrieve',()=>context?'context':'empty',{context:'augment',empty:'release'})
  .addEdge('augment','generate').addEdge('generate','validate').addEdge('validate','release').addEdge('release',END).compile();
 // No traceable wrapper: it can construct a client even with tracingEnabled:false in the pinned SDK.
 await graph.invoke({step:0},{callbacks:[],recursionLimit:12,signal:input.signal});
 // Release is the final source/Admin check; subsequent formatting performs no external I/O.
 input.signal.throwIfAborted();
 const finalModel=model as Model;
 const usage=finalModel.status==='evaluated'&&isPlaygroundUsage(raw?.usage)?raw!.usage:null;
 const passages=context?.passages.map(p=>({...p,sectionPath:[...p.sectionPath],lexicalOverlap:lexicalOverlap(input.question,p.text)}))??[];
 return {outcome,passages,products:context?.products.map(p=>({sku:p.sku,title:p.title}))??[],retrieval:'lexical' as const,relevance:'unverified' as const,model:finalModel,
  metrics:{elapsedMs:Math.round(performance.now()-started),contextPassages:passages.length,contextCharacters:passages.reduce((n,p)=>n+[...p.text].length,0),inputTokens:usage?.inputTokens??null,outputTokens:usage?.outputTokens??null,costUsd:usage?usage.costNanoUsd/1e9:null},workflow};
}
