// Captured events repository (FR-010, FR-011, FR-016).
// Insert-only: there is deliberately no update or delete operation. HU-03 keeps
// sync state in its own store and reads events through getAll().
import { EVENTS_STORE } from './captureDbSchema.js';
import { SYNC_STATUS } from './eventTypes.js';

const newestFirst = (a, b) => Date.parse(b.fieldOccurredAt) - Date.parse(a.fieldOccurredAt);

export const createCaptureRepository = (store) => ({
  /** Rejects if an event with the same clientEventId already exists. */
  add: (event) => store.add(EVENTS_STORE, event),

  /** Every event in the device, for HU-03 (contracts §3). */
  getAll: () => store.getAll(EVENTS_STORE),

  /** Pending events of the user in the farm, newest first. */
  async listPending({ authorEmail, farmId }) {
    const events = await store.getAllFromIndex(EVENTS_STORE, 'byAuthorFarm', [authorEmail, farmId]);
    return events.filter((event) => event.syncStatus === SYNC_STATUS.PENDING).sort(newestFirst);
  },
});
