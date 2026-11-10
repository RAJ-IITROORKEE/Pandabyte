import { createAssistantCapabilities } from '@/Panda-agent/src/server/assistant-capabilities';
import { authenticateLightweight, currentLightweightSession } from '@/Panda-agent/src/server/lightweight-connection';
import { createLunaPrototypePolicy } from '@/Panda-agent/src/server/basic-rag-runtime';
import { nativeExecutionAvailable } from '@/Panda-agent/scripts/start-native-execution.mjs';
import type { ChatActor } from '@/Panda-agent/src/server/chat-contracts';
import { readLunaPrototypeProfile } from '@/Panda-agent/src/server/luna-prototype-profile';
import { createPlainLlmStore } from '@/Panda-agent/src/server/plain-llm-chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return createAssistantCapabilities({
    enabled: () => process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED === 'true' && process.env.PANDA_AGENT_ASSISTANT_NEW_MESSAGES === 'true',
    authenticate: authenticateLightweight,
    async inspect(value) {
      const actor = value as ChatActor;
      const current = () => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false);
      const input = { env: process.env, subject: actor.subject, requestOrigin: new URL(request.url).origin, actor, current };
      const policy = createLunaPrototypePolicy({ ...input, profile: () => readLunaPrototypeProfile({ ...input, nativePreview: true }) });
      const journal = createPlainLlmStore(actor, process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '');
      const schema = () => journal.admissionCurrent('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', {}).then(value => value === false).catch(() => false);
      const [session, binary, installed, admitted] = await Promise.all([current(), nativeExecutionAvailable(process.cwd()), schema(), policy.enabled()]);
      return { current: session, runtime: binary && installed, admitted, remainingNanoUsd: policy.allowance()?.remainingNanoUsd ?? null };
    },
  })();
}
