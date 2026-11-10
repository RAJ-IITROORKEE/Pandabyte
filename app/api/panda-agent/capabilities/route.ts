import { authenticateLightweight } from '@/Panda-agent/src/server/lightweight-connection';
import { directPolicyForActor } from '@/Panda-agent/src/server/direct-assistant-runtime';
import { createDirectAssistantStore } from '@/Panda-agent/src/server/direct-assistant-store';
import { modelChoices, disabledModelReasons, type Capabilities } from '@/Panda-agent/src/ui/capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control':'private, no-store', Vary:'Cookie' };
  const actor = await authenticateLightweight();
  if (!actor) return Response.json({ error:'unauthenticated' }, { status:401, headers });
  const value:Capabilities = { mode:'direct_assistant', model:null, status:'unavailable', models:modelChoices.map((model,index)=>({...model,enabled:false,reason:disabledModelReasons[index]})), reason:'disabled', rag:false, tools:[], skills:[], budget:null };
  if (process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === 'true' && process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED === 'true') {
    value.reason = 'privacy_or_budget_unavailable';
    try {
      const policy = directPolicyForActor(actor,request);
      const [admitted,installed] = await Promise.all([policy.enabled(),createDirectAssistantStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '').ready()]);
      const remaining = policy.allowance()?.remainingNanoUsd;
      const unmetered='isUnmetered' in policy && typeof policy.isUnmetered==='function' && policy.isUnmetered();
      if (admitted && installed && (unmetered || Number.isSafeInteger(remaining) && remaining! >= 1597640 && remaining! <= 1000000000)) {
        value.status='ready'; value.reason=null; value.model='GPT-6 Luna'; value.models[0]={...value.models[0],enabled:true,reason:null};
        value.budget=unmetered?null:{limitNanoUsd:1000000000,remainingNanoUsd:remaining!};
        value.rag=process.env.PANDA_AGENT_MAIN_RAG_ENABLED==='true';
      }
    } catch { value.reason='connection_unavailable'; }
  }
  return Response.json(value,{headers});
}
