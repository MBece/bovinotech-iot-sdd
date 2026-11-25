import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCapturedEvent, ERROR_MESSAGES } from './eventValidation.js';

const shared = JSON.parse(
  readFileSync(
    new URL('../../../../specs/002-offline-capture/contracts/captured-event.cases.json', import.meta.url),
    'utf8',
  ),
);
const now = new Date(shared.now);
const catalog = new Set(['DIN-DEMO-000001', 'DIN-DEMO-000002']);
const build = (patch) => ({ ...shared.base, ...patch });

for (const testCase of shared.cases) {
  test(`shared case: ${testCase.name}`, () => {
    assert.deepEqual(validateCapturedEvent(build(testCase.patch), { now, catalog }), testCase.errors);
  });
}

test('animal outside the active farm catalog is rejected first', () => {
  const event = build({ eventType: 'VACCINATION', din: 'DIN-DEMO-999999' });

  assert.deepEqual(validateCapturedEvent(event, { now, catalog }), [
    'ANIMAL_NOT_IN_CATALOG',
    'PRODUCT_REQUIRED',
    'DOSE_REQUIRED',
  ]);
});

test('din lookup ignores case and surrounding spaces', () => {
  const event = build({ eventType: 'CHECKUP', finding: 'Sin hallazgos', din: ' din-demo-000002 ' });

  assert.deepEqual(validateCapturedEvent(event, { now, catalog }), []);
});

test('device clock is strict: one second ahead is future', () => {
  const event = build({
    eventType: 'CHECKUP',
    finding: 'Sin hallazgos',
    fieldOccurredAt: new Date(now.getTime() + 1000).toISOString(),
  });

  assert.deepEqual(validateCapturedEvent(event, { now, catalog }), ['FUTURE_TIMESTAMP']);
});

test('notes longer than 500 characters are rejected', () => {
  const event = build({ eventType: 'CHECKUP', finding: 'ok', notes: 'x'.repeat(501) });

  assert.deepEqual(validateCapturedEvent(event, { now, catalog }), ['NOTES_TOO_LONG']);
});

test('every error code has a Spanish message', () => {
  for (const code of [
    'ANIMAL_NOT_IN_CATALOG',
    'FUTURE_TIMESTAMP',
    'INVALID_EVENT_TYPE',
    'PRODUCT_REQUIRED',
    'DOSE_REQUIRED',
    'DOSE_NOT_POSITIVE',
    'DOSE_UNIT_REQUIRED',
    'REASON_REQUIRED',
    'FINDING_REQUIRED',
    'NOTES_TOO_LONG',
    'STORAGE_WRITE_FAILED',
  ]) {
    assert.equal(typeof ERROR_MESSAGES[code], 'string', code);
  }
  assert.equal(ERROR_MESSAGES.ANIMAL_NOT_IN_CATALOG, 'El animal no existe en el catálogo de esta finca.');
});

// HU-03 QA-01: `origin` is declared by the client, so LEGACY only skips the
// required-field rules; the rules that do not depend on the data age apply.
test('legacy event with a non-positive dose is rejected', () => {
  for (const doseQuantity of [-5, 0]) {
    const event = build({ eventType: 'VACCINATION', origin: 'LEGACY', doseQuantity, doseUnit: 'ml' });
    assert.deepEqual(validateCapturedEvent(event, { now }), ['DOSE_NOT_POSITIVE']);
  }
});

test('legacy event with a unit outside the allowed units is rejected', () => {
  for (const doseUnit of ['litros', 'x'.repeat(200)]) {
    const event = build({ eventType: 'VACCINATION', origin: 'LEGACY', doseQuantity: 2, doseUnit });
    assert.deepEqual(validateCapturedEvent(event, { now }), ['DOSE_UNIT_REQUIRED']);
  }
});

test('legacy event keeps tolerating the missing product, unit, reason and finding', () => {
  for (const eventType of ['VACCINATION', 'TREATMENT', 'CHECKUP']) {
    const event = build({ eventType, origin: 'LEGACY', doseQuantity: eventType === 'CHECKUP' ? null : 2 });
    assert.deepEqual(validateCapturedEvent(event, { now }), [], eventType);
  }
});

// HU-03 QA-11: a non-finite dose is never valid. The server rejects it as a
// type error (INVALID_FIELD); the device shows it next to the dose field.
test('non-finite dose is rejected for any origin', () => {
  const doses = [Infinity, -Infinity, NaN, 'Infinity', 'NaN', '1e400', Number('1e400')];
  for (const origin of ['OFFLINE_CAPTURE', 'LEGACY']) {
    for (const doseQuantity of doses) {
      const event = build({ eventType: 'VACCINATION', product: 'Aftosa', origin, doseQuantity, doseUnit: 'ml' });
      assert.deepEqual(validateCapturedEvent(event, { now }), ['DOSE_NOT_POSITIVE'], `${origin} ${doseQuantity}`);
    }
  }
});
