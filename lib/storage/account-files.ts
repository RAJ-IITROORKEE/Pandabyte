export const ACCOUNT_FILES_BUCKET = "private-account-files";
export const ACCOUNT_FILES_LIMIT = 50;
export const MAX_ACCOUNT_FILE_BYTES = 64 * 1024;

const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,115}\.txt$/i;
const FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

export type TextFileValidation =
  | { ok: true; text: string }
  | {
      ok: false;
      reason:
        | "filename"
        | "type"
        | "empty"
        | "too_large"
        | "encoding"
        | "characters";
    };

export function isAccountFileId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isSafeAccountFilename(value: string): boolean {
  return value.length <= 120 && FILENAME_PATTERN.test(value);
}

export function accountFileObjectKey(userId: string, id: string): string {
  if (!isAccountFileId(id) || !userId || /[\\/\u0000-\u001f]/.test(userId)) {
    throw new Error("Invalid account file identity.");
  }

  return `${userId}/${id}.txt`;
}

export function isAccountFileObjectKey(
  key: string,
  userId: string,
  id: string,
): boolean {
  return isAccountFileId(id) && key === accountFileObjectKey(userId, id);
}

export function validateAccountTextFile(input: {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}): TextFileValidation {
  if (!isSafeAccountFilename(input.filename)) {
    return { ok: false, reason: "filename" };
  }

  if (input.mimeType.toLowerCase() !== "text/plain") {
    return { ok: false, reason: "type" };
  }

  if (input.bytes.byteLength === 0) {
    return { ok: false, reason: "empty" };
  }

  if (input.bytes.byteLength > MAX_ACCOUNT_FILE_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch {
    return { ok: false, reason: "encoding" };
  }

  if (FORBIDDEN_CONTROLS.test(text)) {
    return { ok: false, reason: "characters" };
  }

  return { ok: true, text };
}
