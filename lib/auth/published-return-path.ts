import "server-only";
import { foundationPages } from "@/lib/site-navigation";
import { getPublishedRecord } from "@/lib/editorial/published";
import { safeAuthReturnPath } from "@/lib/auth/return-path";

const RETURN_ORIGIN = "https://auth-return.invalid";
const ROOT_PAGE_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/)?$/;
const PRIVATE_ROOT_SLUGS = new Set(["account", "admin", "staff", "sign-in", "sign-up", "api", "admin-preview", "checkout", "cart", "agent"]);

export async function safePublishedAuthReturnPath(value: unknown): Promise<string | null> {
  const publicPaths = Object.keys(foundationPages);
  const knownPath = safeAuthReturnPath(value, publicPaths);
  if (knownPath !== null) return knownPath;
  if (typeof value !== "string") return null;

  const rawPath = value.split(/[?#]/, 1)[0];
  const candidate = ROOT_PAGE_PATH.exec(rawPath);
  if (!candidate) return null;
  const requestedSlug = candidate[1];
  if (requestedSlug.length > 160 || PRIVATE_ROOT_SLUGS.has(requestedSlug)) return null;
  const requestedPath = `/${requestedSlug}`;
  const safeCandidate = safeAuthReturnPath(value, [...publicPaths, rawPath, requestedPath]);
  if (!safeCandidate || safeCandidate.split(/[?#]/, 1)[0] !== requestedPath) return null;

  try {
    const requested = await getPublishedRecord("pages", requestedSlug);
    if (!requested) return null;
    let canonicalSlug: string;
    if ("redirectTo" in requested) {
      const redirectSlug = requested.redirectTo;
      if (redirectSlug === requestedSlug) return null;
      const redirected = await getPublishedRecord("pages", redirectSlug);
      if (!redirected || "redirectTo" in redirected || redirected.slug !== redirectSlug) return null;
      canonicalSlug = redirected.slug;
    } else {
      if (requested.slug !== requestedSlug) return null;
      canonicalSlug = requested.slug;
    }
    if (canonicalSlug.length > 160 || PRIVATE_ROOT_SLUGS.has(canonicalSlug)) return null;

    const canonicalPath = canonicalSlug === "home" ? "/" : `/${canonicalSlug}`;
    const safeSuffix = new URL(safeCandidate, RETURN_ORIGIN);
    return safeAuthReturnPath(`${canonicalPath}${safeSuffix.search}${safeSuffix.hash}`, [...publicPaths, canonicalPath]);
  } catch {
    return null;
  }
}
