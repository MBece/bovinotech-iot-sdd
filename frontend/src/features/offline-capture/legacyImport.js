// Copies the preliminary capture pending events into this module (FR-019, R3).
// The legacy database `bovinotech_offline` is only read: it is never created,
// upgraded, modified or deleted.
import { ORIGIN, SYNC_STATUS, VALIDATION_STATUS } from './eventTypes.js';

const LEGACY_DB_NAME = 'bovinotech_offline';
const LEGACY_STORE = 'sanitary_events';
const COPIED_STATUSES = ['PENDING_SYNC', 'REJECTED'];

/**
 * Legacy records have no farm and may lack the author: they take the farm
 * (and author, if missing) of the user who imports them.
 */
export const mapLegacyEvent = (record, session) => ({
  clientEventId: record.clientEventId,
  eventType: record.eventType,
  din: record.din,
  animalName: null,
  fieldOccurredAt: record.fieldOccurredAt,
  product: null,
  doseQuantity: record.dose ?? null,
  doseUnit: null,
  reason: null,
  finding: null,
  notes: record.notes ?? null,
  authorEmail: record.authorEmail || session.authorEmail,
  farmId: session.farmId,
  authorVerificationPending: false,
  syncStatus: SYNC_STATUS.PENDING,
  validationStatus: VALIDATION_STATUS.PENDING,
  savedAt: record.fieldOccurredAt,
  origin: ORIGIN.LEGACY,
});

/** Returns how many events were copied. Idempotent. */
export const importLegacyEvents = async ({ source, repository, session }) => {
  const records = await source.getAll();
  const candidates = records.filter((record) => COPIED_STATUSES.includes(record.status));
  if (candidates.length === 0) return 0;

  const existing = new Set((await repository.getAll()).map((event) => event.clientEventId));
  let copied = 0;
  for (const record of candidates) {
    if (existing.has(record.clientEventId)) continue;
    try {
      await repository.add(mapLegacyEvent(record, session));
      copied += 1;
    } catch {
      // Another tab copied it meanwhile: add() never overwrites.
    }
  }
  return copied;
};

/**
 * Read-only source over the legacy IndexedDB. Opening without a version never
 * upgrades an existing database; if it does not exist, the creation is
 * aborted in onupgradeneeded so nothing is created.
 */
export const createLegacySource = (indexedDBImpl = globalThis.indexedDB) => ({
  getAll: () =>
    new Promise((resolve) => {
      if (!indexedDBImpl) {
        resolve([]);
        return;
      }
      const request = indexedDBImpl.open(LEGACY_DB_NAME);
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => resolve([]);
      request.onblocked = () => resolve([]);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LEGACY_STORE)) {
          database.close();
          resolve([]);
          return;
        }
        const read = database.transaction(LEGACY_STORE, 'readonly').objectStore(LEGACY_STORE).getAll();
        read.onsuccess = () => {
          database.close();
          resolve(read.result ?? []);
        };
        read.onerror = () => {
          database.close();
          resolve([]);
        };
      };
    }),
});
