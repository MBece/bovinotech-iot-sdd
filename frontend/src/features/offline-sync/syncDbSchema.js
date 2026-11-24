// Own IndexedDB database of the sync state (research R8, constitution §2.2).
// HU-02 events are never stored here: only their sync state, by client_event_id.

export const SYNC_DB_NAME = 'bovinotech_offline_sync_queue';
export const SYNC_DB_VERSION = 1;

export const QUEUE_STATE_STORE = 'queue_state';
export const RUNS_STORE = 'runs';

export const SYNC_DB_SCHEMA = {
  [QUEUE_STATE_STORE]: {
    keyPath: 'client_event_id',
    indexes: { byStatus: 'status', byOwner: ['author_email', 'status'] },
  },
  [RUNS_STORE]: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {},
  },
};

/** Sync states (data-model.md `queue_state.status`). */
export const SYNC_STATE = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  FAILED: 'failed',
  SYNCED: 'synced',
  DUPLICATE: 'duplicate',
};

export const FINAL_STATES = [SYNC_STATE.SYNCED, SYNC_STATE.DUPLICATE];

export const FAILURE_KIND = { TRANSIENT: 'transient', FINAL: 'final' };
