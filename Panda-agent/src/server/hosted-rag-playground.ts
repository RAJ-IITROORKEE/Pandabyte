import 'server-only';
import type { RagWorkflowDependencies } from '../control-room/rag-workflow';
import { BasicRagProviderError } from './basic-rag-openrouter';
import { createLunaRagCompletion } from './luna-rag-openrouter';
import { createHostedRagPolicy } from './hosted-rag-policy';

/** Persistent hosted admission; the database claim prevents a second dispatch for the same request. */
export function createHostedRagPlayground(policy: ReturnType<typeof createHostedRagPolicy>): NonNullable<RagWorkflowDependencies['generate']> {
 return async (input,beforeSend,signal) => {
  if (!await policy.enabled()) throw Object.assign(Error('Model unavailable'),{code:'not_admitted'});
  const complete=createLunaRagCompletion({apiKey:policy.key(),policyCurrent:policy.current,dispatchCurrent:policy.dispatchCurrent,receiptPolicy:'hosted',
   preClaimCurrent:policy.dispatchCurrent,
   claim:()=>policy.claimRequest({request:input.requestId,surface:'playground',fingerprint:input.context.digest})});
  try {
   return await complete({question:input.question,passages:input.context.passages.map(({rank,text})=>({rank,text}))},beforeSend,signal);
  } catch(error) {
   const code=error instanceof BasicRagProviderError ? error.code==='rate_limited'?'quota'
    :error.code==='outcome_unknown'||error.code==='response_rejected'?error.code:'not_admitted':'outcome_unknown';
   throw Object.assign(Error('Model unavailable'),{code});
  }
 };
}
