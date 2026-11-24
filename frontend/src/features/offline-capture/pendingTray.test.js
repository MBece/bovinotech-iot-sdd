import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingTray } from './pendingTrayModel.js';

const user = { authorEmail: 'operario@bovinotech.co', farmId: 1 };
const event = (overrides = {}) => ({
  clientEventId: crypto.randomUUID(),
  eventType: 'CHECKUP',
  din: 'DIN-DEMO-000001',
  animalName: 'Luna',
  fieldOccurredAt: '2026-11-21T13:45:00.000Z',
  authorEmail: 'operario@bovinotech.co',
  farmId: 1,
  authorVerificationPending: false,
  syncStatus: 'PENDIENTE_SINCRONIZACION',
  validationStatus: 'PENDIENTE_VALIDACION',
  origin: 'OFFLINE_CAPTURE',
  ...overrides,
});

test('orders from newest to oldest', () => {
  const older = event({ fieldOccurredAt: '2026-11-21T08:00:00.000Z' });
  const newer = event({ fieldOccurredAt: '2026-11-21T12:00:00.000Z' });

  const tray = buildPendingTray([older, newer], user);

  assert.deepEqual(tray.map((item) => item.clientEventId), [newer.clientEventId, older.clientEventId]);
});

test('formats the original capture time in local time', () => {
  const [item] = buildPendingTray([event()], { ...user, timeZone: 'America/Bogota' });

  assert.match(item.capturedAtLabel, /8:45/);
  assert.match(item.capturedAtLabel, /21\/11\/2026/);
});

test('shows only the user events in the active farm', () => {
  const mine = event();
  const tray = buildPendingTray(
    [mine, event({ authorEmail: 'vet@bovinotech.co' }), event({ farmId: 2 })],
    user,
  );

  assert.deepEqual(tray.map((item) => item.clientEventId), [mine.clientEventId]);
});

test('each item shows animal, type, both states and the legacy mark', () => {
  const [item] = buildPendingTray([event({ origin: 'LEGACY', animalName: null })], user);

  assert.equal(item.animalLabel, 'DIN-DEMO-000001');
  assert.equal(item.typeLabel, 'Chequeo clínico');
  assert.equal(item.syncLabel, 'Pendiente de sincronización');
  assert.equal(item.validationLabel, 'Pendiente de validación veterinaria');
  assert.equal(item.legacyLabel, 'Capturado con la versión anterior');
});

test('items expose no edit or delete action (FR-016)', () => {
  const [item] = buildPendingTray([event()], user);

  for (const key of Object.keys(item)) {
    assert.doesNotMatch(key, /edit|delete|remove|update/i);
  }
});

test('builds 1,000 events in under 300 ms (SC-007)', () => {
  const events = Array.from({ length: 1000 }, (_, index) =>
    event({ fieldOccurredAt: new Date(Date.UTC(2026, 10, 1) + index * 60000).toISOString() }),
  );

  const started = performance.now();
  const tray = buildPendingTray(events, user);
  const elapsed = performance.now() - started;

  assert.equal(tray.length, 1000);
  assert.ok(elapsed < 300, `took ${elapsed} ms`);
});

test('syncLabelOf replaces the sync label (HU-03 extension point)', () => {
  const mine = event();
  const [item] = buildPendingTray([mine], { ...user, syncLabelOf: (e) => `estado de ${e.clientEventId}` });

  assert.equal(item.syncLabel, `estado de ${mine.clientEventId}`);
});

test('without syncLabelOf the default label is kept', () => {
  const [item] = buildPendingTray([event()], user);

  assert.equal(item.syncLabel, 'Pendiente de sincronización');
});
