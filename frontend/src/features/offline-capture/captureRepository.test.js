import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from './memoryStore.js';
import { createCaptureRepository } from './captureRepository.js';

const event = (overrides = {}) => ({
  clientEventId: crypto.randomUUID(),
  eventType: 'CHECKUP',
  din: 'DIN-DEMO-000001',
  fieldOccurredAt: '2026-11-21T13:00:00.000Z',
  finding: 'Sin hallazgos',
  authorEmail: 'operario@bovinotech.co',
  farmId: 1,
  syncStatus: 'PENDIENTE_SINCRONIZACION',
  validationStatus: 'PENDIENTE_VALIDACION',
  origin: 'OFFLINE_CAPTURE',
  ...overrides,
});

test('add stores the event', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const saved = event();

  await repository.add(saved);

  assert.deepEqual(await repository.getAll(), [saved]);
});

test('adding the same clientEventId twice fails and keeps the original', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const original = event({ finding: 'original' });
  await repository.add(original);

  await assert.rejects(repository.add({ ...original, finding: 'overwrite' }));

  assert.deepEqual(await repository.getAll(), [original]);
});

test('the repository exposes no update or delete operation (FR-016)', () => {
  const repository = createCaptureRepository(createMemoryStore());

  assert.deepEqual(Object.keys(repository).sort(), ['add', 'getAll', 'listPending']);
});

test('stored events cannot be mutated through returned objects', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const saved = event();
  await repository.add(saved);

  const [copy] = await repository.getAll();
  copy.finding = 'tampered';

  assert.equal((await repository.getAll())[0].finding, 'Sin hallazgos');
});

test('listPending filters by author and farm, newest first', async () => {
  const repository = createCaptureRepository(createMemoryStore());
  const older = event({ fieldOccurredAt: '2026-11-21T10:00:00.000Z' });
  const newer = event({ fieldOccurredAt: '2026-11-21T12:00:00.000Z' });
  await repository.add(older);
  await repository.add(newer);
  await repository.add(event({ authorEmail: 'vet@bovinotech.co' }));
  await repository.add(event({ farmId: 2 }));

  const pending = await repository.listPending({ authorEmail: 'operario@bovinotech.co', farmId: 1 });

  assert.deepEqual(
    pending.map((item) => item.clientEventId),
    [newer.clientEventId, older.clientEventId],
  );
});
