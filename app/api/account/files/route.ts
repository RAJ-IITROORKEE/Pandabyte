import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";

import {
  ACCOUNT_FILES_BUCKET,
  ACCOUNT_FILES_LIMIT,
  MAX_ACCOUNT_FILE_BYTES,
  accountFileObjectKey,
  validateAccountTextFile,
} from "@/lib/storage/account-files";
import {
  accountFilesError,
  accountFilesJson,
  isSameOriginRequest,
  readBoundedBody,
} from "@/lib/storage/http";
import { removeAccountFileObject } from "@/lib/storage/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";

type FileMetadata = {
  id: string;
  filename: string;
  byte_size: number;
  created_at: string;
};

async function getSession() {
  const session = await auth();

  if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) {
    return null;
  }

  return { userId: session.userId };
}

function validationError(reason: string): Response {
  switch (reason) {
    case "too_large":
      return accountFilesError(413, "file_too_large", "Files must be 64 KiB or smaller.");
    case "filename":
      return accountFilesError(400, "invalid_filename", "Use a .txt filename with letters, numbers, spaces, dots, hyphens, or underscores.");
    case "type":
      return accountFilesError(400, "invalid_file_type", "Only text/plain UTF-8 .txt files are allowed.");
    case "empty":
      return accountFilesError(400, "empty_file", "Choose a non-empty text file.");
    case "encoding":
      return accountFilesError(400, "invalid_encoding", "The file must contain valid UTF-8 text.");
    case "characters":
      return accountFilesError(400, "invalid_text", "The file contains unsupported control characters.");
    default:
      return accountFilesError(400, "invalid_request", "Choose one valid text file to upload.");
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return accountFilesError(401, "unauthorized", "Sign in to view your files.");
    }

    const client = await createInsforgeServerClient();
    const { data, error } = await client.database
      .schema("public")
      .from("account_files")
      .select("id,filename,byte_size,created_at")
      .order("created_at", { ascending: false })
      .limit(ACCOUNT_FILES_LIMIT);

    if (error || !data) {
      return accountFilesError(503, "storage_unavailable", "Your files are temporarily unavailable.");
    }

    const files = (data as FileMetadata[]).map(({ id, filename, byte_size, created_at }) => ({
      id,
      filename,
      byte_size,
      created_at,
    }));

    return accountFilesJson({ data: files });
  } catch {
    return accountFilesError(503, "storage_unavailable", "Your files are temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  let userId: string;

  try {
    const session = await getSession();
    if (!session) {
      return accountFilesError(401, "unauthorized", "Sign in to upload a file.");
    }
    userId = session.userId;

    if (!isSameOriginRequest(request)) {
      return accountFilesError(403, "forbidden", "This request is not allowed.");
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data\s*;/i.test(contentType)) {
      return accountFilesError(400, "invalid_request", "Choose one valid text file to upload.");
    }

    const body = await readBoundedBody(request);
    if (!body.ok) {
      return body.reason === "too_large"
        ? validationError("too_large")
        : validationError("invalid_request");
    }

    let form: FormData;
    try {
      const multipartBody = body.bytes.buffer as ArrayBuffer;
      form = await new Response(multipartBody, {
        headers: { "content-type": contentType },
      }).formData();
    } catch {
      return validationError("invalid_request");
    }

    const fileValue = form.get("file");
    if (
      Array.from(form.keys()).length !== 1 ||
      !fileValue ||
      typeof fileValue === "string" ||
      typeof fileValue.arrayBuffer !== "function"
    ) {
      return validationError("invalid_request");
    }

    if (fileValue.size > MAX_ACCOUNT_FILE_BYTES) {
      return validationError("too_large");
    }

    if (fileValue.size === 0) {
      return validationError("empty");
    }

    const bytes = new Uint8Array(await fileValue.arrayBuffer());
    const validation = validateAccountTextFile({
      filename: fileValue.name,
      mimeType: fileValue.type,
      bytes,
    });

    if (!validation.ok) {
      return validationError(validation.reason);
    }

    const id = randomUUID();
    const objectKey = accountFileObjectKey(userId, id);
    const client = await createInsforgeServerClient();
    const bucket = client.storage.from(ACCOUNT_FILES_BUCKET);

    let uploaded;
    try {
      uploaded = await bucket.upload(objectKey, fileValue);
    } catch {
      await removeAccountFileObject(client, objectKey);
      return accountFilesError(503, "storage_unavailable", "The file could not be saved. Please try again.");
    }

    if (
      uploaded.error ||
      !uploaded.data ||
      uploaded.data.key !== objectKey ||
      typeof uploaded.data.url !== "string"
    ) {
      await removeAccountFileObject(client, objectKey);
      return accountFilesError(503, "storage_unavailable", "The file could not be saved. Please try again.");
    }

    let inserted;
    try {
      inserted = await client.database
        .schema("public")
        .from("account_files")
        .insert([
          {
            id,
            object_key: objectKey,
            storage_url: uploaded.data.url,
            filename: fileValue.name,
            byte_size: bytes.byteLength,
          },
        ])
        .select("id,filename,byte_size,created_at")
        .single();
    } catch {
      await removeAccountFileObject(client, objectKey);
      return accountFilesError(503, "storage_unavailable", "The file could not be saved. Please try again.");
    }

    if (inserted.error || !inserted.data) {
      await removeAccountFileObject(client, objectKey);
      return accountFilesError(503, "storage_unavailable", "The file could not be saved. Please try again.");
    }

    const file = inserted.data as FileMetadata;
    return accountFilesJson(
      {
        data: {
          id: file.id,
          filename: file.filename,
          byte_size: file.byte_size,
          created_at: file.created_at,
        },
      },
      201,
    );
  } catch {
    return accountFilesError(503, "storage_unavailable", "The file could not be saved. Please try again.");
  }
}
