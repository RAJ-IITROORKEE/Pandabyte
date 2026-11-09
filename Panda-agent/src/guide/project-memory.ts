import { parseGuideInput, parseProjectMemory, type ProjectMemory } from './contracts.ts';

export type MemoryChange = {
  requestId: string;
  expectedVersion: number;
  intent: NonNullable<ProjectMemory['intent']> | null;
};
export type MemoryState = { memory: ProjectMemory | null; lastRequestId: string | null };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);

export function parseMemoryChange(value: unknown): MemoryChange | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'expectedVersion,intent,requestId'
    || !uuid(value.requestId) || !Number.isSafeInteger(value.expectedVersion)
    || (value.expectedVersion as number) < 0 || (value.expectedVersion as number) > 999_999_998) return null;
  if (value.intent === null) return { requestId: value.requestId, expectedVersion: value.expectedVersion as number, intent: null };
  if (!record(value.intent) || Object.hasOwn(value.intent, 'expectedVersion')) return null;
  const parsed = parseGuideInput({ ...value.intent, expectedVersion: value.expectedVersion });
  if (!parsed) return null;
  const { expectedVersion, ...intent } = parsed;
  return { requestId: value.requestId, expectedVersion, intent };
}

export function parseMemoryState(value: unknown): MemoryState | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'lastRequestId,memory'
    || (value.lastRequestId !== null && !uuid(value.lastRequestId))) return null;
  const memory = value.memory === null ? null : parseProjectMemory(value.memory);
  if (value.memory !== null && !memory) return null;
  if (!memory && value.lastRequestId !== null) return null;
  return { memory, lastRequestId: value.lastRequestId as string | null };
}
