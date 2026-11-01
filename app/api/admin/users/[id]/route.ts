import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { operationalJson } from "@/lib/observability/events";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
import { parseUserRemovalInput, validUserId } from "@/lib/admin/access-contract";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => operationalJson(value, status, headers, "admin_roles");
const fail = (code: string, status: number) => json({ error: { code } }, status);
const removed = () => json({ removed: true });
const pending = () => fail("removal_pending", 503);
function state(value: unknown): null | "pending" | "deleted" | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("state" in value)) return undefined;
  return value.state === null || value.state === "pending" || value.state === "deleted" ? value.state : undefined;
}
function notFound(error: unknown) { return !!error && typeof error === "object" && "status" in error && error.status === 404; }
function databaseError(error: unknown) {
  const details = error && typeof error === "object" && "details" in error ? error.details : null;
  if (details === "forbidden") return fail("forbidden", 403);
  if (details === "unauthenticated") return fail("unauthorized", 401);
  if (details === "invalid_input") return fail("invalid_role_request", 400);
  if (details === "protected_admin" || details === "self_change" || details === "last_admin") return fail(details, 409);
  if (details === "version_conflict" || details === "request_conflict" || details === "conflict") return fail("conflict", 409);
  return fail("backend_unavailable", 503);
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return fail("unauthorized", 401);
    const client = await createInsforgeServerClient();
    const db = client.database.schema("public");
    const allowed = await db.rpc("staff_can_manage_roles", {});
    if (allowed.error || typeof allowed.data !== "boolean") return fail("backend_unavailable", 503);
    if (!allowed.data) return fail("forbidden", 403);
    if (!isSameOriginRequest(request)) return fail("same_origin_required", 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return fail("application_json_required", 415);
    const id = (await params).id;
    if (!validUserId(id)) return fail("invalid_role_request", 400);
    const body = await readBoundedBody(request, 4096);
    if (!body.ok) return fail(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
    let input; try { input = parseUserRemovalInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes))); } catch { input = null; }
    if (!input) return fail("invalid_role_request", 400);
    const current = await db.rpc("staff_user_removal_state", { p_user_id: id });
    if (current.error) return databaseError(current.error);
    const currentState = state(current.data);
    if (currentState === undefined) return fail("backend_unavailable", 503);
    const clerk = await clerkClient();
    const finish = async () => {
      try { const result = await db.rpc("staff_finish_user_removal", { p_user_id: id }); return !result.error && state(result.data) === "deleted" ? removed() : pending(); }
      catch { return pending(); }
    };
    try { await clerk.users.getUser(id); } catch (error) {
      if (!notFound(error)) return currentState === "pending" ? pending() : fail("backend_unavailable", 503);
      return currentState === "deleted" ? removed() : currentState === "pending" ? finish() : fail("identity_not_found", 404);
    }
    const reconcilePrepare = async () => {
      try {
        const result = await db.rpc("staff_user_removal_state", { p_user_id: id });
        if (result.error) return fail("backend_unavailable", 503);
        const confirmed = state(result.data);
        if (confirmed === "pending") return pending();
        // A receipt alone cannot establish that Clerk removed the identity.
        return fail("backend_unavailable", 503);
      } catch { return fail("backend_unavailable", 503); }
    };
    let prepared;
    try { prepared = await db.rpc("staff_prepare_user_removal", { p_user_id: id, p_expected_version: input.expectedVersion, p_reason: input.reason }); }
    catch { return reconcilePrepare(); }
    if (prepared.error) return databaseError(prepared.error);
    const preparedState = state(prepared.data);
    if (preparedState !== "pending" && preparedState !== "deleted") return reconcilePrepare();
    try { await clerk.users.deleteUser(id); }
    catch {
      try { await clerk.users.getUser(id); return pending(); }
      catch (error) { if (!notFound(error)) return pending(); }
    }
    return finish();
  } catch { return fail("backend_unavailable", 503); }
}
