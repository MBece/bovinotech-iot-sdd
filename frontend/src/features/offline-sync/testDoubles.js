// Test doubles for the sync engine (not a test file: no `.test.js` suffix).
import { createMemorySyncStore } from './syncStore.js';
import { createSyncStateRepository } from './syncStateRepository.js';

export const AUTHOR = 'operario@bovinotech.co';

export const capturedEvent = (index, overrides = {}) => ({
  clientEventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  eventType: 'CHECKUP',
  din: 'DIN-DEMO-000001',
  animalName: 'Luna',
  fieldOccurredAt: new Date(Date.UTC(2026, 10, 23, 0, 0) + index * 60_000).toISOString(),
  product: null,
  doseQuantity: null,
  doseUnit: null,
  reason: null,
  finding: `Revisión ${index}`,
  notes: null,
  authorEmail: AUTHOR,
  farmId: 1,
  authorVerificationPending: false,
  syncStatus: 'PENDIENTE_SINCRONIZACION',
  validationStatus: 'PENDIENTE_VALIDACION',
  savedAt: null,
  origin: 'OFFLINE_CAPTURE',
  ...overrides,
});

/** Read-only HU-02 repository double that fails loudly on any write. */
export const captureRepositoryOf = (events) => ({
  writes: 0,
  async getAll() {
    return structuredClone(events);
  },
  async add() {
    this.writes += 1;
    throw new Error('HU-03 must never write HU-02 events');
  },
});

/**
 * Idempotent fake server: one record per clientEventId. `failNext` makes the
 * next N sends store the batch but lose the response (cut mid-response).
 */
export const createFakeServer = ({ now = () => new Date('2026-11-24T12:00:00Z') } = {}) => {
  const records = new Map();
  const server = {
    records,
    requests: [],
    lostResponses: 0,
    transientIds: new Set(),
    nextStatus: null,
    handle(items) {
      const results = items.map((item, index) => {
        if (server.transientIds.has(item.clientEventId)) {
          return { index, clientEventId: item.clientEventId, status: 'FALLIDO', retryable: true, errorCode: 'STORAGE_BUSY', detail: 'El servidor no pudo registrar el evento. Se reintentará.', receivedAt: null, requiresTimestampReview: false };
        }
        if (records.has(item.clientEventId)) {
          return { index, clientEventId: item.clientEventId, status: 'DUPLICADO', retryable: null, errorCode: null, detail: 'El evento ya estaba registrado en el servidor.', receivedAt: records.get(item.clientEventId).receivedAt, requiresTimestampReview: false };
        }
        const receivedAt = now().toISOString();
        records.set(item.clientEventId, { ...item, receivedAt });
        return { index, clientEventId: item.clientEventId, status: 'SINCRONIZADO', retryable: null, errorCode: null, detail: null, receivedAt, requiresTimestampReview: false };
      });
      return { batchId: server.requests.length, serverTime: now().toISOString(), results };
    },
  };
  return server;
};

/** Transport double backed by the fake server. */
export const transportFor = (server) => ({
  async send(items) {
    server.requests.push(items.map((item) => item.clientEventId));
    if (server.nextStatus) {
      const status = server.nextStatus;
      server.nextStatus = null;
      return { ok: false, status, body: null };
    }
    const body = server.handle(items);
    if (server.lostResponses > 0) {
      server.lostResponses -= 1;
      return { transportError: 'NETWORK' };
    }
    return { ok: true, status: 200, body };
  },
});

export const newStateRepository = () => createSyncStateRepository(createMemorySyncStore());
