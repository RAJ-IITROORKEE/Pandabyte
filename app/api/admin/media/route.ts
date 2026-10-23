import { randomUUID } from "node:crypto";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
import { editorialAccess, editorialError, editorialJson, editorialRpc, editorialDatabaseError } from "@/lib/editorial/http";
import { prepareEditorialFile } from "@/lib/editorial/media";
import { boundedText, EDITORIAL_MEDIA_BUCKET, MAX_MEDIA_REQUEST_BYTES, parseListQuery } from "@/lib/editorial/validation";

export async function GET(request: Request) {
  const access = await editorialAccess("media.manage");
  if (access instanceof Response) return access;
  const query = parseListQuery(request.url);
  return query && !query.status ? editorialRpc("admin_list_media", { p_query: query.query, p_limit: query.limit, p_offset: query.offset }) : editorialError("invalid_query", 400);
}

export async function POST(request: Request) {
  const access = await editorialAccess("media.manage");
  if (access instanceof Response) return access;
  if (!isSameOriginRequest(request)) return editorialError("same_origin_required", 403);
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return editorialError("multipart_required", 415);
  const body = await readBoundedBody(request, MAX_MEDIA_REQUEST_BYTES);
  if (!body.ok) return editorialError("invalid_upload", body.reason === "too_large" ? 413 : 400);
  let compensate: (() => Promise<void>) | null = null;
  try {
    const form = await new Response(new Uint8Array(body.bytes), { headers: { "content-type": contentType } }).formData();
    if ([...form.keys()].some((key) => !["file", "altText", "source"].includes(key)) ||
      [...new Set(form.keys())].some((key) => form.getAll(key).length > 1)) return editorialError("invalid_upload", 400);
    const file = form.get("file"), altText = boundedText(form.get("altText"), 300, true), source = boundedText(form.get("source") ?? "", 500);
    if (!(file instanceof File) || altText === null || source === null) return editorialError("invalid_upload", 400);
    const prepared = await prepareEditorialFile(file);
    if (!prepared) return editorialError("invalid_media_file", 400);
    const id = randomUUID(), objectKey = `assets/${id}.${prepared.extension}`;
    const client = await createInsforgeServerClient(), bucket = client.storage.from(EDITORIAL_MEDIA_BUCKET);
    compensate = async () => {
      try {
        const cleanup = await bucket.remove(objectKey);
        if (cleanup.error && cleanup.error.statusCode !== 404) console.error("[editorial-media] upload outcome requires reconciliation");
      } catch { console.error("[editorial-media] upload outcome requires reconciliation"); }
    };
    const upload = await bucket.upload(objectKey, new File([new Uint8Array(prepared.bytes)], `${id}.${prepared.extension}`, { type: prepared.mimeType }));
    if (upload.error || !upload.data || upload.data.key !== objectKey) {
      await compensate();
      return editorialError("upload_unavailable", 503);
    }
    const { data, error } = await client.database.schema("public").rpc("admin_register_media", {
      p_id: id, p_key: objectKey, p_url: upload.data.url, p_filename: file.name.replace(/\.[^.]+$/, `.${prepared.extension}`),
      p_mime: prepared.mimeType, p_size: prepared.bytes.byteLength, p_width: prepared.width, p_height: prepared.height,
      p_alt: altText, p_source: source,
    });
    if (error) {
      await compensate();
      return editorialDatabaseError(error);
    }
    return editorialJson(data, 201);
  } catch {
    if (compensate) await compensate();
    return editorialError("upload_unavailable", 503);
  }
}
