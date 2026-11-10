import { isChatModelId, type ChatModelId } from './capabilities.ts';
export type QueuedPrompt = { id: string; threadId: string; text: string; modelId?: ChatModelId };
export function enqueuePrompt(queue: QueuedPrompt[], item: QueuedPrompt): QueuedPrompt[] {
  const text = item.text.trim();
  if ((item.modelId !== undefined && !isChatModelId(item.modelId)) || queue.length >= 3 || !item.id || !item.threadId || !text || text.length > 2000) return queue;
  return [...queue, { ...item, text }];
}
export function nextQueuedPrompt(queue: QueuedPrompt[], threadId: string): QueuedPrompt | null {
  return queue[0]?.threadId === threadId ? queue[0] : null;
}

export function queuedModelReady(item:QueuedPrompt, models:readonly {id:string;enabled:boolean}[]):boolean {
  return !!item.modelId && models.some(model => model.id === item.modelId && model.enabled);
}
