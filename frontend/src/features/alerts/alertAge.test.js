import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatPositionAge } from './alertAge.js';

const NOW = new Date('2026-11-24T15:00:00.000Z');

describe('formatPositionAge', () => {
  it('formats recent positions without implying real-time precision', () => {
    assert.equal(
      formatPositionAge('2026-11-24T14:59:45.000Z', NOW),
      'hace menos de un minuto',
    );
  });

  it('formats minutes, hours and days', () => {
    assert.equal(formatPositionAge('2026-11-24T14:35:00.000Z', NOW), 'hace 25 min');
    assert.equal(formatPositionAge('2026-11-24T12:00:00.000Z', NOW), 'hace 3 h');
    assert.equal(formatPositionAge('2026-11-21T15:00:00.000Z', NOW), 'hace 3 d');
  });

  it('handles invalid dates safely', () => {
    assert.equal(formatPositionAge('fecha-invalida', NOW), 'antigüedad desconocida');
  });
});
