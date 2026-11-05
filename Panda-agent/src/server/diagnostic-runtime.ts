import 'server-only';
import {authenticateLightweight,currentLightweightSession} from './lightweight-connection';
import {createDiagnosticStore} from './diagnostic-store';
import {createDiagnosticImageHandlers} from './diagnostic-images';
import {createDocumentationHandler} from './documentation-api';
import {createImageClient} from '../diagnostics/image-client';
import type {ChatActor} from './chat-contracts';
import {ChatStoreError} from './chat-store';

const current=(actor:ChatActor)=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false);
const store=(actor:ChatActor)=>createDiagnosticStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'');

export const diagnosticImageHandlers=createDiagnosticImageHandlers({
 enabled:()=>process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED==='true'&&process.env.PANDA_AGENT_DIAGNOSTICS_ENABLED==='true'&&process.env.PANDA_AGENT_IMAGES_ENABLED==='true',
 authenticate:authenticateLightweight,current,store,
 client:()=>createImageClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??''}),
});

export const documentationHandler=createDocumentationHandler({
 authenticate:authenticateLightweight,current,store,
 canAdmin:async actor=>{
  const {data,error}=await actor.client.database.from('staff_role_memberships').select('role').eq('user_id',actor.subject).limit(1);
  if(error||!Array.isArray(data)||data.length>1||data.some(row=>!row||typeof row.role!=='string'))throw new ChatStoreError('unavailable');
  return data.length===1&&data[0].role==='ADMIN';
 },
});
