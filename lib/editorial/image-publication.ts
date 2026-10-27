import { UUID_PATTERN } from "./validation.ts";

export function parseImagePublication(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(",") !== "expectedRevisionId,expectedVersion,replacements" ||
      !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1 ||
      typeof body.expectedRevisionId !== "string" || !UUID_PATTERN.test(body.expectedRevisionId) ||
      !Array.isArray(body.replacements) || body.replacements.length < 1 || body.replacements.length > 100) return null;
  const oldIds = new Set<string>(), newIds = new Set<string>();
  for (const entry of body.replacements) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "newId,oldId" ||
        typeof entry.oldId !== "string" || typeof entry.newId !== "string" ||
        !UUID_PATTERN.test(entry.oldId) || !UUID_PATTERN.test(entry.newId) ||
        entry.oldId !== entry.oldId.toLowerCase() || entry.newId !== entry.newId.toLowerCase() ||
        oldIds.has(entry.oldId) || newIds.has(entry.newId)) return null;
    oldIds.add(entry.oldId); newIds.add(entry.newId);
  }
  if ([...oldIds].some(id => newIds.has(id))) return null;
  return { expectedVersion: Number(body.expectedVersion), expectedRevisionId: body.expectedRevisionId, replacements: body.replacements };
}
