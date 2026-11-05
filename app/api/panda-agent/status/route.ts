import { authenticateLightweight, currentLightweightSession } from '@/Panda-agent/src/server/lightweight-connection';
import { lightweightReady } from '@/Panda-agent/src/server/lightweight-ready';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET() {
  const headers={'cache-control':'private, no-store'};
  try {
    const actor=await authenticateLightweight();
    if(!actor || !await currentLightweightSession(actor.subject,actor.sessionId))return Response.json({status:'unauthenticated'},{status:401,headers});
    if(process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED!=='true')return Response.json({status:'disabled'},{headers});
    const ready=await lightweightReady();
    return Response.json({status:ready?'ready':'unavailable'},{status:ready?200:503,headers});
  }catch{return Response.json({status:'unavailable'},{status:503,headers});}
}
