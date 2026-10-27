export function helpPageHref(query: string, page: number, topic = ""): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (topic) params.set("topic", topic);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/help?${suffix}` : "/help";
}

export function helpTopic(value: unknown): string {
  if (typeof value !== "string") return "";
  const topic = value.trim();
  return topic.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(topic) ? topic : "";
}
