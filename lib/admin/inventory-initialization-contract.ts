import { parseInventoryAdjustment, type FieldError, type ValidationResult } from "./validation.ts";

export type InventoryInitialization = {
  expectedVersion: number;
  quantity: number;
  reason: string;
  requestId: string;
};

export function parseInventoryInitialization(value: unknown): ValidationResult<InventoryInitialization> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, fields: [{ field: "body", code: "invalid", message: "Enter a JSON object." }] };
  }
  const input = value as Record<string, unknown>;
  const fields: FieldError[] = [];
  for (const key of Object.keys(input)) {
    if (!["expectedVersion", "quantity", "reason", "requestId"].includes(key)) {
      fields.push({ field: key, code: "unknown_field", message: "This field is not allowed." });
    }
  }
  // Reuse the existing version, reason and idempotency-key validation without accepting a delta.
  const common = parseInventoryAdjustment({ expectedVersion: input.expectedVersion, delta: 1, reason: input.reason, requestId: input.requestId });
  if (!common.ok) fields.push(...common.fields);
  if (input.expectedVersion === Number.MAX_SAFE_INTEGER) {
    fields.push({ field: "expectedVersion", code: "invalid", message: "Reload this stock record before continuing." });
  }
  if (!Number.isSafeInteger(input.quantity) || (input.quantity as number) < 0 || (input.quantity as number) > 1_000_000) {
    fields.push({ field: "quantity", code: "invalid", message: "Enter a whole-number count from 0 to 1,000,000." });
  }
  if (fields.length || !common.ok) return { ok: false, fields };
  return { ok: true, value: { expectedVersion: common.value.expectedVersion, quantity: input.quantity as number, reason: common.value.reason, requestId: common.value.requestId } };
}
