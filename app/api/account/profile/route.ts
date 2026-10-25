import { auth } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { operationalJson } from "@/lib/observability/events";
import {
  isJsonContentType,
  isSameOrigin,
  parseProfilePatch,
  readProfilePatchBody,
} from "@/lib/account/profile";

const profileFields = "display_name, phone, created_at";
const privateHeaders = { "Cache-Control": "private, no-store" };

function errorResponse(code: string, status: number) {
  return operationalJson({ error: code }, status, privateHeaders, "account_profile");
}

async function activeUserId() {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  return isAuthenticated && sessionStatus === "active" ? userId : null;
}

export async function GET() {
  const userId = await activeUserId();
  if (!userId) return errorResponse("unauthorized", 401);

  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database
      .schema("public")
      .from("customer_profiles")
      .select(profileFields)
      .eq("user_id", userId)
      .limit(1);

    if (error) return errorResponse("profile_unavailable", 503);
    return Response.json({ profile: data?.[0] ?? null }, { headers: privateHeaders });
  } catch {
    return errorResponse("profile_unavailable", 503);
  }
}

export async function PATCH(request: Request) {
  const userId = await activeUserId();
  if (!userId) return errorResponse("unauthorized", 401);
  if (!isSameOrigin(request.url, request.headers.get("origin"))) {
    return errorResponse("same_origin_required", 403);
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return errorResponse("application_json_required", 415);
  }

  const body = await readProfilePatchBody(request);
  if (!body.ok) {
    return errorResponse(body.status === 413 ? "payload_too_large" : "invalid_json", body.status);
  }

  const patch = parseProfilePatch(body.value);
  if (!patch) return errorResponse("invalid_profile_patch", 400);

  const values: { display_name?: string; phone?: string } = {};
  if (patch.displayName !== undefined) values.display_name = patch.displayName;
  if (patch.phone !== undefined) values.phone = patch.phone;

  try {
    const client = await createInsforgeServerClient();
    const profiles = client.database.schema("public").from("customer_profiles");
    const { data: updated, error: updateError } = await profiles
      .update(values)
      .eq("user_id", userId)
      .select(profileFields);

    if (updateError) return errorResponse("profile_unavailable", 503);
    if (updated?.[0]) {
      return Response.json({ profile: updated[0] }, { headers: privateHeaders });
    }

    const { data: inserted, error: insertError } = await client.database
      .schema("public")
      .from("customer_profiles")
      .insert([{ user_id: userId, ...values }])
      .select(profileFields);

    if (!insertError && inserted?.[0]) {
      return Response.json({ profile: inserted[0] }, { headers: privateHeaders });
    }

    if ((insertError as { code?: string } | null)?.code === "23505") {
      const { data: retried, error: retryError } = await client.database
        .schema("public")
        .from("customer_profiles")
        .update(values)
        .eq("user_id", userId)
        .select(profileFields);

      if (!retryError && retried?.[0]) {
        return Response.json({ profile: retried[0] }, { headers: privateHeaders });
      }
    }

    return errorResponse("profile_unavailable", 503);
  } catch {
    return errorResponse("profile_unavailable", 503);
  }
}
