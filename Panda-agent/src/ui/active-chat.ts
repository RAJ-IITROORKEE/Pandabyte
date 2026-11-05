type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const key = (userId: string) => `panda-agent:active-chat:${userId}`;

export function readActiveChat(storage: StorageAccess, userId: string): string | null {
  try { const value = storage?.getItem(key(userId)); return value && uuid.test(value) ? value : null; } catch { return null; }
}
export function writeActiveChat(storage: StorageAccess, userId: string, id: string): void {
  try { if (uuid.test(id)) storage?.setItem(key(userId), id); } catch { /* Storage is optional. */ }
}
export function clearActiveChat(storage: StorageAccess, userId: string): void {
  try { storage?.removeItem(key(userId)); } catch { /* Storage is optional. */ }
}
