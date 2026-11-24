import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from './memoryStore.js';
import { createCaptureRepository } from './captureRepository.js';
import { createCaptureSaver } from './saveCapture.js';

const now = () => new Date('2026-11-21T13:45:10.000Z');
const catalog = new Set(['DIN-DEMO-000001']);
const session = { authorEmail: 'operario@bovinotech.co', farmId: 1, authorVerificationPending: false };
const validForm = { eventType: 'CHECKUP', din: 'DIN-DEMO-000001', finding: 'Sin hallazgos' };

const setup = (repositoryOverride) => {
  const repository = repositoryOverride ?? createCaptureRepository(createMemoryStore());
  return { repository, saver: createCaptureSaver({ repository, now }) };
};

test('a valid event is saved once', async () => {
  const { repository, saver } = setup();

  const result = await saver.save({ form: validForm, session, catalog });

  assert.equal(result.ok, true);
  assert.equal(result.event.syncStatus, 'PENDIENTE_SINCRONIZACION');
  assert.deepEqual((await repository.getAll()).map((e) => e.clientEventId), [result.event.clientEventId]);
});

test('an invalid event is not saved and returns its codes', async () => {
  const { repository, saver } = setup();

  const result = await saver.save({
    form: { eventType: 'VACCINATION', din: 'DIN-DEMO-999999' },
    session,
    catalog,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['ANIMAL_NOT_IN_CATALOG', 'PRODUCT_REQUIRED', 'DOSE_REQUIRED']);
  assert.deepEqual(await repository.getAll(), []);
});

test('two concurrent saves of the same form store a single event (double tap)', async () => {
  const { repository, saver } = setup();

  const results = await Promise.all([
    saver.save({ form: validForm, session, catalog }),
    saver.save({ form: validForm, session, catalog }),
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).busy, true);
  assert.equal((await repository.getAll()).length, 1);
});

test('a write failure is not confirmed and keeps previous events intact', async () => {
  const base = createCaptureRepository(createMemoryStore());
  const { saver: firstSaver } = setup(base);
  const first = await firstSaver.save({ form: validForm, session, catalog });
  const failing = {
    ...base,
    add: async () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    },
  };
  const { saver } = setup(failing);

  const result = await saver.save({ form: validForm, session, catalog });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['STORAGE_WRITE_FAILED']);
  assert.match(result.message, /No se pudo guardar el evento en el dispositivo/);
  assert.deepEqual((await base.getAll()).map((e) => e.clientEventId), [first.event.clientEventId]);
});

test('the lock is released after a failure so the user can retry', async () => {
  const { repository, saver } = setup();
  await saver.save({ form: { eventType: 'CHECKUP', din: 'DIN-DEMO-000001' }, session, catalog });

  const retry = await saver.save({ form: validForm, session, catalog });

  assert.equal(retry.ok, true);
  assert.equal((await repository.getAll()).length, 1);
});

test('saving never calls the network (FR-004, FR-017)', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('network must not be used');
  };
  try {
    const { saver } = setup();
    await saver.save({ form: validForm, session, catalog });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 0);
});
