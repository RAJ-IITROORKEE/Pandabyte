import "server-only";
import { createClient } from "@insforge/sdk";

export function createInsforgePublicClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL?.trim();
  const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
  if (!baseUrl || !anonKey) throw new Error("Public data connection is unavailable.");
  return createClient({ baseUrl, anonKey, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
}
