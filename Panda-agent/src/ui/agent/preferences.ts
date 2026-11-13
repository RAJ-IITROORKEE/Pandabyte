// Per-account chat preferences kept in this browser only; storage may be blocked, so every access is guarded.
export type AgentPreferences = { defaultModel?: string };

const key = (userId: string) => `panda-agent:preferences:${userId}`;

export function parsePreferences(raw: string | null): AgentPreferences {
  if (!raw || raw.length > 2000) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return {}; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>, out: AgentPreferences = {};
  if (typeof v.defaultModel === 'string' && /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(v.defaultModel) && v.defaultModel.length <= 100) out.defaultModel = v.defaultModel;
  return out;
}

export function readPreferences(userId: string): AgentPreferences {
  try { return parsePreferences(window.localStorage.getItem(key(userId))); } catch { return {}; }
}

export function writePreferences(userId: string, next: AgentPreferences): boolean {
  try { window.localStorage.setItem(key(userId), JSON.stringify(next)); return true; } catch { return false; }
}
