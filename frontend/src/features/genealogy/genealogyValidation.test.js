import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDin, validateParentLink } from './genealogyValidation.js';

const offspring = { din: 'DIN-DEMO-000119', sex: 'MACHO', birthDate: '2026-10-01' };
const sire = { din: 'DIN-DEMO-000116', sex: 'MACHO', birthDate: '2025-01-20' };
const dam = { din: 'DIN-DEMO-000118', sex: 'HEMBRA', birthDate: '2022-02-02' };

describe('genealogy local pre-validation', () => {
  it('accepts a valid link', () => {
    assert.deepEqual(validateParentLink({ offspring, parent: sire, parentRole: 'SIRE' }), {
      valid: true,
      code: null,
      message: null,
    });
    assert.equal(validateParentLink({ offspring, parent: dam, parentRole: 'DAM' }).valid, true);
  });

  it('rejects a self link', () => {
    const result = validateParentLink({ offspring, parent: offspring, parentRole: 'SIRE' });
    assert.equal(result.valid, false);
    assert.equal(result.code, 'GENEALOGY_CYCLE');
    assert.match(result.message, /propio/);
  });

  it('rejects a sex incompatible with the role', () => {
    const asSire = validateParentLink({ offspring, parent: dam, parentRole: 'SIRE' });
    assert.equal(asSire.code, 'PARENT_SEX_MISMATCH');
    assert.match(asSire.message, /padre debe ser macho/);
    const asDam = validateParentLink({ offspring, parent: sire, parentRole: 'DAM' });
    assert.match(asDam.message, /madre debe ser hembra/);
  });

  it('rejects a parent born the same day or later', () => {
    const sameDay = { ...sire, birthDate: offspring.birthDate };
    const result = validateParentLink({ offspring, parent: sameDay, parentRole: 'SIRE' });
    assert.equal(result.code, 'PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING');
    assert.match(result.message, /anterior/);
    const younger = { ...sire, birthDate: '2026-11-01' };
    assert.equal(validateParentLink({ offspring, parent: younger, parentRole: 'SIRE' }).valid, false);
  });

  it('defers to the server when an animal is not cached', () => {
    assert.equal(validateParentLink({ offspring, parent: null, parentRole: 'SIRE' }).valid, true);
  });
});

describe('DIN resolution for numeric field search', () => {
  it('expands a bare number to the project DIN pattern', () => {
    assert.equal(resolveDin('119'), 'DIN-DEMO-000119');
    assert.equal(resolveDin(' 000101 '), 'DIN-DEMO-000101');
  });

  it('normalizes a typed DIN to upper case and keeps other text', () => {
    assert.equal(resolveDin('din-demo-000102'), 'DIN-DEMO-000102');
    assert.equal(resolveDin(''), '');
  });
});
