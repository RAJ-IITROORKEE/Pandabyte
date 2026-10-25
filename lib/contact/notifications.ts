import { objectWithKeys } from "../editorial/validation.ts";

type Environment = Record<string, string | undefined>;
export type NotificationOutcome = "accepted" | "failed" | "uncertain" | "suppressed";
type Database = { schema: (name: string) => { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { details?: string; code?: string } | null }> } };
type SendResult = { data: unknown; error: { statusCode?: number } | null };

export function notificationSettings(env: Environment): { to: string; key: string } | null {
  const to = env.INQUIRY_EMAIL_TO?.trim();
  const key = env.INQUIRY_NOTIFICATION_KEY?.trim();
  if (env.INQUIRY_EMAIL_ENABLED !== "true" || !to || to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
      /[\u0000-\u001f\u007f,;<>"\\]/.test(to) || !key || !/^[0-9a-f]{64}$/.test(key)) return null;
  return { to, key };
}

export function parseNotificationRequest(value: unknown): { expectedVersion: number } | null {
  return objectWithKeys(value, ["expectedVersion"]) && Number.isSafeInteger(value.expectedVersion) && Number(value.expectedVersion) > 0
    ? { expectedVersion: Number(value.expectedVersion) } : null;
}

export class NotificationDatabaseError extends Error {
  readonly details: string;
  constructor(details?: string) { super("Notification state could not be saved."); this.details = details ?? "backend_unavailable"; }
}

export async function dispatchInquiryNotification(database: Database, id: string, expectedVersion: number, key: string, send: () => Promise<SendResult>): Promise<NotificationOutcome> {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await database.schema("public").rpc(name, { ...args, p_dispatch_key: key });
    if (result.error) throw new NotificationDatabaseError(result.error.details);
    return result.data;
  };
  const claim = await rpc("admin_claim_inquiry_notification", { p_id: id, p_expected_version: expectedVersion });
  if (!claim || typeof claim !== "object" || !("token" in claim) || typeof claim.token !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(claim.token)) throw new NotificationDatabaseError();
  const args = { p_id: id, p_token: claim.token };
  const begun = await rpc("begin_inquiry_notification", args);
  if (begun === false) return "suppressed";
  if (begun !== true) throw new NotificationDatabaseError();
  let outcome: NotificationOutcome = "uncertain";
  try {
    const result = await send();
    if (result.error) {
      // Only documented pre-send auth/rate rejection permits a later retry.
      if ([401, 403, 429].includes(result.error.statusCode ?? 0)) outcome = "failed";
    } else if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
      outcome = "skipped" in result.data && Array.isArray(result.data.skipped) && result.data.skipped.length > 0 ? "suppressed" : "accepted";
    }
  } catch { /* An external send may have succeeded before the connection failed. */ }
  await rpc("finish_inquiry_notification", { ...args, p_outcome: outcome });
  return outcome;
}
