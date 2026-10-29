export type InventoryHistoryItem = { operation: "initialize" | "adjust"; delta: number; balanceAfter: number; reason: string; occurredAt: string };
export type InventoryHistoryResponse = { items: InventoryHistoryItem[]; offset: number; hasMore: boolean };

export function parseHistoryOffset(search: URLSearchParams): number | null {
  if ([...search.keys()].some(key => key !== "offset") || search.getAll("offset").length > 1) return null;
  const raw = search.get("offset") ?? "0";
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  const offset = Number(raw);
  return Number.isSafeInteger(offset) && offset <= 10000 && offset % 20 === 0 ? offset : null;
}

export function parseInventoryHistory(value: unknown, offset: number): InventoryHistoryResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 3 || data.offset !== offset || typeof data.hasMore !== "boolean" || !Array.isArray(data.items) || data.items.length > 20 || (data.hasMore && data.items.length !== 20)) return null;
  const items: InventoryHistoryItem[] = [];
  for (const raw of data.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).length !== 5 || !["initialize", "adjust"].includes(item.operation as string) || !Number.isSafeInteger(item.delta) || !Number.isSafeInteger(item.balanceAfter) || (item.balanceAfter as number) < 0 || typeof item.reason !== "string" || item.reason.length < 1 || item.reason.length > 500 || typeof item.occurredAt !== "string" || !Number.isFinite(Date.parse(item.occurredAt))) return null;
    const occurredAt = new Date(item.occurredAt).toISOString();
    items.push({ operation: item.operation as InventoryHistoryItem["operation"], delta: item.delta as number, balanceAfter: item.balanceAfter as number, reason: item.reason, occurredAt });
  }
  return { items, offset, hasMore: data.hasMore };
}
