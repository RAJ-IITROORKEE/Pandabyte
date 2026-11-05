import {answerGuide} from '../guide/answer.ts';
import {createGuideClient} from '../guide/client.ts';
import {resolveGuideProduct} from '../guide/catalog.ts';
import type {ChatActor,ChatAnswer,ActivityReporter} from './chat-contracts.ts';
import {ChatStoreError} from './chat-store.ts';
import type {createGuideStore,GuideExecution} from './guide-store.ts';
export function createGuideAnswer(deps:{current:(subject:string,sessionId:string)=>Promise<boolean>;baseUrl:string;secret:string}){
 return async(actor:ChatActor,thread:string,requestId:string,execution:GuideExecution,store:ReturnType<typeof createGuideStore>,request:Request,progress:ActivityReporter,reconcile=false):Promise<ChatAnswer & {guideSucceeded:boolean}>=>{
  if(!actor.sessionId||request.signal.aborted)throw new ChatStoreError('unavailable');
  if(reconcile&&(!execution.prepared||!execution.productId||!execution.productSku||!execution.digest))throw new ChatStoreError('unavailable');
  const identityChanged={outcome:'insufficient' as const,text:'This guide ended because its board identity changed. Start a new run.',citations:[],guideSucceeded:false};
  const identity=await resolveGuideProduct(actor.client,execution.input.board);
  if(identity.kind!=='resolved'){if(reconcile)return identityChanged;return {outcome:identity.kind,text:identity.kind==='conflict'?'The board identities conflict. Choose one exact model.':'Choose one exact PandaByte board model or SKU for this guide.',citations:[],guideSucceeded:false};}
  if(reconcile&&(execution.productId!==identity.product.id||execution.productSku!==identity.product.sku))return identityChanged;
  let scopeHash:string|null=null;
  try{const {data,error}=await actor.client.database.rpc('panda_agent_lightweight_scope',{p_product:identity.product.id});if(!error&&data&&typeof data.scopeHash==='string'&&/^[a-f0-9]{64}$/.test(data.scopeHash))scopeHash=data.scopeHash;}catch{}
  if(reconcile&&execution.scopeHash!==scopeHash)return {outcome:'insufficient',text:'This guide is unavailable because its evidence changed. Start a new run.',citations:[],guideSucceeded:false};
  const client=createGuideClient({baseUrl:deps.baseUrl,secret:deps.secret});let execute=false,preparationConflict=false;
  const result=await answerGuide({subject:actor.subject,sessionId:actor.sessionId,threadId:thread,turnId:requestId,productId:identity.product.id,productSku:identity.product.sku,scopeHash,skill:execution.skill,input:execution.input,ragClient:actor.client,current:()=>deps.current(actor.subject,actor.sessionId!),signal:request.signal,activity:progress,
   beforeDispatch:async metadata=>{if(request.signal.aborted||!await deps.current(actor.subject,actor.sessionId!))throw new ChatStoreError('unauthenticated');if(reconcile){if(metadata.requestBodySha256!==execution.digest)throw new ChatStoreError('unavailable');}else {try{execute=await store.prepare(thread,requestId,metadata,metadata.requestBodySha256);}catch(e){if(e instanceof ChatStoreError&&e.code==='conflict')preparationConflict=true;throw e;}}},
   client:{run:async args=>execute?client.run(args):client.status({subject:args.subject,sessionId:args.sessionId,threadId:thread,turnId:requestId,productSku:args.prepared.input.productSku,requestBodySha256:args.prepared.requestBodySha256,fragments:args.prepared.input.fragments,signal:request.signal})}});
  if(result.kind==='complete')return {outcome:result.citations.length?'evidence':'insufficient',text:result.text,citations:result.citations,guideSucceeded:true};
  if(preparationConflict)return {outcome:'insufficient',text:'This guide could not start because its project, skill or evidence changed. Start a new run.',citations:[],guideSucceeded:false};
  if(result.wire&&result.wire!=='unknown'&&result.wire.state==='complete')return {outcome:'insufficient',text:'This guide is unavailable because its evidence could not be revalidated. Start a new run.',citations:[],guideSucceeded:false};
  if(result.wire&&result.wire!=='unknown'&&result.wire.state==='rejected'&&['disabled','provider_unavailable','quota_exhausted','busy','invalid_selection','budget_exceeded','cancelled'].includes(result.wire.code))return {outcome:'insufficient',text:'The guide service could not complete this run. No automatic retry was made.',citations:[],guideSucceeded:false};
  throw new ChatStoreError('unavailable');
 };
}
