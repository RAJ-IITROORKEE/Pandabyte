const AREAS = new Set(["editorial", "admin_records", "admin_roles", "account_files", "account_profile", "account_addresses", "staff_access", "cart", "catalog", "render", "route", "action", "proxy", "unknown"]);
const EVENTS = new Set(["api_failure", "uncaught_failure", "storage_cleanup_failure", "editorial_cleanup_failure"]);

export function buildOperationalEvent(kind: unknown, area: unknown, status: unknown) {
  return {
    schemaVersion: 1,
    event: typeof kind === "string" && EVENTS.has(kind) ? kind : "uncaught_failure",
    area: typeof area === "string" && AREAS.has(area) ? area : "unknown",
    status: typeof status === "number" && Number.isInteger(status) && status >= 500 && status <= 599 ? status : 500,
    reference: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

export function logOperationalFailure(kind: unknown, area: unknown, status: unknown = 500): string {
  const event = buildOperationalEvent(kind, area, status);
  try { console.error(JSON.stringify(event)); } catch { /* Diagnostics must not replace the business response. */ }
  return event.reference;
}

// Imported only by server boundaries; it does not inspect or log the response body.
export function operationalJson(body: unknown, status: number, headers: HeadersInit, area: string, expectedUnavailable = false): Response {
  const safeHeaders = new Headers(headers);
  safeHeaders.delete("X-Error-Reference");
  const response = Response.json(body, { status, headers: safeHeaders });
  if (status >= 500 && status <= 599 && !expectedUnavailable) {
    response.headers.set("X-Error-Reference", logOperationalFailure("api_failure", area, status));
  }
  return response;
}
