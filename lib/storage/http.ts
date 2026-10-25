import { operationalJson } from "../observability/events.ts";

export const MAX_ACCOUNT_FILE_REQUEST_BYTES = 96 * 1024;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function accountFilesJson(
  body: unknown,
  status = 200,
): Response {
  return operationalJson(body, status, PRIVATE_HEADERS, "account_files");
}

export function accountFilesError(
  status: number,
  code: string,
  message: string,
): Response {
  return accountFilesJson({ error: { code, message } }, status);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readBoundedBody(
  request: Request,
  maxBytes = MAX_ACCOUNT_FILE_REQUEST_BYTES,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" | "invalid" }> {
  const lengthHeader = request.headers.get("content-length");
  const declaredLength = lengthHeader === null ? null : Number(lengthHeader);

  if (
    declaredLength !== null &&
    (!Number.isSafeInteger(declaredLength) || declaredLength < 0)
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (declaredLength !== null && declaredLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) {
    return { ok: false, reason: "invalid" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  } finally {
    reader.releaseLock();
  }

  if (declaredLength !== null && declaredLength !== total) {
    return { ok: false, reason: "invalid" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, bytes };
}
