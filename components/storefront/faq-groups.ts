export function faqGroups<T extends { document: { topic: string } }>(items: T[]) {
  return Map.groupBy(items, ({ document }) => document.topic.trim());
}
