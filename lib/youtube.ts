const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const URL_PARTS = /^https:\/\/(youtu\.be|www\.youtu\.be|youtube\.com|www\.youtube\.com|m\.youtube\.com|youtube-nocookie\.com|www\.youtube-nocookie\.com)(?::443)?(\/[^?#]*)?(?:[?#]|$)/i;

export function youtubeVideoId(value: string): string | null {
  const candidate = value.trim();
  if (VIDEO_ID.test(candidate)) return candidate;
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return null;
  const parts = candidate.match(URL_PARTS);
  if (!parts) return null;
  const url = new URL(candidate);
  const values = url.searchParams.getAll("v");
  if (values.length > 1) return null;
  const path = parts[2] ?? "";
  const id = /^(?:www\.)?youtu\.be$/i.test(parts[1])
    ? path.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
    : /^\/watch\/?$/.test(path)
      ? values[0]
      : path.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  return id && VIDEO_ID.test(id) ? id : null;
}
