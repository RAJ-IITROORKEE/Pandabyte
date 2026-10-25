import { createInsforgePublicClient } from "@/lib/insforge/public";
import { editorialBody, editorialDatabaseError, editorialError, editorialJson } from "@/lib/editorial/http";
import { contactProtection, parseProtectedInquiry, verifyTurnstile } from "@/lib/contact/turnstile";

export async function POST(request: Request) {
  const body = await editorialBody(request, 32768);
  if (body instanceof Response) return body;
  const parsed = parseProtectedInquiry(body.value);
  if (!parsed) return editorialError("invalid_inquiry", 400);
  const config = contactProtection(process.env);
  if (!config || new URL(request.url).origin !== config.origin) return editorialError("contact_unconfigured", 503);
  const verification = await verifyTurnstile(parsed.challengeToken, crypto.randomUUID(), config);
  if (verification !== "verified") return editorialError(verification === "rejected" ? "challenge_failed" : "challenge_unavailable", verification === "rejected" ? 403 : 503);
  const { inquiry } = parsed;
  try {
    const client = createInsforgePublicClient();
    const { data, error } = await client.database.schema("public").rpc("submit_verified_inquiry", {
      p_name: inquiry.name, p_email: inquiry.email, p_phone: inquiry.phone,
      p_subject: inquiry.subject, p_message: inquiry.message, p_request_id: inquiry.idempotencyKey,
      p_submission_key: config.submissionKey,
    });
    return error ? editorialDatabaseError(error) : editorialJson(data, 201);
  } catch { return editorialError("inquiry_unavailable", 503); }
}
