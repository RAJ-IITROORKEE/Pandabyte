import 'server-only';
import {authenticateLightweight,currentLightweightSession} from './lightweight-connection';
export async function guideAdminAccess():Promise<{allowed:true}|{allowed:false;status:401|403|503}>{
 try{
  const actor=await authenticateLightweight();if(!actor?.sessionId||!await currentLightweightSession(actor.subject,actor.sessionId))return {allowed:false,status:401};
  const {data,error}=await actor.client.database.from('staff_role_memberships').select('role').eq('user_id',actor.subject).limit(1);
  if(error||!Array.isArray(data))return {allowed:false,status:503};
  if(data.length!==1||data[0]?.role!=='ADMIN')return {allowed:false,status:403};
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return {allowed:false,status:401};
  return {allowed:true};
 }catch{return {allowed:false,status:503};}
}
