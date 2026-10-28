import type { prepareEditorialDownload } from "./media-delivery";

type Preview = NonNullable<Awaited<ReturnType<typeof prepareEditorialDownload>>>;
type Media = { objectKey: string; mimeType: string; byteSize: number; width: number | null; height: number | null };

export function createPreviewCache(maxEntries = 64, maxBytes = 16 * 1024 * 1024, maxPending = 16) {
  const entries = new Map<string, Preview>();
  const pending = new Map<string, Promise<Preview | undefined>>();
  let bytes = 0;
  function key(published: boolean, media: Media, size: number | undefined) {
    if (!published || !size || media.mimeType !== "image/webp" || !media.width || !media.height ||
      (media.width <= size && media.height <= size)) return null;
    return JSON.stringify([media.objectKey, media.mimeType, media.byteSize, media.width, media.height, size]);
  }
  return {
    prepare(published: boolean, media: Media, size: number | undefined, load: () => Promise<Preview | undefined>) {
      const k = key(published, media, size);
      if (!k) return load();
      const existing = pending.get(k);
      if (existing) return existing;
      // Bound tracked work; overflow keeps the existing independent download path.
      if (pending.size >= maxPending) return load();
      const task = Promise.resolve().then(load).finally(() => { pending.delete(k); });
      pending.set(k, task);
      return task;
    },
    get(published: boolean, media: Media, size: number | undefined) {
      const k = key(published, media, size);
      if (!k) return undefined;
      const value = entries.get(k);
      if (value) { entries.delete(k); entries.set(k, value); }
      return value;
    },
    set(published: boolean, media: Media, size: number | undefined, value: Preview) {
      const k = key(published, media, size);
      if (!k || value.bytes.byteLength > maxBytes || maxEntries < 1) return;
      const previous = entries.get(k);
      if (previous) { bytes -= previous.bytes.byteLength; entries.delete(k); }
      while (entries.size >= maxEntries || bytes + value.bytes.byteLength > maxBytes) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        bytes -= entries.get(oldest)!.bytes.byteLength;
        entries.delete(oldest);
      }
      entries.set(k, value);
      bytes += value.bytes.byteLength;
    },
  };
}

export const publicPreviewCache = createPreviewCache();
