import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@insforge/sdk";

export async function createInsforgeServerClient() {
  const { isAuthenticated, sessionStatus, getToken } = await auth();

  if (!isAuthenticated || sessionStatus !== "active") {
    throw new Error("An active Clerk session is required.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("InsForge account access is unavailable.");
  }

  const accessToken = await getToken({ template: "insforge" });
  if (!accessToken) {
    throw new Error("InsForge account access is unavailable.");
  }

  return createClient({ baseUrl, accessToken });
}
