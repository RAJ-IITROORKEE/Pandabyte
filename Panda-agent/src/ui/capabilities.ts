export type Capabilities = { mode: 'native_assistant' | 'basic_rag' | 'legacy'; model: 'GPT-6 Luna' | null; status: 'ready' | 'unavailable'; reason: string | null; rag: boolean; tools: string[]; budget: { limitNanoUsd: number; remainingNanoUsd: number } | null };
export function parseCapabilities(value: unknown): Capabilities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (!['native_assistant', 'basic_rag', 'legacy'].includes(String(c.mode)) || ![null, 'GPT-6 Luna'].includes(c.model as null | string) || !['ready','unavailable'].includes(String(c.status)) || ![null, 'disabled', 'runtime_unavailable', 'privacy_or_budget_unavailable', 'connection_unavailable'].includes(c.reason as string | null) || typeof c.rag !== 'boolean' || !Array.isArray(c.tools) || c.tools.length > 32 || !c.tools.every(t => typeof t === 'string' && t.length <= 100)) return null;
  if (c.mode === 'native_assistant' && c.rag) return null;
  if (c.budget !== null) {
    if (!c.budget || typeof c.budget !== 'object' || Array.isArray(c.budget)) return null;
    const b = c.budget as Record<string, unknown>;
    if (b.limitNanoUsd !== 1000000000 || !Number.isSafeInteger(b.remainingNanoUsd) || (b.remainingNanoUsd as number) < 0 || (b.remainingNanoUsd as number) > 1000000000) return null;
  }
  return c as Capabilities;
}
