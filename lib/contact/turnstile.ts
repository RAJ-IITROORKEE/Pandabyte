import { objectWithKeys, parseInquiryInput } from "../editorial/validation.ts";

type Environment = Record<string, string | undefined>;
export type ContactProtection = { siteKey: string; secret: string; submissionKey: string; origin: string; hostname: string; testMode: boolean };
const testSiteKeys = new Set(["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB", "2x00000000000000000000BB", "3x00000000000000000000FF"]);
const testSecrets = new Set(["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]);

export function contactProtection(env: Environment): ContactProtection | null {
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  const submissionKey = env.CONTACT_SUBMISSION_KEY?.trim();
  if (!siteKey || !secret || siteKey.length > 200 || secret.length > 200 || !submissionKey || !/^[0-9a-f]{64}$/.test(submissionKey)) return null;
  let url: URL;
  try { url = new URL(env.CONTACT_SITE_ORIGIN ?? ""); } catch { return null; }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const testMode = env.CONTACT_TURNSTILE_MODE === "local-test";
  if (testMode) {
    if (env.VERCEL || !local || url.protocol !== "http:" || !testSiteKeys.has(siteKey) || !testSecrets.has(secret)) return null;
  } else if (env.CONTACT_TURNSTILE_MODE !== "live" || local || url.protocol !== "https:" || testSiteKeys.has(siteKey) || testSecrets.has(secret)) return null;
  return { siteKey, secret, submissionKey, origin: url.origin, hostname: url.hostname, testMode };
}

export function parseProtectedInquiry(value: unknown) {
  if (!objectWithKeys(value, ["name", "email", "phone", "subject", "message", "idempotencyKey", "challengeToken"])) return null;
  const { challengeToken, ...fields } = value;
  if (typeof challengeToken !== "string" || challengeToken.length < 1 || challengeToken.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(challengeToken)) return null;
  const inquiry = parseInquiryInput(fields);
  return inquiry ? { inquiry, challengeToken } : null;
}

export function validTurnstileResult(value: unknown, config: ContactProtection, now = Date.now()): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("success" in value) || value.success !== true) return false;
  if (config.testMode) {
    return "metadata" in value && !!value.metadata && typeof value.metadata === "object" && "result_with_testing_key" in value.metadata && value.metadata.result_with_testing_key === true;
  }
  if ("metadata" in value && value.metadata && typeof value.metadata === "object" && "result_with_testing_key" in value.metadata && value.metadata.result_with_testing_key === true) return false;
  if (!("hostname" in value) || value.hostname !== config.hostname || !("action" in value) || value.action !== "contact" || !("challenge_ts" in value) || typeof value.challenge_ts !== "string") return false;
  const age = now - Date.parse(value.challenge_ts);
  return Number.isFinite(age) && age >= -30_000 && age <= 300_000;
}

export async function verifyTurnstile(token: string, idempotencyKey: string, config: ContactProtection, fetcher: typeof fetch = fetch): Promise<"verified" | "rejected" | "unavailable"> {
  if (config.testMode && token !== "XXXX.DUMMY.TOKEN.XXXX") return "rejected";
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", redirect: "error",
      body: JSON.stringify({ secret: config.secret, response: token, idempotency_key: idempotencyKey }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.body) return "unavailable";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 16_384) { await reader.cancel(); return "unavailable"; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return validTurnstileResult(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), config) ? "verified" : "rejected";
  } catch { return "unavailable"; }
}
