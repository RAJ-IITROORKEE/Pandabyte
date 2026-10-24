const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value: string): string | null {
  const candidate = value.trim();
  if (YOUTUBE_ID.test(candidate)) return candidate;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (["youtu.be", "www.youtu.be"].includes(host)) {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = url.pathname === "/watch" ? url.searchParams.get("v") ?? ""
    : ["embed", "shorts", "live"].includes(parts[0] ?? "") ? parts[1] ?? "" : "";
  return YOUTUBE_ID.test(id) ? id : null;
}

export function editorialSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  const query = value.trim();
  return query.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(query) ? query : "";
}

export function editorialPageNumber(value: unknown, pageSize: number): number {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 1;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * pageSize > 10_000) return 1;
  return page;
}
