export type QueuedPrompt = { id: string; threadId: string; text: string };
export function enqueuePrompt(queue: QueuedPrompt[], item: QueuedPrompt): QueuedPrompt[] {
  const text = item.text.trim();
  if (queue.length >= 3 || !item.id || !item.threadId || !text || text.length > 2000) return queue;
  return [...queue, { ...item, text }];
}
export function nextQueuedPrompt(queue: QueuedPrompt[], threadId: string): QueuedPrompt | null {
  return queue[0]?.threadId === threadId ? queue[0] : null;
}
