import { useSyncExternalStore } from 'react';
import { syncController } from './syncServices.js';

/** `{ online, running, lastRun, events, statusMap, syncNow, refresh }` (contracts §2). */
export const useSyncStatus = () => {
  const snapshot = useSyncExternalStore(syncController.subscribe, syncController.getSnapshot);
  return { ...snapshot, syncNow: syncController.syncNow, refresh: syncController.refresh };
};
