// Groups sidebar chats by last activity in the viewer's local time, newest group first; input order is kept within a group.
export type ChatGroup<T> = { label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older'; items: T[] };

const DAY = 86_400_000;
const startOfDay = (time: number) => { const d = new Date(time); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function groupChats<T extends { updatedAt: string }>(chats: readonly T[], now: number): ChatGroup<T>[] {
  const today = startOfDay(now);
  const order: ChatGroup<T>['label'][] = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];
  const buckets = new Map(order.map(label => [label, [] as T[]]));
  for (const chat of chats) {
    const t = Date.parse(chat.updatedAt);
    const label = !Number.isFinite(t) ? 'Older' : t >= today ? 'Today' : t >= today - DAY ? 'Yesterday' : t >= today - 7 * DAY ? 'Previous 7 days' : t >= today - 30 * DAY ? 'Previous 30 days' : 'Older';
    buckets.get(label)!.push(chat);
  }
  return order.map(label => ({ label, items: buckets.get(label)! })).filter(group => group.items.length > 0);
}
