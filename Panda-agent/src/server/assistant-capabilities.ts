import type { Capabilities } from '../ui/capabilities.ts';

/** Public projection of server admission; never includes receipts, identities or secrets. */
export function createAssistantCapabilities(deps: {
  enabled(): boolean;
  authenticate(): Promise<unknown>;
  inspect(actor: unknown): Promise<{ current: boolean; runtime: boolean; admitted: boolean; remainingNanoUsd: number | null }>;
}) {
  return async () => {
    const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'Content-Type': 'application/json' };
    const value: Capabilities = { mode: 'native_assistant', model: null, status: 'unavailable', reason: 'disabled', rag: false, tools: [], budget: null };
    try {
      const actor = await deps.authenticate();
      if (!actor) return Response.json({ error: 'unauthenticated' }, { status: 401, headers });
      if (deps.enabled()) {
        const state = await deps.inspect(actor);
        value.reason = !state.current ? 'connection_unavailable' : !state.runtime ? 'runtime_unavailable' : 'privacy_or_budget_unavailable';
        if (state.current && state.runtime && state.admitted && Number.isSafeInteger(state.remainingNanoUsd) && state.remainingNanoUsd! >= 0 && state.remainingNanoUsd! <= 1000000000) {
          value.status = 'ready'; value.reason = null; value.model = 'GPT-6 Luna';
          value.budget = { limitNanoUsd: 1000000000, remainingNanoUsd: state.remainingNanoUsd! };
        }
      }
    } catch { value.reason = 'connection_unavailable'; }
    return Response.json(value, { headers });
  };
}
