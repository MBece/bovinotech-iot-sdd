import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from './memoryStore.js';
import { createCaptureRepository } from './captureRepository.js';
import { importLegacyEvents, mapLegacyEvent } from './legacyImport.js';

const session = { authorEmail: 'operario@bovinotech.co', farmId: 1 };
const legacy = (overrides = {}) => ({
  clientEventId: crypto.randomUUID(),
  din: 'DIN-DEMO-000001',
  eventType: 'VACCINATION',
  fieldOccurredAt: '2026-11-20T09:15:00.000Z',
  dose: 2,
  notes: 'Lote viejo',
  authorEmail: 'operario@bovinotech.co',
  status: 'PENDING_SYNC',
  ...overrides,
});

/** Read-only source double that records any attempt to write. */
const sourceOf = (records) => {
  const writes = [];
  return {
    writes,
    getAll: async () => structuredClone(records),
    save: async () => writes.push('save'),
    updateStatus: async () => writes.push('updateStatus'),
  };
};

test('maps a legacy record keeping its original data', () => {
  const record = legacy();

  assert.deepEqual(mapLegacyEvent(record, session), {
    clientEventId: record.clientEventId,
    eventType: 'VACCINATION',
    din: 'DIN-DEMO-000001',
    animalName: null,
    fieldOccurredAt: '2026-11-20T09:15:00.000Z',
    product: null,
    doseQuantity: 2,
    doseUnit: null,
    reason: null,
    finding: null,
    notes: 'Lote viejo',
    authorEmail: 'operario@bovinotech.co',
    farmId: 1,
    authorVerificationPending: false,
    syncStatus: 'PENDIENTE_SINCRONIZACION',
    validationStatus: 'PENDIENTE_VALIDACION',
    savedAt: '2026-11-20T09:15:00.000Z',
    origin: 'LEGACY',
  });
});

test('copies only PENDING_SYNC and REJECTED records', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const pending = legacy();
  const rejected = legacy({ status: 'REJECTED' });
  const source = sourceOf([pending, rejected, legacy({ status: 'SYNCED' })]);

  const copied = await importLegacyEvents({ source, repository, session });

  assert.equal(copied, 2);
  assert.deepEqual(
    (await repository.getAll()).map((event) => event.clientEventId).sort(),
    [pending.clientEventId, rejected.clientEventId].sort(),
  );
});

test('repeating the copy does not duplicate events', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const source = sourceOf([legacy(), legacy()]);

  await importLegacyEvents({ source, repository, session });
  const secondRun = await importLegacyEvents({ source, repository, session });

  assert.equal(secondRun, 0);
  assert.equal((await repository.getAll()).length, 2);
});

test('never writes to the legacy source', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const source = sourceOf([legacy(), legacy({ status: 'REJECTED' })]);

  await importLegacyEvents({ source, repository, session });

  assert.deepEqual(source.writes, []);
});

test('a missing legacy database copies nothing', async () => {
  const repository = createCaptureRepository(createMemoryStore());

  const copied = await importLegacyEvents({ source: { getAll: async () => [] }, repository, session });

  assert.equal(copied, 0);
});

test('records without author take the importing user', () => {
  const mapped = mapLegacyEvent(legacy({ authorEmail: undefined }), session);

  assert.equal(mapped.authorEmail, 'operario@bovinotech.co');
});
