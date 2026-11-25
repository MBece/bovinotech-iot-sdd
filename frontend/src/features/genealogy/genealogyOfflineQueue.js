import { GENEALOGY_QUEUE_KEY, GENEALOGY_REJECTED_KEY } from './genealogyConstants.js';
import { sameOwner } from './genealogySession.js';

export { GENEALOGY_QUEUE_KEY, GENEALOGY_REJECTED_KEY };
export const GENEALOGY_CORRUPT_SUFFIX = '_corrupt';

const AUTH_STATUSES = new Set([401, 403]);
const TRANSIENT_STATUSES = new Set([408, 429]);

const isEntry = (item) =>
  Boolean(item) && typeof item === 'object' && typeof item.client_event_id === 'string';

/**
 * Tolerant read (H-05): corrupt JSON or a non-array value is set aside under
 * `<key>_corrupt` (never lost) and the list is treated as empty; malformed
 * entries inside a valid array are skipped; unavailable storage reads as empty.
 */
const readList = (storage, key) => {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null || raw === undefined) return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = undefined;
  }
  if (!Array.isArray(value)) {
    try {
      storage.setItem(`${key}${GENEALOGY_CORRUPT_SUFFIX}`, raw);
      storage.setItem(key, '[]');
    } catch {
      // Storage unavailable: the list is still treated as empty.
    }
    return [];
  }
  return value.filter(isEntry);
};

const saveList = (storage, key, items) => {
  storage.setItem(key, JSON.stringify(items));
};

const ownerOf = (item) => item?.payload?.owner ?? null;

// Business rejection: a 4xx that is neither an auth problem nor transient.
const classify = (error) => {
  const status = typeof error?.status === 'number' ? error.status : null;
  if (status !== null && AUTH_STATUSES.has(status)) return 'AUTH';
  if (status !== null && status >= 400 && status < 500 && !TRANSIENT_STATUSES.has(status)) {
    return 'REJECTED';
  }
  return 'TRANSIENT';
};

/**
 * Offline Hub queue for genealogy captures (contracts/frontend.md).
 * payload: { kind: 'ANIMAL' | 'LINK' | 'LINK_CORRECTION', linkId?, body, owner }.
 * `owner` ({ userId, farmId }) is the session that captured the entry: only that
 * same user and farm ever sends it (H-01).
 */
export const createGenealogyOfflineQueue = ({
  storage = globalThis.localStorage,
  owner = null,
  now = () => new Date(),
  createId = () => globalThis.crypto.randomUUID(),
} = {}) => {
  const isOwn = (item) => sameOwner(ownerOf(item), owner);

  return {
    list() {
      return readList(storage, GENEALOGY_QUEUE_KEY);
    },

    listRejected() {
      return readList(storage, GENEALOGY_REJECTED_KEY).filter(isOwn);
    },

    pendingCount() {
      return readList(storage, GENEALOGY_QUEUE_KEY).filter(isOwn).length;
    },

    /** Entries captured on this device by another user or in another farm. */
    foreignCount() {
      return readList(storage, GENEALOGY_QUEUE_KEY).filter((item) => !isOwn(item)).length;
    },

    hasCorruptData() {
      try {
        return [GENEALOGY_QUEUE_KEY, GENEALOGY_REJECTED_KEY].some(
          (key) => storage.getItem(`${key}${GENEALOGY_CORRUPT_SUFFIX}`) !== null,
        );
      } catch {
        return false;
      }
    },

    enqueue(payload, clientEventId = createId()) {
      if (!owner) {
        throw new Error('La sesión no tiene usuario o finca activa: no se puede guardar el registro.');
      }
      const items = readList(storage, GENEALOGY_QUEUE_KEY);
      const existing = items.find((item) => item.client_event_id === clientEventId);
      if (existing) return existing;
      const event = {
        client_event_id: clientEventId,
        timestamp_utc: now().toISOString(),
        status: 'pending',
        payload: { ...payload, owner: { userId: owner.userId, farmId: owner.farmId } },
      };
      saveList(storage, GENEALOGY_QUEUE_KEY, [...items, event]);
      return event;
    },

    /**
     * Sends the current owner's entries in FIFO order; other owners' entries
     * are left untouched. 401/403 pause the run keeping the entry pending;
     * network errors, 5xx, 408 and 429 mark it failed (retryable) and stop so
     * that later entries are not sent out of order; other 4xx are rejections.
     */
    async synchronize(send) {
      const own = readList(storage, GENEALOGY_QUEUE_KEY).filter(isOwn);
      let synced = 0;
      let rejectedCount = 0;
      const setStatus = (id, status) => {
        const items = readList(storage, GENEALOGY_QUEUE_KEY).map((item) =>
          item.client_event_id === id ? { ...item, status } : item,
        );
        saveList(storage, GENEALOGY_QUEUE_KEY, items);
      };
      const remove = (id) => {
        saveList(
          storage,
          GENEALOGY_QUEUE_KEY,
          readList(storage, GENEALOGY_QUEUE_KEY).filter((item) => item.client_event_id !== id),
        );
      };
      const summary = (paused) => ({
        synced,
        rejected: rejectedCount,
        remaining: readList(storage, GENEALOGY_QUEUE_KEY).filter(isOwn).length,
        paused,
      });

      for (const event of own) {
        const previous = event.status;
        setStatus(event.client_event_id, 'syncing');
        try {
          await send(event.payload);
          synced += 1;
          remove(event.client_event_id);
        } catch (error) {
          const kind = classify(error);
          if (kind === 'AUTH') {
            setStatus(event.client_event_id, previous === 'failed' ? 'failed' : 'pending');
            return summary('AUTH');
          }
          if (kind === 'TRANSIENT') {
            setStatus(event.client_event_id, 'failed');
            return summary(null);
          }
          const rejected = readList(storage, GENEALOGY_REJECTED_KEY);
          rejected.push({
            client_event_id: event.client_event_id,
            timestamp_utc: event.timestamp_utc,
            payload: event.payload,
            error: { code: error.code ?? `HTTP_${error.status}`, message: error.message },
          });
          saveList(storage, GENEALOGY_REJECTED_KEY, rejected);
          rejectedCount += 1;
          remove(event.client_event_id);
        }
      }
      return summary(null);
    },
  };
};
