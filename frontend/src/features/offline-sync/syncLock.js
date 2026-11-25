// At most one sync run at a time per device (FR-004, R10): Web Locks across
// tabs, with an in-memory flag where the API is missing. Even if both failed,
// server idempotency prevents duplicates (R3).

export const SYNC_LOCK_NAME = 'bovinotech-offline-sync';

export const createSyncLock = ({ locks = globalThis.navigator?.locks } = {}) => {
  let busy = false;

  const withMemoryFlag = async (task) => {
    if (busy) return { skipped: true };
    busy = true;
    try {
      return { skipped: false, value: await task() };
    } finally {
      busy = false;
    }
  };

  return {
    async run(task) {
      if (!locks?.request) return withMemoryFlag(task);
      return locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return { skipped: true };
        return withMemoryFlag(task);
      });
    },
  };
};
