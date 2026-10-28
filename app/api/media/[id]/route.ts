import "server-only";
import { createAdminClient } from "@insforge/sdk";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { getStaffAccess } from "@/lib/authorization";
import { editorialError, editorialHeaders } from "@/lib/editorial/http";
import { EDITORIAL_MEDIA_BUCKET, MAX_MEDIA_BYTES, UUID_PATTERN } from "@/lib/editorial/validation";
import { parseEditorialImageSize, prepareEditorialDownload } from "@/lib/editorial/media-delivery";
import { publicPreviewCache } from "@/lib/editorial/preview-cache";

type DownloadMedia = { id: string; objectKey: string; filename: string; mimeType: string; byteSize: number; width: number | null; height: number | null; modelSha256?: string | null; documentSha256?: string | null };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const imageSize = parseEditorialImageSize(new URL(request.url).searchParams);
  if (imageSize === null) return editorialError("invalid_image_size", 400);
  try {
    let client = createInsforgePublicClient();
    let result = await client.database.schema("public").rpc("public_get_media", { p_id: id });
    const published = !result.error && Boolean(result.data?.media);
    if (!published) {
      const access = await getStaffAccess();
      if (!access.allowed || !access.capabilities.some((cap) => ["media.manage", "content.edit", "catalog.edit"].includes(cap))) return editorialError("not_found", 404);
      client = await createInsforgeServerClient();
      result = await client.database.schema("public").rpc("editor_get_media", { p_id: id });
    }
    if (result.error || !result.data?.media) return editorialError("not_found", 404);
    const media = result.data.media as DownloadMedia;
    if (imageSize !== undefined && media.mimeType !== "image/webp") return editorialError("invalid_image_size", 400);
    if (media.id !== id || !Number.isSafeInteger(media.byteSize) || media.byteSize < 1 || media.byteSize > MAX_MEDIA_BYTES ||
      !new RegExp(`^assets/${id}\\.(webp|pdf|glb|docx)$`).test(media.objectKey)) return editorialError("media_unavailable", 503);
    // Restricted cloud migrations cannot grant anon access to the managed storage schema.
    // This privileged client is confined to an already-published, canonical editorial object.
    const readKey = process.env.INSFORGE_EDITORIAL_STORAGE_READ_KEY;
    if (published && !readKey) return editorialError("media_unavailable", 503);
    let prepared = publicPreviewCache.get(published, media, imageSize);
    if (!prepared) {
      const storageClient = published ? createAdminClient({
        baseUrl: process.env.NEXT_PUBLIC_INSFORGE_BASE_URL!,
        apiKey: readKey!,
      }) : client;
      const download = await storageClient.storage.from(EDITORIAL_MEDIA_BUCKET).download(media.objectKey);
      if (download.error || !download.data || download.data.size !== media.byteSize) return editorialError("media_unavailable", 503);
      prepared = await prepareEditorialDownload(Buffer.from(await download.data.arrayBuffer()), media, imageSize) ?? undefined;
    }
    if (!prepared || !media.objectKey.endsWith(`.${prepared.extension}`)) return editorialError("media_unavailable", 503);
    if (published) {
      const current = await client.database.schema("public").rpc("public_get_media", { p_id: id });
      const latest = current.data?.media as DownloadMedia | undefined;
      if (current.error || !latest || latest.objectKey !== media.objectKey || latest.mimeType !== media.mimeType ||
        latest.byteSize !== media.byteSize || latest.width !== media.width || latest.height !== media.height) return editorialError("not_found", 404);
      publicPreviewCache.set(true, media, imageSize, prepared);
    }
    return new Response(new Uint8Array(prepared.bytes), { headers: {
      ...editorialHeaders, "Content-Type": prepared.mimeType,
      "Content-Disposition": `${["pdf", "docx"].includes(prepared.extension) ? "attachment" : "inline"}; filename="${id}.${prepared.extension}"`,
    } });
  } catch { return editorialError("media_unavailable", 503); }
}
