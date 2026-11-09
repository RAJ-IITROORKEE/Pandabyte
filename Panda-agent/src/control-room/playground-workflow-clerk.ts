import 'server-only';
import {auth} from '@clerk/nextjs/server';
import {createInsforgeServerClient} from '@/lib/insforge/server';
import {createInsforgeAdapters} from '../retrieval/insforge-adapters';
import {prepareProductContextSet} from '../retrieval/product-context-set';
import {createPlaygroundWorkflowHandler,type WorkflowAdmission} from './playground-workflow-handler';
import {currentLightweightSession} from '../server/lightweight-connection';
import {readBasicRagProfile} from '../server/basic-rag-profile';
import {createBasicRagPolicy,createLunaTestPolicy} from '../server/basic-rag-runtime';
import {readLunaTestProfile} from '../server/luna-test-profile';
import {createBasicRagPlayground} from '../server/basic-rag-playground';

export async function playgroundWorkflowPOST(request:Request){
 const authenticate=async():Promise<WorkflowAdmission>=>{
  try{
   const session=await auth();if(!session.isAuthenticated||session.sessionStatus!=='active'||!session.userId||!session.sessionId)return {kind:'unauthorized'};
   const subject=session.userId,sessionId=session.sessionId,client=await createInsforgeServerClient();
   const r=await client.database.from('staff_role_memberships').select('role').eq('user_id',subject).limit(1);
   if(r.error||!Array.isArray(r.data))return {kind:'unavailable'};if(r.data.length!==1||r.data[0]?.role!=='ADMIN')return {kind:'forbidden'};
   const current=async()=>{try{const fresh=await auth();if(!fresh.isAuthenticated||fresh.sessionStatus!=='active'||fresh.userId!==subject||fresh.sessionId!==sessionId||!await currentLightweightSession(subject,sessionId))return false;const v=await client.database.from('staff_role_memberships').select('role').eq('user_id',subject).limit(1);return !v.error&&Array.isArray(v.data)&&v.data.length===1&&v.data[0]?.role==='ADMIN'&&await currentLightweightSession(subject,sessionId);}catch{return false;}};
   const requestOrigin=new URL(request.url).origin;
   const luna=process.env.PANDA_AGENT_LUNA_PROFILE_FILE!==undefined;
   const profile=await (luna?readLunaTestProfile:readBasicRagProfile)({env:process.env,subject,requestOrigin});
   const availability=(luna?createLunaTestPolicy:createBasicRagPolicy)({env:process.env,subject,requestOrigin,current});
   return {kind:'admin',subject,dependencies:{authorize:current,
    prepare:(question,signal)=>prepareProductContextSet({actor:{subject},question,client,createAdapters:()=>createInsforgeAdapters(client,async()=>({selections:[]})),authorizeCurrent:current,signal}),
    generationScope:'multiple_products',
    ...(profile?{usagePolicy:luna?'bounded_luna_test' as const:'zero_cost' as const,generate:createBasicRagPlayground({subject,requestOrigin,env:process.env,profile,availability,mode:luna?'luna':'free'})}:{}),
   }};
  }catch{return {kind:'unavailable'};}
 };
 return createPlaygroundWorkflowHandler(authenticate)(request);
}
