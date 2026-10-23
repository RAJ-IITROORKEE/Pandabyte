import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";

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
  | { allowed: true; userId: string; capabilities: StaffCapability[] }
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
