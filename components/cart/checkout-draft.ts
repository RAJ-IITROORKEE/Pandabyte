import type { CheckoutDraft } from "./checkout-validation";
let memory: { key: string; draft: CheckoutDraft } | null = null;
export function readDraft(key: string) { return memory?.key === key ? memory.draft : null; }
export function saveDraft(key: string, draft: CheckoutDraft) { memory = { key, draft }; }
export function clearDraft() { memory = null; }
