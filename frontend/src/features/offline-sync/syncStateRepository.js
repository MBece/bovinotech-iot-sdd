// Sync state per event and run history (data-model.md `queue_state`, `runs`).
// It never touches HU-02 events, and sync states are never deleted (FR-007):
// "leaving the queue" means reaching a confirmed state.
import { QUEUE_STATE_STORE, RUNS_STORE } from './syncDbSchema.js';

export const RUNS_KEPT = 20;

export const createSyncStateRepository = (store) => ({
  async getStatusMap() {
    const states = await store.getAll(QUEUE_STATE_STORE);
    return new Map(states.map((state) => [state.client_event_id, state]));
  },

  saveStates: (states) => store.putMany(QUEUE_STATE_STORE, states),

  async recordRun(run) {
    await store.add(RUNS_STORE, run);
    const runs = (await store.getAll(RUNS_STORE)).sort((a, b) => a.id - b.id);
    const excess = runs.slice(0, Math.max(0, runs.length - RUNS_KEPT));
    if (excess.length) await store.deleteKeys(RUNS_STORE, excess.map((item) => item.id));
  },

  async listRuns() {
    return (await store.getAll(RUNS_STORE)).sort((a, b) => a.id - b.id);
  },
});
