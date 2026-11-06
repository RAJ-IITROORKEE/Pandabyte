import {runAgentic,AgenticOutcomeUnknown,type AgenticDependencies} from '../agentic/controller.ts';
import {buildPlan} from '../agentic/plan.ts';
import {type AgenticInput} from '../agentic/contracts.ts';
import {createMcpClient,mcpDocumentId,prepareMcp} from '../agentic/mcp-client.ts';
import {answerWithLightweight} from '../lightweight/evidence.ts';
import {createLightweightClient} from '../lightweight/client.ts';
import {createInsforgeAdapters,listRuntimeProducts} from '../retrieval/insforge-adapters.ts';
import {answerVendorDiagnostic} from '../diagnostics/vendor-answer.ts';
import type {createDiagnosticStore} from './diagnostic-store.ts';
import {agenticResultHash,type CompositeExecution,type createAgenticStore} from './agentic-store.ts';
import type {ChatActor,ActivityReporter} from './chat-contracts.ts';
import type {createLightweightStore} from './lightweight-store.ts';
import {ChatStoreError} from './chat-store.ts';

type Store=ReturnType<typeof createAgenticStore>;
class KnownToolRejection extends Error {}
const terminalToolCodes=new Set(['cancelled','disabled','provider_unavailable','quota_exhausted','busy','invalid_selection','budget_exceeded']);
const contains=(q:string,value:string)=>{const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,'i').test(q);};
export function validAgenticCatalog(input:AgenticInput,catalog:readonly {sku:string;title:string}[]):boolean{
 const selected=new Set(input.products);
 if(input.products.some(s=>!catalog.some(p=>p.sku===s)))return false;
 const aliases=new Map<string,string[]>();
 for(const p of catalog)for(const alias of new Set(p.title.match(/\bx[a-z0-9]{2,}\b/gi)??[])){const key=alias.toLowerCase();aliases.set(key,[...(aliases.get(key)??[]),p.sku]);}
 for(const [alias,owners] of aliases)if(contains(input.question,alias)&&(owners.length!==1||!selected.has(owners[0])))return false;
 return catalog.every(p=>!(contains(input.question,p.sku)||contains(input.question,p.title))||selected.has(p.sku));
}
export function createAgenticAnswer(deps:{current:(subject:string,sessionId:string)=>Promise<boolean>;baseUrl:string;secret:string}){
 return async(actor:ChatActor,thread:string,requestId:string,execution:CompositeExecution,store:Store,canonicalStore:ReturnType<typeof createLightweightStore>,diagnosticStore:ReturnType<typeof createDiagnosticStore>,request:Request,progress:ActivityReporter,reconcile=false)=>{
  const current=async()=>!!actor.sessionId&&!request.signal.aborted&&await deps.current(actor.subject,actor.sessionId)&&!request.signal.aborted;
  if(!await current())throw new ChatStoreError('unauthenticated');
  const catalog=await listRuntimeProducts(actor.client);if(!validAgenticCatalog(execution.input,catalog))throw new ChatStoreError('conflict');
  let fragments=0,units=0;
  const consume=(next:{fragments:number;units:number})=>{fragments+=next.fragments;units+=next.units;if(fragments>8||units>20000)throw new ChatStoreError('unavailable');};
  const evidenceClient=createLightweightClient({...deps,mode:'deterministic-mcu-v1',timeoutMs:30000});
  const mcpClient=createMcpClient({...deps,timeoutMs:12000});
  const canonicalLookup=(statusOnly:boolean):AgenticDependencies['canonical']=>async(need,call,signal)=>{
    progress('reading_sources');if(signal.aborted||!await current())throw new ChatStoreError('unauthenticated');
    if(need.kind==='vendor-gpio'){
     const input={errorText:'ESP32 ESP-IDF 5.5.1 GPIO header',chip:'esp32' as const,framework:'esp-idf' as const,frameworkVersion:'5.5.1' as const};
     const snapshot=await diagnosticStore.scope(input),answer=answerVendorDiagnostic(input,snapshot);
     const count={fragments:snapshot?.fragments.length??0,units:snapshot?.fragments.reduce((n,x)=>n+x.length,0)??0};consume(count);
     return {answer:answer.answer,scope:null,vendorBindings:answer.bindings,contextFragments:count.fragments,contextUnits:count.units};
    }
    if(need.kind!=='mcu'||!need.productSku)throw new ChatStoreError('invalid');
    const question=`Which MCU does ${need.productSku} use?`;
    const adapters=createInsforgeAdapters(actor.client,async()=>{throw Error('Not admitted');});
    const identity=await adapters.resolveIdentity({subject:actor.subject},{question,productSku:need.productSku});
    if(identity.kind!=='resolved')throw new ChatStoreError('conflict');
    const scope=await canonicalStore.scope(identity.product.id);let counts={fragments:0,units:0};
    const checked=await answerWithLightweight({subject:actor.subject,sessionId:actor.sessionId!,turnId:call.id,productSku:scope.sku,question,ragClient:actor.client,mode:'deterministic-mcu-v1',activity:progress,
     observeContext:async next=>{consume(next);counts=next;},
     beforeDispatch:async({requestBodySha256})=>{if(signal.aborted||!await current())throw new ChatStoreError('unauthenticated');if(statusOnly){const original=(await store.execution(thread,requestId))?.calls.find(c=>c.id===call.id);if(!original||original.digest!==requestBodySha256||agenticResultHash(original.scope)!==agenticResultHash(scope))throw new AgenticOutcomeUnknown();}else await store.bind(thread,requestId,execution.planHash,call.id,requestBodySha256,scope,counts);if(signal.aborted)throw new ChatStoreError('unavailable');},
     client:{select:async args=>{if(signal.aborted||!await current()||signal.aborted)throw new ChatStoreError('unavailable');progress('selecting_evidence');return statusOnly?evidenceClient.status({subject:args.subject,sessionId:args.sessionId,turnId:call.id,productSku:scope.sku,requestBodySha256:args.prepared.requestBodySha256,fragments:args.prepared.input.fragments,signal}):evidenceClient.select({...args,signal});}},
    });
    if(checked.wire==='unknown'||(checked.wire&&checked.wire.state!=='complete'&&checked.wire.state!=='rejected'))throw new AgenticOutcomeUnknown();
    if(checked.wire&&checked.wire.state==='rejected'){if(terminalToolCodes.has(checked.wire.code))throw new KnownToolRejection();throw new AgenticOutcomeUnknown();}
    if(checked.outcome.kind!=='evidence'||!checked.wire||checked.wire.state!=='complete'||checked.wire.usage.modelCalls!==0)throw new ChatStoreError('unavailable');
    return {answer:{outcome:'evidence',text:checked.outcome.citations.map(c=>`The captured listing states: “${c.quote}” [${c.id}]`).join('\n\n'),citations:checked.outcome.citations},scope,vendorBindings:[],contextFragments:counts.fragments,contextUnits:counts.units};
  };
  const externalLookup=(statusOnly:boolean):AgenticDependencies['external']=>async(documentId,call,signal)=>{
    if(documentId!==mcpDocumentId||signal.aborted||!await current())throw new ChatStoreError('unavailable');
    const prepared=prepareMcp(call.id,documentId);
    if(statusOnly){const original=(await store.execution(thread,requestId))?.calls.find(c=>c.id===call.id);if(!original||original.digest!==prepared.digest)throw new AgenticOutcomeUnknown();}
    // Only reference metadata reaches this controller; fetched text is not evidence context.
    else await store.bind(thread,requestId,execution.planHash,call.id,prepared.digest,null,{fragments:0,units:0});
    if(signal.aborted||!await current()||signal.aborted)throw new ChatStoreError('unavailable');progress('reading_sources');
    let wire;try{wire=statusOnly?await mcpClient.status({subject:actor.subject,sessionId:actor.sessionId!,turnId:call.id,requestBodySha256:prepared.digest,signal}):await mcpClient.run({subject:actor.subject,sessionId:actor.sessionId!,prepared,signal});}catch{throw new AgenticOutcomeUnknown();}
    if(wire.state==='pending'||wire.state==='unknown')throw new AgenticOutcomeUnknown();
    if(wire.state==='rejected'){if(terminalToolCodes.has(wire.code))throw new KnownToolRejection();throw new AgenticOutcomeUnknown();}
    if(wire.state!=='complete'||signal.aborted||!await current())throw new ChatStoreError('unavailable');
    return {reference:{title:'GPIO & RTC GPIO',url:wire.document.url,capturedAt:wire.document.fetchedAt},toolResultHash:agenticResultHash(wire.document)};
  };
  const result=await runAgentic({input:execution.input,turnId:requestId,deadlineAt:execution.deadlineAt,signal:request.signal},{
   activity:card=>progress('reading_sources',undefined,card),
   current:async()=>!execution.cancelled&&await current(),
   grants:async()=>{const g=await store.grants(execution.input.skillId);if(g.skill.id!==execution.skill.id||g.skill.bundleVersion!==execution.skill.bundleVersion||g.skill.hash!==execution.skill.hash||g.skill.epoch!==execution.skill.epoch||execution.toolGrants.some(t=>!g.tools.some(now=>now.id===t.id&&now.hash===t.hash&&now.epoch===t.epoch&&now.enabled===t.enabled)))throw new ChatStoreError('conflict');return g;},
   reserve:async(call,signal)=>{
    if(!reconcile)return store.reserve(thread,requestId,execution.planHash,call);
    const latest=await store.execution(thread,requestId),cached=latest?.calls.find(c=>c.id===call.id&&c.inputHash===call.inputHash&&c.needId===call.needId&&c.toolId===call.toolId);
    if(cached?.state==='complete')return 'recorded';if(!cached?.digest)return 'unknown';
    const planned=buildPlan(execution.input);if(planned.kind!=='planned')throw new AgenticOutcomeUnknown();const need=planned.plan.needs.find(n=>n.id===call.needId);if(!need)throw new AgenticOutcomeUnknown();
    try{
     const recovered=need.kind==='mcu'?await canonicalLookup(true)(need,call,signal):need.kind==='external-gpio'?await externalLookup(true)(need.documentId!,call,signal):null;
     if(recovered===null)return 'unknown';if(signal.aborted)throw new AgenticOutcomeUnknown();
     await store.record(thread,requestId,execution.planHash,call.id,recovered);return 'recorded';
    }catch(e){if(e instanceof KnownToolRejection)throw e;throw new AgenticOutcomeUnknown();}
   },
   record:(call,value)=>store.record(thread,requestId,execution.planHash,call.id,value),
   readRecorded:async call=>{const latest=await store.execution(thread,requestId);const c=latest?.calls.find(x=>x.id===call.id&&x.inputHash===call.inputHash&&x.toolId===call.toolId&&x.needId===call.needId);return c?.state==='complete'&&c.resultHash===agenticResultHash(c.result)?c.result:null;},
   canonical:canonicalLookup(false),external:externalLookup(false),
  });
  if(!await current())throw new ChatStoreError('unauthenticated');
  if(result.planHash!==execution.planHash)throw new ChatStoreError('conflict');
  return result;
 };
}
