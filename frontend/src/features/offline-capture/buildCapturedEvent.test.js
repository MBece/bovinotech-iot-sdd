import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCapturedEvent } from './buildCapturedEvent.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const now = () => new Date('2026-11-21T13:45:10.000Z');
const session = { authorEmail: 'operario@bovinotech.co', farmId: 1, authorVerificationPending: false };
const form = {
  eventType: 'VACCINATION',
  din: ' din-demo-000001 ',
  product: ' Aftosa bivalente ',
  doseQuantity: '2',
  doseUnit: 'ml',
  reason: '',
  finding: '   ',
  notes: '',
};

test('generates a distinct UUID v4 per call', () => {
  const first = buildCapturedEvent({ form, session, now });
  const second = buildCapturedEvent({ form, session, now });

  assert.match(first.clientEventId, UUID_V4);
  assert.match(second.clientEventId, UUID_V4);
  assert.notEqual(first.clientEventId, second.clientEventId);
});

test('timestamps come from the injected clock and are not editable', () => {
  const event = buildCapturedEvent({
    form: { ...form, fieldOccurredAt: '2020-01-01T00:00:00Z' },
    session,
    now,
  });

  assert.equal(event.fieldOccurredAt, '2026-11-21T13:45:10.000Z');
  assert.equal(event.savedAt, '2026-11-21T13:45:10.000Z');
});

test('author, farm, animal name and initial states come from context', () => {
  const event = buildCapturedEvent({ form, session, now, animal: { din: 'DIN-DEMO-000001', name: 'Luna' } });

  assert.equal(event.authorEmail, 'operario@bovinotech.co');
  assert.equal(event.farmId, 1);
  assert.equal(event.animalName, 'Luna');
  assert.equal(event.authorVerificationPending, false);
  assert.equal(event.syncStatus, 'PENDIENTE_SINCRONIZACION');
  assert.equal(event.validationStatus, 'PENDIENTE_VALIDACION');
  assert.equal(event.origin, 'OFFLINE_CAPTURE');
});

test('expired session marks the author as pending verification', () => {
  const event = buildCapturedEvent({ form, session: { ...session, authorVerificationPending: true }, now });

  assert.equal(event.authorVerificationPending, true);
});

test('normalizes din, trims texts, blanks become null and dose is numeric', () => {
  const event = buildCapturedEvent({ form, session, now });

  assert.equal(event.din, 'DIN-DEMO-000001');
  assert.equal(event.product, 'Aftosa bivalente');
  assert.equal(event.doseQuantity, 2);
  assert.equal(event.reason, null);
  assert.equal(event.finding, null);
  assert.equal(event.notes, null);
  assert.equal(event.animalName, null);
});

test('fields of other event types are not stored', () => {
  const event = buildCapturedEvent({
    form: { ...form, eventType: 'CHECKUP', finding: 'Sin hallazgos' },
    session,
    now,
  });

  assert.equal(event.product, null);
  assert.equal(event.doseQuantity, null);
  assert.equal(event.doseUnit, null);
  assert.equal(event.finding, 'Sin hallazgos');
});
