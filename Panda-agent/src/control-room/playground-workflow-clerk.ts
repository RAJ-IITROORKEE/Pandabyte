import 'server-only';
import {auth} from '@clerk/nextjs/server';
import {createInsforgeAdapters} from '../retrieval/insforge-adapters';
import {createWorkflowProductContextPreparer} from '../retrieval/product-context-set';
import {createPlaygroundWorkflowHandler,readWorkflowBody,type WorkflowAdmission} from './playground-workflow-handler';
import {snapshotRetrievalAdmission} from './snapshot-retrieval-clerk';
import {authenticateLightweight,currentLightweightSession} from '../server/lightweight-connection';
import {readBasicRagProfile} from '../server/basic-rag-profile';
import {createBasicRagPolicy,createLunaTestPolicy,createLunaPrototypePolicy} from '../server/basic-rag-runtime';
import {readLunaPrototypeProfile} from '../server/luna-prototype-profile';
import {readLunaTestProfile} from '../server/luna-test-profile';
import {createBasicRagPlayground} from '../server/basic-rag-playground';
import {createHostedRagPolicy} from '../server/hosted-rag-policy';
import {createHostedRagPlayground} from '../server/hosted-rag-playground';

type WorkflowContext = Exclude<WorkflowAdmission,{kind:'admin'}> | (Extract<WorkflowAdmission,{kind:'admin'}> & {client:NonNullable<Awaited<ReturnType<typeof authenticateLightweight>>>['client']});

export async function authenticateRagWorkflow(request:Request):Promise<WorkflowContext>{
  try{
   const actor=await authenticateLightweight({admin:true});if(!actor)return {kind:'unauthorized'};
   const {subject,sessionId,client}=actor;
   if(!('admin' in actor)||actor.admin!==true)return {kind:'forbidden'};
   const admittedSessionCurrent=async()=>{try{
    const fresh=await auth();
    return !!fresh.isAuthenticated&&fresh.sessionStatus==='active'&&fresh.userId===subject&&fresh.sessionId===sessionId;
   }catch{return false;}};
   const current=async()=>{try{
    if(!await admittedSessionCurrent())return false;
    // Fresh role and session reads per check; source preparation and release each call this independently.
    const [active,v]=await Promise.all([currentLightweightSession(subject,sessionId),client.database.from('staff_role_memberships').select('role').eq('user_id',subject).limit(1)]);
    return active&&!v.error&&Array.isArray(v.data)&&v.data.length===1&&v.data[0]?.role==='ADMIN';
   }catch{return false;}};
   const requestOrigin=new URL(request.url).origin;
   const hosted=process.env.PANDA_AGENT_HOSTED_GROUNDED_ENABLED==='true';
   const hostedPolicy=hosted?createHostedRagPolicy({env:process.env,subject,requestOrigin,actor:{subject,sessionId,client},current}):null;
   const prototype=process.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE!==undefined;
   const luna=prototype||process.env.PANDA_AGENT_LUNA_PROFILE_FILE!==undefined;
   const availability=prototype?createLunaPrototypePolicy({env:process.env,subject,requestOrigin,current,actor:{subject,sessionId,client}}):(luna?createLunaTestPolicy:createBasicRagPolicy)({env:process.env,subject,requestOrigin,current});
   return {kind:'admin',subject,client,dependencies:{authorize:current,
    prepare:createWorkflowProductContextPreparer({actor:{subject},client,createAdapters:()=>createInsforgeAdapters(client,async()=>({selections:[]})),authorizeCurrent:current}),
    // Document-only reads reuse this request's admitted Admin context. Source freshness remains independently checked.
    retrieval:{authorize:admittedSessionCurrent,
     prepare:createWorkflowProductContextPreparer({actor:{subject},client,createAdapters:()=>createInsforgeAdapters(client,async()=>({selections:[]})),authorizeCurrent:admittedSessionCurrent})},
    generationScope:'multiple_products',
    usagePolicy:hosted||luna?'bounded_luna_test' as const:'zero_cost' as const,
    generate:async(input,beforeSend,signal)=>{
     if(hostedPolicy)return createHostedRagPlayground(hostedPolicy)(input,beforeSend,signal);
     const profile=await (prototype?readLunaPrototypeProfile:luna?readLunaTestProfile:readBasicRagProfile)({env:process.env,subject,requestOrigin});
     if(!profile)throw Object.assign(Error('Model unavailable'),{code:'not_admitted'});
     return createBasicRagPlayground({subject,requestOrigin,env:process.env,profile,availability,mode:prototype?'prototype':luna?'luna':'free'})(input,beforeSend,signal);
    },
   }};
  }catch{return {kind:'unavailable'};}
}
export async function playgroundWorkflowPOST(request:Request){
 const started=performance.now();
 const fail=(status:number,code:string)=>Response.json({error:{code}},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST')return fail(405,'method_not_allowed');
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail(403,'forbidden');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return fail(415,'unsupported_media_type');
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
 let value:unknown;
 try{value=await readWorkflowBody(request,signal);}catch(error){return fail(signal.aborted?503:(error as Error).message==='too_large'?413:400,signal.aborted?'unavailable':'invalid_request');}
 const evaluate=!!value&&typeof value==='object'&&!Array.isArray(value)&&(value as {evaluate?:unknown}).evaluate===true;
 const parsed=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(value),signal});
 const timing={databaseSnapshotMs:null as number|null};
 const response=await createPlaygroundWorkflowHandler(evaluate?()=>authenticateRagWorkflow(request):()=>snapshotRetrievalAdmission(timing))(parsed);
 if(!response.ok)return response;
 const result=await response.json();
 return Response.json({...result,metrics:{...result.metrics,elapsedMs:Math.round(performance.now()-started),...(!evaluate?timing:{})}},
  {headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
