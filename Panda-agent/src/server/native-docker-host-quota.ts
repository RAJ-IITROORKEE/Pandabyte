import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

const limit = 1;
async function syncDirectory(dir: string) { if (process.platform === 'win32') return; const handle = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }

// Fixed host-wide capacity. Slots survive crashes/expiry and are freed only
// after the lifecycle has positively confirmed exact-container removal.
export function reserveDockerHostSlot(directory: string, leaseName: string): Promise<Readonly<{ release(): Promise<void> }>>;
export function reserveDockerHostSlot(directory: string, leaseName: string, busyIsNull: true): Promise<Readonly<{ release(): Promise<void> }> | null>;
export async function reserveDockerHostSlot(directory: string, leaseName: string, busyIsNull = false) {
  if (!path.isAbsolute(directory) || !/^panda-n45-[a-f0-9]{32}$/.test(leaseName)) throw Error('Invalid host admission');
  const st = await lstat(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || process.platform !== 'win32' && ((st.mode & 0o077) !== 0 || typeof process.getuid === 'function' && st.uid !== process.getuid())) throw Error('Invalid host admission');
  const dir = await realpath(directory);
  for (let n = 0; n < limit; n++) {
    const file = path.join(dir, `slot-${n}`);
    let handle;
    try { handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
    try { await handle.writeFile(leaseName + '\n'); await handle.sync(); } finally { await handle.close(); }
    await syncDirectory(dir);
    let releaseStarted = false;
    return Object.freeze({ async release() {
      if (releaseStarted) throw Error('Host slot already released');
      releaseStarted = true;
      const reader = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const before = await reader.stat(), value = await reader.readFile('utf8'), current = await lstat(file);
        if (!before.isFile() || current.isSymbolicLink() || before.dev !== current.dev || before.ino !== current.ino || value !== leaseName + '\n') throw Error('Host slot ownership unverified');
        await unlink(file); await syncDirectory(dir);
      } finally { await reader.close(); }
    } });
  }
  if (busyIsNull) return null;
  throw Error('Native host capacity unavailable');
}

/** Frees `lease`'s slot file after a restart. Only call once the caller proved the lease's container is removed. Returns false when the lease holds no slot. */
export async function releaseStaleDockerHostSlot(directory: string, leaseName: string): Promise<boolean> {
  if (!path.isAbsolute(directory) || !/^panda-n45-[a-f0-9]{32}$/.test(leaseName)) throw Error('Invalid host admission');
  const dir = await realpath(directory);
  for (let n = 0; n < limit; n++) {
    const file = path.join(dir, `slot-${n}`);
    let reader;
    try { reader = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    try {
      const before = await reader.stat(), value = await reader.readFile('utf8');
      if (value !== leaseName + '\n') continue;
      const current = await lstat(file);
      if (!before.isFile() || current.isSymbolicLink() || before.dev !== current.dev || before.ino !== current.ino) throw Error('Host slot ownership unverified');
      await unlink(file); await syncDirectory(dir); return true;
    } finally { await reader.close(); }
  }
  return false;
}
