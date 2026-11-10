import { readFile } from 'node:fs/promises';

// Private snapshots may live in another worktree; never copy them into source.
const supplied = process.env.PANDA_TEST_RAG_SNAPSHOT;
const path = supplied || new URL('../../artifacts/phase-4/native-snapshot.json', import.meta.url);
export const runtimeSnapshot = await readFile(path, 'utf8').then(JSON.parse).catch(error => {
    if (!supplied && error.code === 'ENOENT') return null;
    throw error;
});
