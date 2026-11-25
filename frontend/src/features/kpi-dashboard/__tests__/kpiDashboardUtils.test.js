import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canExportAudit,
  canViewFinancials,
  formatGdp,
  formatNumber,
  formatPercentage,
  buildDefaultDateRange,
} from '../kpiDashboardUtils.js';

describe('kpiDashboardUtils', () => {
  describe('formatPercentage', () => {
    it('formats a valid number with one decimal and percent sign', () => {
      assert.equal(formatPercentage(75), '75.0%');
    });

    it('returns an em dash for null', () => {
      assert.equal(formatPercentage(null), '—');
    });

    it('returns an em dash for undefined', () => {
      assert.equal(formatPercentage(undefined), '—');
    });
  });

  describe('formatGdp', () => {
    it('formats GDP with two decimals and kg/día unit', () => {
      assert.equal(formatGdp(0.82), '0.82 kg/día');
    });

    it('returns an em dash for null', () => {
      assert.equal(formatGdp(null), '—');
    });

    it('returns an em dash for undefined', () => {
      assert.equal(formatGdp(undefined), '—');
    });
  });

  describe('canViewFinancials', () => {
    it('returns true for VETERINARIO', () => {
      assert.equal(canViewFinancials('VETERINARIO'), true);
    });

    it('returns true for DIRECTIVO', () => {
      assert.equal(canViewFinancials('DIRECTIVO'), true);
    });

    it('returns false for OPERARIO', () => {
      assert.equal(canViewFinancials('OPERARIO'), false);
    });
  });

  describe('canExportAudit', () => {
    it('returns true for VETERINARIO', () => {
      assert.equal(canExportAudit('VETERINARIO'), true);
    });

    it('returns true for DIRECTIVO', () => {
      assert.equal(canExportAudit('DIRECTIVO'), true);
    });

    it('returns false for OPERARIO', () => {
      assert.equal(canExportAudit('OPERARIO'), false);
    });
  });

  describe('buildDefaultDateRange', () => {
    it('returns an object with startDate and endDate as YYYY-MM-DD strings', () => {
      const range = buildDefaultDateRange();
      assert.ok(typeof range.startDate === 'string');
      assert.ok(typeof range.endDate === 'string');
      assert.match(range.startDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(range.endDate, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('startDate is earlier than or equal to endDate', () => {
      const range = buildDefaultDateRange();
      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      assert.ok(start <= end);
    });
  });
});