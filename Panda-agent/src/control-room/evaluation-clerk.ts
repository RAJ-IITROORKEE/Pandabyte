import 'server-only';
import { createHmac } from 'node:crypto';
import { authenticateRagWorkflow } from './playground-workflow-clerk';
import { createEvaluationHandler } from './evaluation-handler';

async function handle(request: Request) {
 return createEvaluationHandler(async () => {
  const admission = await authenticateRagWorkflow(request);
  if (admission.kind !== 'admin') return admission;
  return { ...admission, rpc: async (name: string, params: Record<string, unknown>) => {
   if (name === 'panda_agent_evaluation_run') {
    if (params.p_action === 'read') {
     name = 'panda_agent_evaluation_read'; params = { p_run: params.p_run };
    } else {
     const key = process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY;
     if (!key || !/^[a-f0-9]{64}$/.test(key)) throw Error('Evaluation signing unavailable');
     const p_payload = JSON.stringify({ v: 1, subject: admission.subject, exp: Math.floor(Date.now() / 1000) + 60, parameters: params });
     const p_mac = createHmac('sha256', Buffer.from(key, 'hex')).update(`panda-rag-evaluation-db-v1\n${p_payload}`).digest('hex');
     name = 'panda_agent_evaluation_write'; params = { p_payload, p_mac };
    }
   }
   const result = await admission.client.database.rpc(name, params);
   if (result.error) throw Object.assign(Error('Evaluation persistence unavailable'), { code: (result.error as { details?: string }).details });
   return result.data;
  } };
 })(request);
}
export const evaluationsGET = handle;
export const evaluationsPOST = handle;
