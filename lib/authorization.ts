import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { validPermissions } from "@/lib/admin/access-contract";

export const STAFF_CAPABILITIES = [
  "content.edit",
  "catalog.edit",
  "content.publish",
  "orders.manage",
  "staff.manage",
  "media.manage",
  "inquiries.manage",
] as const;

export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

export type CapabilityResult =
  | { allowed: true; userId: string }
  | { allowed: false; status: 401 | 403 | 503 };

export async function getStaffAccess(): Promise<
  | { allowed: true; userId: string; capabilities: string[] }
  | { allowed: false; status: 401 | 403 | 503 }
> {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) return { allowed: false, status: 401 };
  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.schema("public").from("staff_capabilities")
      .select("capability").eq("user_id", userId).limit(STAFF_CAPABILITIES.length);
    if (error) return { allowed: false, status: 503 };
    const capabilities = (data ?? []).map((row) => row.capability)
      .filter((value): value is StaffCapability => STAFF_CAPABILITIES.includes(value as StaffCapability));
    const snapshot = await client.database.schema("public").rpc("staff_permission_snapshot", {});
    if (snapshot.error || !snapshot.data || typeof snapshot.data !== "object" || typeof snapshot.data.custom !== "boolean" || !validPermissions(snapshot.data.permissions)) return { allowed: false, status: 503 };
    if (snapshot.data.custom) return snapshot.data.permissions.length
      ? { allowed: true, userId, capabilities: [...capabilities, "__custom_role__", ...snapshot.data.permissions] }
      : { allowed: false, status: 403 };
    return capabilities.length ? { allowed: true, userId, capabilities } : { allowed: false, status: 403 };
  } catch {
    return { allowed: false, status: 503 };
  }
}

export async function requireCapability(capability: StaffCapability): Promise<CapabilityResult> {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    return { allowed: false, status: 401 };
  }

  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database
      .schema("public")
      .rpc("has_capability", { capability_name: capability });

    if (error) return { allowed: false, status: 503 };
    return data === true ? { allowed: true, userId } : { allowed: false, status: 403 };
  } catch {
    return { allowed: false, status: 503 };
  }
}
