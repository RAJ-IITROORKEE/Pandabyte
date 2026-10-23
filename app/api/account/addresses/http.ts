import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export const MAX_ADDRESS_REQUEST_BYTES = 8192;

export function addressJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: PRIVATE_HEADERS });
}

export function addressError(code: string, status: number): Response {
  return addressJson({ error: { code } }, status);
}

export async function activeCustomerSession() {
  const session = await auth();
  return session.isAuthenticated && session.sessionStatus === "active" && session.userId
    ? { userId: session.userId }
    : null;
}

export async function readAddressBody(request: Request): Promise<{ value: unknown } | Response> {
  if (!isSameOriginRequest(request)) return addressError("same_origin_required", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return addressError("application_json_required", 415);
  }

  const body = await readBoundedBody(request, MAX_ADDRESS_REQUEST_BYTES);
  if (!body.ok) {
    return addressError(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
  }

  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)) as unknown };
  } catch {
    return addressError("invalid_json", 400);
  }
}

const RPC_ERRORS: Record<string, { code: string; status: number }> = {
  unauthenticated: { code: "unauthorized", status: 401 },
  invalid_input: { code: "invalid_address", status: 400 },
  not_found: { code: "not_found", status: 404 },
  version_conflict: { code: "conflict", status: 409 },
  too_many_addresses: { code: "too_many_addresses", status: 409 },
};

export async function customerAddressRpc(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ data: unknown } | { response: Response }> {
  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.schema("public").rpc(name, args);
    if (!error) return { data };

    const failure = error as unknown as { code?: unknown; details?: unknown };
    if (failure.code === "P0001" && typeof failure.details === "string") {
      const mapped = RPC_ERRORS[failure.details];
      if (mapped) return { response: addressError(mapped.code, mapped.status) };
    }
    return { response: addressError("backend_unavailable", 503) };
  } catch {
    return { response: addressError("backend_unavailable", 503) };
  }
}
