import 'server-only';
import {auth} from '@clerk/nextjs/server';
import {createInsforgeServerClient} from '@/lib/insforge/server';
import {createInsforgeAdapters} from '../retrieval/insforge-adapters';
import {prepareProductContextSet} from '../retrieval/product-context-set';
import {createPlaygroundWorkflowHandler,type WorkflowAdmission} from './playground-workflow-handler';
import {resolveBranchPlaygroundConfiguration as resolvePlaygroundConfiguration} from './playground-configuration';
import {runPlaygroundPOST} from './playground-clerk';
import {isPlaygroundUsage} from './playground-usage';

export async function playgroundWorkflowPOST(request:Request){
 const authenticate=async():Promise<WorkflowAdmission>=>{
  try{
   const session=await auth();if(!session.isAuthenticated||session.sessionStatus!=='active'||!session.userId)return {kind:'unauthorized'};
   const subject=session.userId,client=await createInsforgeServerClient();
   const r=await client.database.from('staff_role_memberships').select('role').eq('user_id',subject).limit(1);
   if(r.error||!Array.isArray(r.data))return {kind:'unavailable'};if(r.data.length!==1||r.data[0]?.role!=='ADMIN')return {kind:'forbidden'};
   const current=async()=>{try{const fresh=await auth();if(!fresh.isAuthenticated||fresh.sessionStatus!=='active'||fresh.userId!==subject)return false;const c=await createInsforgeServerClient(),v=await c.database.from('staff_role_memberships').select('role').eq('user_id',subject).limit(1);return !v.error&&Array.isArray(v.data)&&v.data.length===1&&v.data[0]?.role==='ADMIN';}catch{return false;}};
   const connection=await resolvePlaygroundConfiguration();
   return {kind:'admin',subject,dependencies:{authorize:current,
    prepare:(question,signal)=>prepareProductContextSet({actor:{subject},question,client,createAdapters:()=>createInsforgeAdapters(client,async()=>({selections:[]})),authorizeCurrent:current,signal}),
    generationScope:'single_product',
    ...(connection?{generate:async(input,beforeSend,signal)=>{
     if(!input.context.legacyBinding||!await beforeSend())throw Object.assign(Error('Not admitted'),{code:'not_admitted'});
     const nested=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({question:input.question,evaluate:true,requestId:input.requestId}),signal});
     const response=await runPlaygroundPOST(nested,input.context.legacyBinding.textDigest,input.context.legacyBinding.provenanceDigest);
     const value=await response.json();if(!response.ok)throw Object.assign(Error('Model unavailable'),{code:['quota','not_admitted','outcome_unknown'].includes(value?.error?.code)?value.error.code:'outcome_unknown'});
     if(value?.model?.status!=='evaluated')throw Object.assign(Error('Model not admitted'),{code:'not_admitted'});
     const m=value.metrics,usage=m?{inputTokens:m.inputTokens,outputTokens:m.outputTokens,costNanoUsd:typeof m.costUsd==='number'?Math.round(m.costUsd*1e9):null}:null;
     return {evaluation:{answer:value.model.answer,evidence:value.model.evidence},usage:isPlaygroundUsage(usage)?usage:undefined};
    }}:{}),
   }};
  }catch{return {kind:'unavailable'};}
 };
 return createPlaygroundWorkflowHandler(authenticate)(request);
}
