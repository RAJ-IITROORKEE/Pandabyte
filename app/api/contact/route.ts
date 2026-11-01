import { createHash } from "node:crypto";
import { createAdminClient } from "@insforge/sdk";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { editorialBody, editorialDatabaseError, editorialError, editorialJson } from "@/lib/editorial/http";
import { parseInquiryInput } from "@/lib/editorial/validation";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
import { INQUIRY_BUCKET, MAX_INQUIRY_REQUEST_BYTES, prepareInquiryAttachment, type InquiryAttachment } from "@/lib/contact/attachments";
import { validInquiryPhone } from "@/lib/contact/phone";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return editorialError("same_origin_required", 403);
  const submissionKey = process.env.CONTACT_SUBMISSION_KEY?.trim();
  let origin: URL;
  try { origin = new URL(process.env.CONTACT_SITE_ORIGIN ?? ""); } catch { return editorialError("contact_unconfigured", 503); }
  if (!/^[0-9a-f]{64}$/.test(submissionKey ?? "") || origin.origin !== new URL(request.url).origin || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || !["http:", "https:"].includes(origin.protocol) || (origin.protocol === "http:" && !["localhost", "127.0.0.1"].includes(origin.hostname))) return editorialError("contact_unconfigured", 503);
  let fields: unknown;
  let files: File[] = [];
  const contentType = request.headers.get("content-type") ?? "";
  if (/^multipart\/form-data\s*;/i.test(contentType)) {
    const body = await readBoundedBody(request, MAX_INQUIRY_REQUEST_BYTES);
    if (!body.ok) return editorialError("invalid_upload", body.reason === "too_large" ? 413 : 400);
    try {
      const form = await new Response(new Uint8Array(body.bytes), { headers: { "content-type": contentType } }).formData();
      const allowed = ["name", "email", "phone", "subject", "message", "idempotencyKey", "challengeToken", "attachments"];
      if ([...form.keys()].some(key => !allowed.includes(key) || (key !== "attachments" && form.getAll(key).length > 1))) return editorialError("invalid_inquiry", 400);
      const entries = form.getAll("attachments");
      if (entries.length > 3 || entries.some(value => !(value instanceof File))) return editorialError("invalid_upload", 400);
      files = entries as File[];
      fields = Object.fromEntries([...form.entries()].filter(([key]) => key !== "attachments" && key !== "challengeToken"));
    } catch { return editorialError("invalid_upload", 400); }
  } else {
    const body = await editorialBody(request, 32768);
    if (body instanceof Response) return body;
    if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) return editorialError("invalid_inquiry", 400);
    const { challengeToken: _ignored, ...rest } = body.value as Record<string, unknown>;
    void _ignored;
    fields = rest;
  }
  const inquiry = parseInquiryInput(fields);
  if (!inquiry || !validInquiryPhone(inquiry.phone)) return editorialError("invalid_inquiry", 400);
  const attachments: InquiryAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const prepared = await prepareInquiryAttachment(files[i], inquiry.idempotencyKey, i);
    if (!prepared) return editorialError("invalid_attachment", 400);
    attachments.push(prepared);
  }
  const storageKey = process.env.INSFORGE_EDITORIAL_STORAGE_READ_KEY?.trim();
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL?.trim();
  if (attachments.length && (!storageKey || !baseUrl)) return editorialError("upload_unavailable", 503);
  try {
    const client = createInsforgePublicClient();
    const { data, error } = await client.database.schema("public").rpc("submit_inquiry_with_attachments", {
      p_name: inquiry.name, p_email: inquiry.email, p_phone: inquiry.phone, p_subject: inquiry.subject,
      p_message: inquiry.message, p_request_id: inquiry.idempotencyKey, p_submission_key: submissionKey,
      p_attachments: attachments.map(({ filename, mimeType, size, sha256, key }) => ({ filename, mimeType, size, sha256, key })),
    });
    if (error) return editorialDatabaseError(error);
    if (data?.attachmentsReady === true) return editorialJson(data, 201);
    if (attachments.length) {
      const bucket = createAdminClient({ baseUrl: baseUrl!, apiKey: storageKey! }).storage.from(INQUIRY_BUCKET);
      for (const attachment of attachments) {
        const uploaded = await bucket.upload(attachment.key, new File([new Uint8Array(attachment.bytes)], attachment.filename, { type: attachment.mimeType }));
        if (uploaded.error || !uploaded.data || uploaded.data.key !== attachment.key) {
          const previous = await bucket.download(attachment.key);
          if (previous.error || !previous.data || previous.data.size !== attachment.size || createHash("sha256").update(Buffer.from(await previous.data.arrayBuffer())).digest("hex") !== attachment.sha256) return editorialError("upload_unavailable", 503);
        }
      }
      const done = await client.database.schema("public").rpc("finish_inquiry_attachments", { p_request_id: inquiry.idempotencyKey, p_submission_key: submissionKey });
      if (done.error) return editorialError("upload_unavailable", 503);
    }
    return editorialJson(data, 201);
  } catch { return editorialError("inquiry_unavailable", 503); }
}
