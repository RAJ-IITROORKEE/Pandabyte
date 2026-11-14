import { authenticateLightweight } from '@/Panda-agent/src/server/lightweight-connection';
import { directPolicyForActor } from '@/Panda-agent/src/server/direct-assistant-runtime';
import { createDirectAssistantStore } from '@/Panda-agent/src/server/direct-assistant-store';
import { modelChoices, disabledModelReasons, hostedModelChoices, hostedDisabledModelReasons, type Capabilities } from '@/Panda-agent/src/ui/capabilities';
import { fastHostedModel, freePoolModel, hostedDirectModelIds, hostedModelSelection, loopModelAllowed } from '@/Panda-agent/src/hosted-model';
import { parseModelRows } from '@/Panda-agent/src/models/registry';
import { MAX_EXTRA_MODELS } from '@/Panda-agent/src/ui/capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control':'private, no-store', Vary:'Cookie' };
  const actor = await authenticateLightweight();
  if (!actor) return Response.json({ error:'unauthenticated' }, { status:401, headers });
  const selected = process.env.VERCEL === '1' ? hostedModelSelection({ PANDA_AGENT_HOSTED_MODEL: process.env.PANDA_AGENT_HOSTED_MODEL }) : { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna' } as const;
  const hosted = selected?.id === fastHostedModel.id;
  const choices = hosted ? hostedModelChoices : modelChoices, reasons = hosted ? hostedDisabledModelReasons : disabledModelReasons;
  const value:Capabilities = { mode:'direct_assistant', model:null, status:'unavailable', models:choices.map((model,index)=>({...model,enabled:false,reason:reasons[index]})), reason:'disabled', rag:false, tools:[], skills:[], budget:null };
  if (process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === 'true' && process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED === 'true') {
    value.reason = 'privacy_or_budget_unavailable';
    try {
      const policy = directPolicyForActor(actor,request);
      const [admitted,installed] = await Promise.all([policy.enabled(),createDirectAssistantStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '').ready()]);
      const remaining = policy.allowance()?.remainingNanoUsd;
      const unmetered='isUnmetered' in policy && typeof policy.isUnmetered==='function' && policy.isUnmetered();
      if (selected && admitted && installed && (!hosted || unmetered) && (unmetered || Number.isSafeInteger(remaining) && remaining! >= 1597640 && remaining! <= 1000000000)) {
        value.status='ready'; value.reason=null; value.model=selected.label;
        const nonAdmin='isAdmin' in policy && typeof policy.isAdmin==='function' && policy.isAdmin()===false;
        value.models=value.models.map(model => (model.id === selected.id || (hosted && hostedDirectModelIds.includes(model.id))) && !(nonAdmin && !loopModelAllowed(model.id)) ? {...model,enabled:true,reason:null} : model);
        value.budget=unmetered?null:{limitNanoUsd:1000000000,remainingNanoUsd:remaining!};
        // Model registry (agent loop): Admin-disabled built-ins turn off; Admin-added paid models and the free pool follow the list.
        if (hosted && process.env.PANDA_AGENT_LOOP_ENABLED==='true') {
          try {
            const { data, error } = await actor.client.database.rpc('panda_agent_models_catalog');
            if (!error) {
              const rows = parseModelRows(data), on = new Set(rows.filter(r => r.enabled).map(r => r.id));
              value.models = value.models.map((model,index) => model.enabled && hostedDirectModelIds.includes(model.id) && !on.has(model.id) ? {...model,enabled:false,reason:reasons[index]} : model);
              const added = rows.filter(r => r.enabled && !r.builtin && r.profile), free = added.filter(r => r.tier==='free');
              value.models = [...value.models,
                ...(free.length ? [{ id:freePoolModel.id, label:`${freePoolModel.label} (${free.length})`, enabled:true, reason:null, tier:'free' as const, privacy:'logged' as const }] : []),
                ...added.filter(r => r.tier==='paid').slice(0,MAX_EXTRA_MODELS-1).map(r => ({ id:r.id, label:r.label.slice(0,60), enabled:true, reason:null, tier:'paid' as const, privacy:r.profile!.privacy }))];
            }
          } catch { /* Registry unreadable: the built-in list stands. */ }
        }
        value.rag=process.env.PANDA_AGENT_MAIN_RAG_ENABLED==='true';
      }
    } catch { value.reason='connection_unavailable'; }
  }
  return Response.json(value,{headers});
}
