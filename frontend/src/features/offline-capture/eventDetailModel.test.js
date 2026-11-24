import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventDetail } from './eventDetailModel.js';

const event = (overrides = {}) => ({
  clientEventId: '7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f',
  eventType: 'TREATMENT',
  din: 'DIN-DEMO-000001',
  animalName: 'Luna',
  fieldOccurredAt: '2026-11-21T13:45:00.000Z',
  product: 'Oxitetraciclina',
  doseQuantity: 500,
  doseUnit: 'mg',
  reason: 'Neumonía',
  finding: null,
  notes: null,
  authorEmail: 'operario@bovinotech.co',
  farmId: 1,
  authorVerificationPending: false,
  syncStatus: 'PENDIENTE_SINCRONIZACION',
  validationStatus: 'PENDIENTE_VALIDACION',
  origin: 'OFFLINE_CAPTURE',
  ...overrides,
});

test('returns the two states separately with explicit text', () => {
  const detail = buildEventDetail(event());

  assert.deepEqual(detail.states, [
    { kind: 'sync', title: 'Sincronización', label: 'Pendiente de sincronización' },
    { kind: 'validation', title: 'Validación', label: 'Pendiente de validación veterinaria' },
  ]);
});

test('adds the author verification state only when pending', () => {
  const detail = buildEventDetail(event({ authorVerificationPending: true }));

  assert.equal(detail.states.length, 3);
  assert.deepEqual(detail.states[2], {
    kind: 'author',
    title: 'Autor',
    label: 'Pendiente de verificación de autor',
  });
});

test('includes only the fields of the event type, dose as quantity and unit', () => {
  const detail = buildEventDetail(event());

  assert.deepEqual(detail.fields, [
    { label: 'Producto', value: 'Oxitetraciclina' },
    { label: 'Dosis', value: '500 mg' },
    { label: 'Motivo', value: 'Neumonía' },
  ]);
});

test('checkup shows the finding and optional notes', () => {
  const detail = buildEventDetail(
    event({ eventType: 'CHECKUP', product: null, doseQuantity: null, doseUnit: null, reason: null, finding: 'Cojera', notes: 'Revisar en 3 días' }),
  );

  assert.deepEqual(detail.fields, [
    { label: 'Hallazgo u observación', value: 'Cojera' },
    { label: 'Observaciones', value: 'Revisar en 3 días' },
  ]);
});

test('header has type, animal, capture time and identifier', () => {
  const detail = buildEventDetail(event(), { timeZone: 'America/Bogota' });

  assert.equal(detail.typeLabel, 'Tratamiento');
  assert.equal(detail.animalLabel, 'DIN-DEMO-000001 · Luna');
  assert.match(detail.capturedAtLabel, /8:45/);
  assert.equal(detail.clientEventId, '7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f');
});

test('exposes no edit action', () => {
  const detail = buildEventDetail(event());

  for (const key of Object.keys(detail)) {
    assert.doesNotMatch(key, /edit|delete|remove|update/i);
  }
});
