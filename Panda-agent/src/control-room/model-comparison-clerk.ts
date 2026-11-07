import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createInsforgeServerClient } from '@/lib/insforge/server';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters';
import { createModelComparisonHandlers, prepareProductComparisonContext } from './model-comparison';
import { resolveBranchPlaygroundConfiguration as resolvePlaygroundConfiguration, localPlaygroundOwner } from './playground-configuration';
import { runPlaygroundPOST } from './playground-clerk';
import {isPlaygroundUsage} from './playground-usage';

function handlers(request?:Request) {
 return createModelComparisonHandlers({
  authorize:async()=>{
   try{
    const session=await auth();if(!session.isAuthenticated||session.sessionStatus!=='active'||!session.userId)return {kind:'unauthorized'};
    const client=await createInsforgeServerClient();const r=await client.database.from('staff_role_memberships').select('role').eq('user_id',session.userId).limit(1);
    if(r.error||!Array.isArray(r.data))return {kind:'unavailable'};
    if(r.data.length!==1||r.data[0]?.role!=='ADMIN')return {kind:'forbidden'};
    return {kind:'admin',subject:session.userId,adapters:createInsforgeAdapters(client,async()=>({selections:[]}))};
   }catch{return {kind:'unavailable'};}
  },
  configuredModels:async()=>{
   const connection=await resolvePlaygroundConfiguration();
   if(connection?.profile!=='product-playground-v1')return [];
   if(connection.transport==='local'){
    const session=await auth();if(!session.userId||!localPlaygroundOwner(connection.config,session.userId)||!request||new URL(request.url).origin!=='http://localhost:3000')return [];
   }
   // Additional catalog models require their own reviewed guard/model-price policy.
   return ['openai/gpt-4o-mini'];
  },
  prepare:prepareProductComparisonContext,
  evaluate:async(input,beforeSend,signal)=>{
   if(!request||input.model!=='openai/gpt-4o-mini'||!await beforeSend())throw Object.assign(Error('Not admitted'),{code:'not_admitted'});
   const nested=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({question:input.question,evaluate:true,requestId:input.requestId}),signal});
   const response=await runPlaygroundPOST(nested,input.context.digest,input.context.provenanceDigest);
   const result=await response.json();
   if(!response.ok){const code=result?.error?.code;throw Object.assign(Error('Comparison unavailable'),{code:code==='quota'?'quota':code==='not_admitted'||[400,401,403,413,415].includes(response.status)?'not_admitted':'outcome_unknown'});}
   if(result?.model?.status!=='evaluated')throw Object.assign(Error('No model response'),{code:'not_admitted'});
   const m=result.metrics,usage=m?{inputTokens:m.inputTokens,outputTokens:m.outputTokens,costNanoUsd:typeof m.costUsd==='number'?Math.round(m.costUsd*1e9):null}:null;
   return {evaluation:{answer:result.model.answer,evidence:result.model.evidence},usage:isPlaygroundUsage(usage)?usage:null};
  },
 });
}
export const modelComparisonsGET=(request:Request)=>handlers(request).GET();
export const modelComparisonsPOST=(request:Request)=>handlers(request).POST(request);
