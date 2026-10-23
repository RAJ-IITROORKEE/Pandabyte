export function parseDisplayNamePatch(value: unknown): { displayName: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.displayName !== "string") return null;

  const displayName = body.displayName.trim();
  return Array.from(displayName).length <= 120 ? { displayName } : null;
}

export function isJsonContentType(value: string | null): boolean {
  return value?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export function isSameOrigin(requestUrl: string, origin: string | null): boolean {
  if (!origin) return false;

  try {
    return new URL(requestUrl).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

export async function readProfilePatchBody(request: Request): Promise<BoundedJsonResult> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
