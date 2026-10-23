import "server-only";

import type { InsForgeClient } from "@insforge/sdk";

import {
  ACCOUNT_FILES_BUCKET,
  isAccountFileObjectKey,
} from "@/lib/storage/account-files";

export type AccountFilesClient = InsForgeClient;

export function accountFilesBucket(client: AccountFilesClient) {
  return client.storage.from(ACCOUNT_FILES_BUCKET);
}

export async function removeAccountFileObject(
  client: AccountFilesClient,
  key: string,
): Promise<boolean> {
  try {
    const { error } = await accountFilesBucket(client).remove(key);

    if (!error || error.statusCode === 404) {
      return true;
    }
  } catch {
    // Provider details and object keys stay out of application logs.
  }

  console.error("[account-files] storage cleanup failed");
  return false;
}

export function isOwnedAccountFileKey(
  key: string,
  userId: string,
  id: string,
): boolean {
  try {
    return isAccountFileObjectKey(key, userId, id);
  } catch {
    return false;
  }
}
