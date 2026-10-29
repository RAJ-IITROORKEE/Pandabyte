import { auth } from "@clerk/nextjs/server";
import { parseBillingProfile, parseBillingProfileInput } from "@/lib/account/billing-profile";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { operationalJson } from "@/lib/observability/events";
import { isJsonContentType } from "@/lib/account/profile";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => operationalJson(body, status, headers, "account_profile");
const failure = (code: string, status: number) => json({ error: { code } }, status);

async function ownerError(request: Request) {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return failure("unauthorized", 401);
  return request.headers.get("x-account-owner") === session.userId ? null : failure("account_changed", 409);
}

async function run(name: "customer_get_billing_profile" | "customer_save_billing_profile", args: Record<string, unknown> = {}) {
  const client = await createInsforgeServerClient();
  const { data, error } = await client.database.schema("public").rpc(name, args);
  if (error) {
    const mapped: Record<string, [string, number]> = { unauthenticated: ["unauthorized", 401], invalid_input: ["invalid_billing_profile", 400], version_conflict: ["conflict", 409] };
    const entry = error.code === "P0001" && typeof error.details === "string" ? mapped[error.details] : undefined;
    return entry ? failure(...entry) : failure("backend_unavailable", 503);
  }
  const billingProfile = parseBillingProfile(data);
  return billingProfile ? json({ billingProfile }) : failure("backend_unavailable", 503);
}

export async function GET(request: Request) {
  try {
    const denied = await ownerError(request);
    return denied ?? await run("customer_get_billing_profile");
  } catch { return failure("backend_unavailable", 503); }
}

export async function PUT(request: Request) {
  try {
    const denied = await ownerError(request);
    if (denied) return denied;
    if (!isSameOriginRequest(request)) return failure("same_origin_required", 403);
    if (!isJsonContentType(request.headers.get("content-type"))) return failure("application_json_required", 415);
    const body = await readBoundedBody(request, 4096);
    if (!body.ok) return failure(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)); }
    catch { return failure("invalid_json", 400); }
    const input = parseBillingProfileInput(value);
    return input ? await run("customer_save_billing_profile", {
      p_expected_version: input.expectedVersion,
      p_business_name: input.businessName,
      p_contact_email: input.contactEmail,
      p_gstin: input.gstin,
    }) : failure("invalid_billing_profile", 400);
  } catch { return failure("backend_unavailable", 503); }
}
