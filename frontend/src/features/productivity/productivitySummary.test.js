import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canReviewProductivity,
  formatProductivityIndicator,
} from './productivityPresentation.js';

describe('productivity summary presentation', () => {
  it('shows insufficient data rather than a missing numeric value', () => {
    assert.equal(formatProductivityIndicator(null, 'DATOS_INSUFICIENTES'), 'DATOS_INSUFICIENTES');
    assert.equal(formatProductivityIndicator(2.5, 'SUFFICIENT'), 2.5);
  });

  it('restricts atypical weighing review actions to authorized roles', () => {
    assert.equal(canReviewProductivity('VETERINARIO'), true);
    assert.equal(canReviewProductivity('ADMINISTRADOR'), true);
    assert.equal(canReviewProductivity('OPERARIO'), false);
  });
});
