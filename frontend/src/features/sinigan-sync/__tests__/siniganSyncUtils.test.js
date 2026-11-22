import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DECISION_LABELS,
  FIELD_LABELS,
  SIMULATION_LABEL,
  STATUS_LABELS,
  buildTicketsLoadKey,
  buildTicketsQuery,
  canResolveTicket,
  formatActiveFarm,
} from '../siniganSyncUtils.js';

const EXPECTED_SIMULATION_LABEL = 'MODO SIMULADO (SINIGÁN V6 MOCK)';

describe('siniganSyncUtils', () => {
  it('exposes the exact simulation label required by HU-05', () => {
    assert.equal(SIMULATION_LABEL, EXPECTED_SIMULATION_LABEL);
  });

  it('labels every compared field', () => {
    assert.equal(FIELD_LABELS.species, 'Especie');
    assert.equal(FIELD_LABELS.sex, 'Sexo');
    assert.equal(FIELD_LABELS.age_group, 'Grupo etario');
    assert.equal(FIELD_LABELS.sit_code, 'Predio');
  });

  it('labels ticket statuses', () => {
    assert.equal(STATUS_LABELS.OPEN, 'Abierto');
    assert.equal(STATUS_LABELS.CLOSED, 'Cerrado');
  });

  it('labels resolution decisions', () => {
    assert.equal(
      DECISION_LABELS.OFICIAL_PREVALECE,
      'Prevalece la ficha oficial',
    );
    assert.equal(
      DECISION_LABELS.CAMPO_PREVALECE,
      'Prevalece el registro de campo',
    );
  });

  it('only allows VETERINARIO to resolve OPEN tickets', () => {
    assert.equal(canResolveTicket('VETERINARIO', { status: 'OPEN' }), true);
    assert.equal(canResolveTicket('OPERARIO', { status: 'OPEN' }), false);
    assert.equal(canResolveTicket('VETERINARIO', { status: 'CLOSED' }), false);
    assert.equal(canResolveTicket('VETERINARIO', null), false);
    assert.equal(canResolveTicket(null, { status: 'OPEN' }), false);
    assert.equal(canResolveTicket(undefined, undefined), false);
  });

  it('builds a query string for ticket filters', () => {
    const query = buildTicketsQuery({
      status: 'OPEN',
      din: 'DIN-DEMO-000002',
      limit: 25,
    });
    const params = new URLSearchParams(query);

    assert.equal(params.get('status'), 'OPEN');
    assert.equal(params.get('din'), 'DIN-DEMO-000002');
    assert.equal(params.get('limit'), '25');
  });

  it('omits empty ticket filters', () => {
    assert.equal(String(buildTicketsQuery({})), '');

    const params = new URLSearchParams(
      buildTicketsQuery({ status: '', din: null, limit: undefined }),
    );
    assert.equal([...params.keys()].length, 0);
  });

  it('renders the active farm and a dash when there is none (D10)', () => {
    assert.equal(formatActiveFarm(1), '1');
    assert.equal(formatActiveFarm(2), '2');
    assert.equal(formatActiveFarm('3'), '3');
    assert.equal(formatActiveFarm(null), '—');
    assert.equal(formatActiveFarm(undefined), '—');
    assert.equal(formatActiveFarm(''), '—');
  });

  it('reloads tickets when the active farm or token changes (D10)', () => {
    const base = { token: 'token-1', farmId: 1, filters: { status: 'OPEN' } };
    const key = buildTicketsLoadKey(base);

    assert.equal(buildTicketsLoadKey({ ...base }), key);
    assert.notEqual(buildTicketsLoadKey({ ...base, farmId: 2 }), key);
    assert.notEqual(buildTicketsLoadKey({ ...base, token: 'token-2' }), key);
    assert.notEqual(
      buildTicketsLoadKey({ ...base, filters: { status: 'CLOSED' } }),
      key,
    );
  });
});
