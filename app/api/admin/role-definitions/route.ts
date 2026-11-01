import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { operationalJson } from "@/lib/observability/events";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
import { parseRoleCatalog, parseRoleDefinition, parseRoleDefinitionInput } from "@/lib/admin/access-contract";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => operationalJson(value, status, headers, "admin_roles");
const fail = (code: string, status: number) => json({ error: { code } }, status);
async function authorize() {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return fail("unauthorized", 401);
  const client = await createInsforgeServerClient();
  const result = await client.database.schema("public").rpc("staff_can_manage_roles", {});
  if (result.error || typeof result.data !== "boolean") return fail("backend_unavailable", 503);
  return result.data ? client : fail("forbidden", 403);
}
export async function GET() {
  try {
    const client = await authorize(); if (client instanceof Response) return client;
    const result = await client.database.schema("public").rpc("staff_role_catalog", {});
    if (result.error) return fail("backend_unavailable", 503);
    const catalog = parseRoleCatalog(result.data);
    return catalog ? json(catalog) : fail("backend_unavailable", 503);
  } catch { return fail("backend_unavailable", 503); }
}
export async function POST(request: Request) {
  try {
    const client = await authorize(); if (client instanceof Response) return client;
    if (!isSameOriginRequest(request)) return fail("same_origin_required", 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return fail("application_json_required", 415);
    const body = await readBoundedBody(request, 8192);
    if (!body.ok) return fail(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
    let input; try { input = parseRoleDefinitionInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes))); } catch { input = null; }
    if (!input) return fail("invalid_role_request", 400);
    const result = await client.database.schema("public").rpc("staff_save_role_definition", { p_key: input.key, p_name: input.name, p_description: input.description, p_permissions: input.permissions, p_expected_version: input.expectedVersion, p_reason: input.reason });
    if (result.error) {
      const details = result.error.details;
      if (["version_conflict", "conflict", "request_conflict"].includes(details ?? "")) return fail("conflict", 409);
      if (details === "invalid_input") return fail("invalid_role_request", 400);
      if (details === "forbidden") return fail("forbidden", 403);
      return fail("backend_unavailable", 503);
    }
    const role = parseRoleDefinition(result.data);
    return role ? json({ role }) : fail("backend_unavailable", 503);
  } catch { return fail("backend_unavailable", 503); }
}
