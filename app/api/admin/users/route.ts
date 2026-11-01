import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { operationalJson } from "@/lib/observability/events";
import { parseRoleCatalog, parseUserSummaries, parseUsersQuery } from "@/lib/admin/access-contract";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => operationalJson(value, status, headers, "admin_roles");
const fail = (code: string, status: number) => json({ error: { code } }, status);
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return fail("unauthorized", 401);
    const client = await createInsforgeServerClient();
    const allowed = await client.database.schema("public").rpc("staff_can_manage_roles", {});
    if (allowed.error || typeof allowed.data !== "boolean") return fail("backend_unavailable", 503);
    if (!allowed.data) return fail("forbidden", 403);
    const query = parseUsersQuery(request.url); if (!query) return fail("invalid_role_request", 400);
    const clerk = await clerkClient();
    const [users, totalUsers, catalogResult] = await Promise.all([
      clerk.users.getUserList({ limit: query.limit, offset: query.offset, ...(query.query ? { query: query.query } : {}) }),
      clerk.users.getCount(),
      client.database.schema("public").rpc("staff_role_catalog", {}),
    ]);
    if (catalogResult.error) return fail("backend_unavailable", 503);
    const catalog = parseRoleCatalog(catalogResult.data); if (!catalog) return fail("backend_unavailable", 503);
    const ids = users.data.map((user) => user.id);
    const result = await client.database.schema("public").rpc("staff_user_summaries", { p_user_ids: ids });
    if (result.error) return fail("backend_unavailable", 503);
    const summaries = parseUserSummaries(result.data, ids);
    if (!summaries) return fail("backend_unavailable", 503);
    const staffAssignments = summaries.counts.staffUsers;
    const existingStaff = staffAssignments.length ? await clerk.users.getUserList({ userId: staffAssignments.map((item) => item.userId), limit: 100, offset: 0 }) : null;
    if (existingStaff && (existingStaff.totalCount !== existingStaff.data.length || existingStaff.data.some((user) => !staffAssignments.some((item) => item.userId === user.id)))) return fail("backend_unavailable", 503);
    const staffIds = new Set(existingStaff?.data.map((user) => user.id) ?? []);
    const staffUsers = staffAssignments.filter((item) => staffIds.has(item.userId));
    if (staffUsers.length > totalUsers) return fail("backend_unavailable", 503);
    const counts = new Map<string, number>();
    for (const staff of staffUsers) counts.set(staff.role, (counts.get(staff.role) ?? 0) + 1);
    counts.set("CUSTOMER", totalUsers - staffUsers.length);
    const byId = new Map(summaries.items.map((item) => [item.userId, item]));
    const items = users.data.map((user) => {
      const summary = byId.get(user.id)!;
      const verifiedEmail = user.emailAddresses.find((x) => x.id === user.primaryEmailAddressId && x.verification?.status === "verified") ?? user.emailAddresses.find((x) => x.verification?.status === "verified");
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) || null;
      let imageUrl: string | null = null;
      try { const url = new URL(user.imageUrl); if (url.protocol === "https:" && (url.hostname === "img.clerk.com" || url.hostname.endsWith(".clerk.com"))) imageUrl = url.href; } catch { /* Untrusted image URL is omitted. */ }
      const createdAt = new Date(user.createdAt).toISOString();
      const identityUpdated = new Date(user.updatedAt).toISOString();
      return { ...summary, name, email: verifiedEmail?.emailAddress ?? null, imageUrl, verified: !!verifiedEmail, createdAt, lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null, updatedAt: summary.updatedAt && Date.parse(summary.updatedAt) > Date.parse(identityUpdated) ? summary.updatedAt : identityUpdated };
    });
    return json({ items, total: users.totalCount, stats: { totalUsers, staffUsers: staffUsers.length, customerUsers: totalUsers - staffUsers.length, totalRoles: catalog.items.length, byRole: [...counts].map(([role, count]) => ({ role, count })) } });
  } catch { return fail("backend_unavailable", 503); }
}
