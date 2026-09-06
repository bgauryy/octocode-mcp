import { openAwarenessStore } from '@octocodeai/octocode-awareness';
import { openOctocodeDb as openExtensionStateDb } from '@octocodeai/agent-contracts/db';
import { isPersistentStorageEnabled } from '@octocodeai/config';
import { extensionStateDbPath } from '../extension-paths.js';

export const PERSISTENT_AWARENESS_DISABLED_MESSAGE =
  'Persistent storage is disabled (storage.mode=memory); Awareness state is unavailable';

/** Assert the shared persistence boundary without opening or creating a store. */
export function assertPersistentAwarenessEnabled(): void {
  if (!isPersistentStorageEnabled()) throw new Error(PERSISTENT_AWARENESS_DISABLED_MESSAGE);
}

/** Open SQLite state only when the resolved policy permits machine persistence. */
export function openOctocodeDb(): ReturnType<typeof openExtensionStateDb> {
  if (!isPersistentStorageEnabled()) {
    throw new Error(
      'Persistent storage is disabled (storage.mode=memory); SQLite state is unavailable',
    );
  }
  return openExtensionStateDb(extensionStateDbPath());
}

/** Open durable Awareness state only when machine persistence is enabled. */
export function openPersistentAwareness(
  options: Parameters<typeof openAwarenessStore>[0],
): ReturnType<typeof openAwarenessStore> {
  assertPersistentAwarenessEnabled();
  return openAwarenessStore(options);
}
