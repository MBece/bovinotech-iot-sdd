// Which events go next and in which batches (research R9, R11). Pure.
import { FAILURE_KIND, FINAL_STATES, SYNC_STATE } from './syncDbSchema.js';

export const BATCH_SIZE = 50;

const isDue = (state, now, manual) => {
  if (!state || state.status === SYNC_STATE.PENDING) return true;
  if (FINAL_STATES.includes(state.status) || state.status === SYNC_STATE.SYNCING) return false;
  if (state.status === SYNC_STATE.FAILED) {
    if (state.failure_kind === FAILURE_KIND.FINAL) return false;
    if (manual || !state.next_attempt_at) return true;
    return Date.parse(state.next_attempt_at) <= now.getTime();
  }
  return false;
};

const byCaptureTime = (a, b) =>
  Date.parse(a.fieldOccurredAt) - Date.parse(b.fieldOccurredAt) ||
  a.clientEventId.localeCompare(b.clientEventId);

/** Events of the signed-in author ready to send, oldest capture first. */
export const selectDueEvents = (events, statusMap, now, { authorEmail, manual = false } = {}) =>
  events
    .filter((event) => event.authorEmail === authorEmail)
    .filter((event) => isDue(statusMap.get(event.clientEventId), now, manual))
    .sort(byCaptureTime);

export const chunkBatches = (events, size = BATCH_SIZE) => {
  const batches = [];
  for (let start = 0; start < events.length; start += size) batches.push(events.slice(start, start + size));
  return batches;
};

/** CapturedEvent payload: HU-02 event without its client-only fields. */
export const toCapturedPayload = (event) => {
  // eslint-disable-next-line no-unused-vars
  const { animalName, savedAt, ...payload } = event;
  return payload;
};
