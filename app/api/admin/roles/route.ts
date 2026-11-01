import "server-only";
import { operationalJson } from "@/lib/observability/events";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
import {
  parseRoleChangeInput,
  parseRoleListQuery,
  parseStaffRoleList,
  parseStaffRoleMembership,
} from "@/lib/admin/roles-validation";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const ROLE_ERRORS = new Set([
  "unauthorized", "forbidden", "invalid_role_request", "identity_not_found", "conflict",
  "protected_admin", "self_change", "last_admin", "staff_limit", "backend_unavailable",
  "same_origin_required", "application_json_required", "payload_too_large", "invalid_body",
]);

function json(value: unknown, status = 200) {
  return operationalJson(value, status, HEADERS, "admin_roles");
}

function error(code: string, status: number) {
  return json({ error: { code: ROLE_ERRORS.has(code) ? code : "backend_unavailable" } }, status);
}

async function requireRoleManager() {
  try {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return error("unauthorized", 401);
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc("staff_can_manage_roles", {});
    if (result.error || typeof result.data !== "boolean") return error("backend_unavailable", 503);
    return result.data ? { userId: session.userId } : error("forbidden", 403);
  } catch {
    return error("backend_unavailable", 503);
  }
}

function databaseError(value: unknown) {
  const details = value && typeof value === "object" && "details" in value && typeof value.details === "string"
    ? value.details
    : "";
  if (["unauthenticated", "forbidden"].includes(details)) return error(details === "unauthenticated" ? "unauthorized" : "forbidden", details === "unauthenticated" ? 401 : 403);
  if (details === "invalid_input") return error("invalid_role_request", 400);
  if (["version_conflict", "request_conflict", "conflict"].includes(details)) return error("conflict", 409);
  if (["protected_admin", "self_change", "last_admin", "staff_limit"].includes(details)) return error(details, 409);
  return error("backend_unavailable", 503);
}

async function verifiedUserId(email: string): Promise<string | null> {
  const clerk = await clerkClient();
  const { data } = await clerk.users.getUserList({ emailAddress: [email], limit: 2, offset: 0 });
  const matches = data.filter((user) => user.emailAddresses.some((address) => address.emailAddress.toLowerCase() === email));
  if (matches.length !== 1 || !matches[0].emailAddresses.some((address) =>
    address.emailAddress.toLowerCase() === email && address.verification?.status === "verified")) return null;
  return matches[0].id;
}

export async function GET(request: Request) {
  const access = await requireRoleManager();
  if (access instanceof Response) return access;
  const query = parseRoleListQuery(request.url);
  if (!query) return error("invalid_role_request", 400);

  try {
    const client = await createInsforgeServerClient();
    const { data, error: rpcError } = await client.database.schema("public").rpc("staff_list_roles", {
      p_limit: query.limit,
      p_offset: query.offset,
    });
    if (rpcError) return databaseError(rpcError);
    const result = parseStaffRoleList(data);
    if (!result) return error("backend_unavailable", 503);
    if (!result.items.length) return json(result);
    const clerk = await clerkClient();
    const users = await clerk.users.getUserList({ userId: result.items.map((item) => item.userId), limit: 50, offset: 0 });
    const identities = new Map(users.data.map((user) => {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240).trim() || null;
      const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId && address.verification?.status === "verified")?.emailAddress
        ?? user.emailAddresses.find((address) => address.verification?.status === "verified")?.emailAddress ?? null;
      return [user.id, { name, email }] as const;
    }));
    const directory = parseStaffRoleList({ ...result, items: result.items.map((item) => ({ ...item, identity: identities.get(item.userId) ?? { name: null, email: null } })) });
    return directory ? json(directory) : error("backend_unavailable", 503);
  } catch {
    return error("backend_unavailable", 503);
  }
}

export async function POST(request: Request) {
  const access = await requireRoleManager();
  if (access instanceof Response) return access;
  if (!isSameOriginRequest(request)) return error("same_origin_required", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return error("application_json_required", 415);

  const body = await readBoundedBody(request, 4096);
  if (!body.ok) return error(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
  let input: ReturnType<typeof parseRoleChangeInput>;
  try {
    input = parseRoleChangeInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)));
  } catch {
    return error("invalid_role_request", 400);
  }
  if (!input) return error("invalid_role_request", 400);

  let targetUserId: string | null;
  try { targetUserId = await verifiedUserId(input.email); }
  catch { return error("backend_unavailable", 503); }
  if (!targetUserId || (input.targetUserId !== null && input.targetUserId !== targetUserId)) {
    return error("identity_not_found", 404);
  }

  try {
    const client = await createInsforgeServerClient();
    const { data, error: rpcError } = await client.database.schema("public").rpc("staff_set_role", {
      p_user_id: targetUserId,
      p_role: input.role,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason,
    });
    if (rpcError) return databaseError(rpcError);
    const membership = parseStaffRoleMembership(data);
    return membership ? json({ membership }) : error("backend_unavailable", 503);
  } catch {
    return error("backend_unavailable", 503);
  }
}
