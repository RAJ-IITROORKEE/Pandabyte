import { auth } from "@clerk/nextjs/server";

import {
  ACCOUNT_FILES_BUCKET,
  isAccountFileId,
  isSafeAccountFilename,
  MAX_ACCOUNT_FILE_BYTES,
  validateAccountTextFile,
} from "@/lib/storage/account-files";
import {
  accountFilesError,
  accountFilesJson,
  isSameOriginRequest,
} from "@/lib/storage/http";
import {
  isOwnedAccountFileKey,
  removeAccountFileObject,
} from "@/lib/storage/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";

type RouteContext = { params: Promise<{ id: string }> };
type FileRecord = {
  id: string;
  object_key: string;
  filename: string;
  byte_size: number;
};

async function getSession() {
  const session = await auth();

  if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) {
    return null;
  }

  return { userId: session.userId };
}

async function getFile(
  client: Awaited<ReturnType<typeof createInsforgeServerClient>>,
  id: string,
): Promise<{ file: FileRecord | null; failed: boolean }> {
  const { data, error } = await client.database
    .schema("public")
    .from("account_files")
    .select("id,object_key,filename,byte_size")
    .eq("id", id)
    .maybeSingle();

  return {
    file: (data as FileRecord | null) ?? null,
    failed: Boolean(error),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return accountFilesError(401, "unauthorized", "Sign in to download this file.");
    }

    const { id } = await context.params;
    if (!isAccountFileId(id)) {
      return accountFilesError(404, "not_found", "This file was not found.");
    }

    const client = await createInsforgeServerClient();
    const result = await getFile(client, id);
    if (result.failed) {
      return accountFilesError(503, "storage_unavailable", "Your file is temporarily unavailable.");
    }

    const file = result.file;
    if (
      !file ||
      !isOwnedAccountFileKey(file.object_key, session.userId, id) ||
      !isSafeAccountFilename(file.filename)
    ) {
      return accountFilesError(404, "not_found", "This file was not found.");
    }

    const { data: blob, error } = await client.storage
      .from(ACCOUNT_FILES_BUCKET)
      .download(file.object_key);

    if (error || !blob || blob.size !== file.byte_size || blob.size > MAX_ACCOUNT_FILE_BYTES) {
      return accountFilesError(503, "storage_unavailable", "Your file is temporarily unavailable.");
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== file.byte_size || bytes.byteLength > MAX_ACCOUNT_FILE_BYTES) {
      return accountFilesError(503, "storage_unavailable", "Your file is temporarily unavailable.");
    }

    if (
      !validateAccountTextFile({
        filename: file.filename,
        mimeType: blob.type,
        bytes,
      }).ok
    ) {
      return accountFilesError(503, "storage_unavailable", "Your file is temporarily unavailable.");
    }

    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return accountFilesError(503, "storage_unavailable", "Your file is temporarily unavailable.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return accountFilesError(401, "unauthorized", "Sign in to delete this file.");
    }

    if (!isSameOriginRequest(request)) {
      return accountFilesError(403, "forbidden", "This request is not allowed.");
    }

    const { id } = await context.params;
    if (!isAccountFileId(id)) {
      return accountFilesError(404, "not_found", "This file was not found.");
    }

    const client = await createInsforgeServerClient();
    const result = await getFile(client, id);
    if (result.failed) {
      return accountFilesError(503, "storage_unavailable", "Your file could not be deleted. Please try again.");
    }

    const file = result.file;
    if (!file || !isOwnedAccountFileKey(file.object_key, session.userId, id)) {
      return accountFilesError(404, "not_found", "This file was not found.");
    }

    if (!(await removeAccountFileObject(client, file.object_key))) {
      return accountFilesError(503, "storage_unavailable", "Your file could not be deleted. Please try again.");
    }

    const { error } = await client.database
      .schema("public")
      .from("account_files")
      .delete()
      .eq("id", id);

    if (error) {
      return accountFilesError(503, "storage_unavailable", "Your file could not be deleted. Please try again.");
    }

    return accountFilesJson({ data: { deleted: true } });
  } catch {
    return accountFilesError(503, "storage_unavailable", "Your file could not be deleted. Please try again.");
  }
}
