export type ResearchValue = null | string | number | boolean | ResearchValue[] | { [key: string]: ResearchValue };
export type ResearchObject = { [key: string]: ResearchValue };
export const researchObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
 && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const researchText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && value.isWellFormed();

/** Validate before serializing: native metadata must not execute accessors or toJSON hooks. */
export function researchJSON(value: unknown, maxBytes: number, maxDepth = 20, maxEntries = 256): value is ResearchValue {
 const seen = new Set<object>(); let nodes = 0;
 const visit = (item: unknown, depth: number): boolean => {
  if (++nodes > 20000 || depth > maxDepth) return false;
  if (item === null || typeof item === 'boolean') return true;
  if (typeof item === 'string') return item.isWellFormed() && item.length <= maxBytes;
  if (typeof item === 'number') return Number.isFinite(item);
  if (Array.isArray(item) ? Object.getPrototypeOf(item) !== Array.prototype : !researchObject(item)) return false;
  if (seen.has(item)) return false;
  seen.add(item);
  try {
   const keys = Reflect.ownKeys(item);
   if (Array.isArray(item) && (item.length > maxEntries || keys.length !== item.length + 1)) return false;
   if (!Array.isArray(item) && keys.length > maxEntries) return false;
   for (const key of keys) {
    if (Array.isArray(item) && key === 'length') continue;
    if (typeof key !== 'string' || !key.isWellFormed() || ['__proto__', 'constructor', 'prototype'].includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(item, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable || !visit(descriptor.value, depth + 1)) return false;
   }
   return true;
  } finally { seen.delete(item); }
 };
 try { return visit(value, 0) && Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes; } catch { return false; }
}
