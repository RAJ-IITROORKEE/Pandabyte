import { createHash } from "node:crypto";
import { createAdminClient } from "@insforge/sdk";
import { editorialAccess, editorialDatabaseError, editorialError, editorialHeaders } from "@/lib/editorial/http";
import { UUID_PATTERN } from "@/lib/editorial/validation";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { INQUIRY_BUCKET, MAX_INQUIRY_ATTACHMENT_BYTES } from "@/lib/contact/attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id, attachmentId } = await params;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(attachmentId)) return editorialError("not_found", 404);
  try {
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc("admin_inquiry_attachment", { p_inquiry_id: id, p_id: attachmentId });
    if (result.error) return editorialDatabaseError(result.error);
    const file = result.data as { key: string; size: number; sha256: string; filename: string };
    if (!file || !/^inquiries\/[0-9a-f-]{36}\/[0-2]-[0-9a-f]{64}$/.test(file.key) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_INQUIRY_ATTACHMENT_BYTES || !/^[0-9a-f]{64}$/.test(file.sha256) || !file.key.endsWith(file.sha256) || !/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,115}\.(pdf|jpe?g|png|webp)$/i.test(file.filename)) return editorialError("upload_unavailable", 503);
    const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL?.trim(), apiKey = process.env.INSFORGE_EDITORIAL_STORAGE_READ_KEY?.trim();
    if (!baseUrl || !apiKey) return editorialError("upload_unavailable", 503);
    const download = await createAdminClient({ baseUrl, apiKey }).storage.from(INQUIRY_BUCKET).download(file.key);
    if (download.error || !download.data || download.data.size !== file.size) return editorialError("upload_unavailable", 503);
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    if (bytes.byteLength !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) return editorialError("upload_unavailable", 503);
    return new Response(bytes, { headers: { ...editorialHeaders, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${file.filename}"`, "Content-Length": String(file.size) } });
  } catch { return editorialError("upload_unavailable", 503); }
}
