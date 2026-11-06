export type Manifest = { version: number; costClass: string; transport: string; allowedTools: string[]; allowedHosts: string[]; catalog?: string[]; sdk?: string; maxCallsPerTurn: number; modelCalls: number; deadlineMs: number; concurrency: number; timeoutMs: number; maxResultBytes: number; maxHttpRequests?: number; maxHttpBytes?: number; redirects?: number };
export type Tool = { id: string; enabled: boolean; version: number; manifest: Manifest; hash: string; health: string; history: { enabled: boolean; reason: string; at: string }[] };
const ids = ["panda_scoped_rag", "fetch_public_docs_mcp", "convert_units", "format_bom"];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 999999999;
const strings = (value: unknown) => Array.isArray(value) && value.length <= 8 && value.every(item => typeof item === "string" && item.length <= 200);

export function parseTools(value: unknown): Tool[] | null {
  if (!object(value) || !Array.isArray(value.tools) || value.tools.length !== 4) return null;
  const seen = new Set<string>();
  for (const tool of value.tools) {
    if (!object(tool) || typeof tool.id !== "string" || !ids.includes(tool.id) || seen.has(tool.id) || typeof tool.enabled !== "boolean" || !number(tool.version) || typeof tool.hash !== "string" || !/^[a-f0-9]{64}$/.test(tool.hash) || tool.health !== "not_checked" || !Array.isArray(tool.history) || tool.history.length > 20) return null;
    seen.add(tool.id);
    if (!tool.history.every((entry: unknown) => object(entry) && typeof entry.enabled === "boolean" && typeof entry.reason === "string" && entry.reason.length <= 300 && typeof entry.at === "string" && entry.at.length <= 64 && Number.isFinite(Date.parse(entry.at)))) return null;
    const m = tool.manifest;
    if (!object(m) || m.id !== tool.id || m.version !== 1 || m.costClass !== "local-zero-api-fee" || m.transport !== (tool.id === "fetch_public_docs_mcp" ? "stdio" : "in-process") || !strings(m.allowedTools) || !strings(m.allowedHosts) || ![m.maxCallsPerTurn, m.modelCalls, m.deadlineMs, m.concurrency, m.timeoutMs, m.maxResultBytes].every(number)) return null;
    const expectedTools: Record<string, string> = { panda_scoped_rag: "canonical_mcu,approved_gpio", fetch_public_docs_mcp: "fetch_document", convert_units: "convert_units", format_bom: "format_bom" };
    if ((m.allowedTools as string[]).join(",") !== expectedTools[tool.id] || (m.allowedHosts as string[]).join(",") !== (tool.id === "fetch_public_docs_mcp" ? "docs.espressif.com" : "")) return null;
    if (tool.id === "fetch_public_docs_mcp" && (!strings(m.catalog) || (m.catalog as string[]).join(",") !== "espressif-esp-idf-5.5.1-esp32-gpio" || m.sdk !== "mcp==2.3.0" || ![m.maxHttpRequests, m.maxHttpBytes, m.redirects].every(number))) return null;
  }
  return value.tools as Tool[];
}
