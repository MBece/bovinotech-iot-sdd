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
