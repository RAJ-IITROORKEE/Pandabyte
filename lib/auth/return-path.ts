import { isOrderReference } from "../checkout/validation.ts";

const RETURN_ORIGIN = "https://auth-return.invalid";
const MAX_RETURN_PATH_LENGTH = 2048;
const DYNAMIC_PUBLIC_PATH = /^\/(?:products|blog|solutions|shop)\/([a-z0-9]+(?:-[a-z0-9]+)*)$|^\/learn\/(?:resources|youtube)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const ALTERNATE_REDIRECT_KEYS = new Set([
  "redirect",
  "redirecturl",
  "redirectto",
  "returnto",
  "next",
  "nexturl",
  "continue",
  "callbackurl",
  "destination",
  "target",
]);

function registeredPaths(paths: readonly string[]): Set<string> {
  return new Set(paths.map((path) => path.split(/[?#]/, 1)[0]));
}

export function safeAuthReturnPath(value: unknown, publicPaths: readonly string[]): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_RETURN_PATH_LENGTH ||
    value.trim() !== value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    /%(?:00|0a|0d|2e|2f|25|5c)/i.test(value)
  ) {
    return null;
  }

  const rawPath = value.split(/[?#]/, 1)[0];
  if (
    !rawPath ||
    rawPath.includes("//") ||
    rawPath.includes("%") ||
    rawPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  let target: URL;
  try {
    target = new URL(value, RETURN_ORIGIN);
  } catch {
    return null;
  }

  if (target.origin !== RETURN_ORIGIN || target.username || target.password) return null;

  const pathname = target.pathname === "/" ? "/" : target.pathname.replace(/\/$/, "");
  const publicPathSet = registeredPaths(publicPaths);
  const dynamicPathMatch = DYNAMIC_PUBLIC_PATH.exec(pathname);
  const dynamicPathAllowed = !!dynamicPathMatch && (dynamicPathMatch[1] ?? dynamicPathMatch[2]).length <= 160;
  const allowed =
    pathname === "/" ||
    publicPathSet.has(pathname) ||
    dynamicPathAllowed ||
    (pathname.startsWith("/checkout/confirmation/") && isOrderReference(pathname.slice("/checkout/confirmation/".length))) ||
    /^\/account(?:\/[^/]+)*$/.test(pathname) ||
    /^\/admin(?:\/[^/]+)*$/.test(pathname) ||
    ["/staff", "/checkout", "/agent"].includes(pathname);

  if (!allowed) return null;
  return `${pathname}${target.search}${target.hash}`;
}

export function authEntryHref(
  route: "sign-in" | "sign-up",
  returnPath: unknown,
  publicPaths: readonly string[],
): string {
  const safePath = safeAuthReturnPath(returnPath, publicPaths) ?? "/";
  return `/${route}?redirect_url=${encodeURIComponent(safePath)}`;
}

export function hasAlternateRedirectParam(searchParams: Record<string, unknown>): boolean {
  return Object.keys(searchParams).some((key) => {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    return key !== "redirect_url" && ALTERNATE_REDIRECT_KEYS.has(normalized);
  });
}
