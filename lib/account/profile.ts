export type ProfilePatch = { displayName?: string; phone?: string };

export function parseProfilePatch(value: unknown): ProfilePatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length < 1 || keys.length > 2 || keys.some((key) => key !== "displayName" && key !== "phone")) {
    return null;
  }

  const patch: ProfilePatch = {};
  if (Object.hasOwn(body, "displayName")) {
    if (typeof body.displayName !== "string") return null;
    const displayName = body.displayName.trim();
    if (Array.from(displayName).length > 120) return null;
    patch.displayName = displayName;
  }

  if (Object.hasOwn(body, "phone")) {
    if (typeof body.phone !== "string") return null;
    const phone = body.phone.trim();
    if (Array.from(phone).length > 48 || /[\u0000-\u001f\u007f-\u009f]/u.test(phone)) return null;
    patch.phone = phone;
  }

  return patch;
}

export function parseDisplayNamePatch(value: unknown): { displayName: string } | null {
  const patch = parseProfilePatch(value);
  if (!patch || Object.hasOwn(patch, "phone") || typeof patch.displayName !== "string") return null;
  return { displayName: patch.displayName };
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
