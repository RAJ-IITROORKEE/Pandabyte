export async function findActiveSingleton(
  loadPage: (offset: number) => Promise<{ items: { id: string; archived: boolean }[]; total: number }>,
): Promise<string | null> {
  for (let offset = 0; offset <= 10000; offset += 100) {
    const result = await loadPage(offset);
    const existing = result.items.find((item) => !item.archived);
    if (existing) return existing.id;
    if (offset + result.items.length >= result.total) return null;
    if (result.items.length < 100) throw new Error("Unable to check all records. Try again later.");
  }
  throw new Error("Unable to check all records. Try again later.");
}
