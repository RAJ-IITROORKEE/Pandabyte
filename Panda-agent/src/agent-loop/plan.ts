/** The agent's visible checklist for a multi-step request (phase 5): 2-6 short steps, each done or not. Shared by the
 *  `plan` tool, the server's `plan` stream event and the browser, so all three accept exactly the same shape. */
export type PlanStep = { text: string; done: boolean };
export const MAX_PLAN_STEPS = 6, MIN_PLAN_STEPS = 2, PLAN_STEP_CHARS = 80;

export function parsePlan(value: unknown): PlanStep[] | null {
  if (!Array.isArray(value) || value.length < MIN_PLAN_STEPS || value.length > MAX_PLAN_STEPS) return null;
  const steps: PlanStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(k => k !== 'text' && k !== 'done')) return null;
    const { text, done } = item as Record<string, unknown>;
    if (typeof text !== 'string' || typeof done !== 'boolean' || !text.isWellFormed()) return null;
    const clean = text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
    // Plain step names only: no links (the checklist is not a source).
    if (!clean || clean.length > PLAN_STEP_CHARS || /https?:\/\/|www\./i.test(clean)) return null;
    steps.push({ text: clean, done });
  }
  return steps;
}
