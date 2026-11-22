import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SOURCE_LABELS, formatSourceLabel } from '../siniganSyncUtils.js';

describe('siniganSyncUtils source labels', () => {
  it('maps the raw field source code to a human label', () => {
    assert.equal(SOURCE_LABELS.REGISTRO_DE_CAMPO, 'REGISTRO DE CAMPO');
    assert.equal(formatSourceLabel('REGISTRO_DE_CAMPO'), 'REGISTRO DE CAMPO');
  });

  it('keeps values that are already labels or unknown codes', () => {
    assert.equal(formatSourceLabel('REGISTRO DE CAMPO'), 'REGISTRO DE CAMPO');
    assert.equal(
      formatSourceLabel('MODO SIMULADO (SINIGÁN V6 MOCK)'),
      'MODO SIMULADO (SINIGÁN V6 MOCK)',
    );
    assert.equal(formatSourceLabel('OTRO_ORIGEN'), 'OTRO_ORIGEN');
  });

  it('returns empty values unchanged so the UI can show its fallback', () => {
    assert.equal(formatSourceLabel(undefined), undefined);
    assert.equal(formatSourceLabel(null), null);
    assert.equal(formatSourceLabel(''), '');
  });
});
