import 'server-only';
import { authenticateLightweight, currentLightweightSession } from './lightweight-connection';
import { createProjectMemoryHandler } from './project-memory-handler';
import { ChatStoreError } from './chat-store';

const handler = createProjectMemoryHandler({
  enabled: () => process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED === 'true',
  authenticate: authenticateLightweight,
  current: actor => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false),
  store: actor => ({
    async read(thread) {
      const { data, error } = await actor.client.database.rpc('panda_agent_memory_read', { p_thread: thread });
      if (error) throw storeError(error);
      return data;
    },
    async change(thread, change) {
      const { data, error } = await actor.client.database.rpc('panda_agent_memory_change', {
        p_thread: thread, p_request: change.requestId, p_expected_version: change.expectedVersion, p_intent: change.intent,
      });
      if (error) throw storeError(error);
      return data;
    },
  }),
});

function storeError(error: unknown): ChatStoreError {
  const value = error as { code?: string; details?: string };
  const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
  return new ChatStoreError(value.code === 'P0001'
    ? known.find(code => code === value.details) ?? 'unavailable' : 'unavailable');
}

export const projectMemoryGET = (request: Request, thread: string) => handler(request, thread);
export const projectMemoryPATCH = projectMemoryGET;
