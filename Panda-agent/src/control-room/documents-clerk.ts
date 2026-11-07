import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createInsforgeServerClient } from '@/lib/insforge/server';
import { createDocumentsHandlers } from './documents';

const handlers=createDocumentsHandlers(async()=>{
 try {
  const session=await auth();if(!session.isAuthenticated||session.sessionStatus!=='active'||!session.userId)return {kind:'unauthorized'};
  const client=await createInsforgeServerClient();const {data,error}=await client.database.from('staff_role_memberships').select('role').eq('user_id',session.userId).limit(1);
  if(error||!Array.isArray(data))return {kind:'unavailable'};
  if(data.length!==1||data[0]?.role!=='ADMIN')return {kind:'forbidden'};
  return {kind:'admin',subject:session.userId,client};
 }catch{return {kind:'unavailable'};}
},()=>process.env.PANDA_AGENT_DOCUMENT_INGESTION_ENABLED==='true');
export const documentsGET=handlers.GET;
export const documentsPOST=handlers.POST;

export const documentGET=async(request:Request,context:{params:Promise<{reference:string}>})=>handlers.DETAIL(request,(await context.params).reference);


export const documentStatusGET=async(request:Request,context:{params:Promise<{reference:string}>})=>handlers.STATUS(request,(await context.params).reference);


export const documentWithdrawPOST=async(request:Request,context:{params:Promise<{reference:string}>})=>handlers.WITHDRAW(request,(await context.params).reference);


export const documentSearchPOST=async(request:Request,context:{params:Promise<{reference:string}>})=>handlers.SEARCH(request,(await context.params).reference);
