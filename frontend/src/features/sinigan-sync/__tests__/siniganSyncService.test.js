import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { siniganSyncService } from '../siniganSyncService.js';

const originalFetch = globalThis.fetch;
let calls = [];

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse(200, { ok: true });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('siniganSyncService', () => {
  it('posts a normalized DIN to the comparison endpoint', async () => {
    await siniganSyncService.compare('  din-demo-000002 ', 'token-123');

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'http://localhost:8000/integrations/sinigan-sync/comparisons',
    );
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token-123');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      din: 'DIN-DEMO-000002',
    });
  });

  it('serializes ticket filters into the list URL', async () => {
    globalThis.fetch = async (url) => {
      calls.push({ url });
      return jsonResponse(200, { items: [] });
    };

    await siniganSyncService.listTickets(
      { status: 'OPEN', din: 'DIN-DEMO-000002', limit: 25 },
      'token-123',
    );

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/integrations/sinigan-sync/tickets');
    assert.equal(url.searchParams.get('status'), 'OPEN');
    assert.equal(url.searchParams.get('din'), 'DIN-DEMO-000002');
    assert.equal(url.searchParams.get('limit'), '25');
  });

  it('omits an empty query string when there are no filters', async () => {
    await siniganSyncService.listTickets({}, 'token-123');

    assert.equal(
      calls[0].url,
      'http://localhost:8000/integrations/sinigan-sync/tickets',
    );
  });

  it('surfaces the backend detail as a Spanish error', async () => {
    globalThis.fetch = async () =>
      jsonResponse(409, { detail: 'No existe registro de campo para el DIN consultado.' });

    await assert.rejects(
      () => siniganSyncService.compare('DIN-DEMO-000002', 'token-123'),
      /No existe registro de campo para el DIN consultado\./,
    );
  });

  it('surfaces the 403 detail when there is no active farm (D10)', async () => {
    globalThis.fetch = async () =>
      jsonResponse(403, {
        detail: 'Se requiere una finca activa para operar la conciliación.',
      });

    await assert.rejects(
      () => siniganSyncService.listTickets({}, 'token-legacy'),
      /Se requiere una finca activa para operar la conciliación\./,
    );
  });

  it('surfaces the 404 detail of a missing or foreign-farm ticket (D10)', async () => {
    globalThis.fetch = async () =>
      jsonResponse(404, { detail: 'Ticket de conciliación no encontrado.' });

    await assert.rejects(
      () => siniganSyncService.getTicket(999, 'token-123'),
      /Ticket de conciliación no encontrado\./,
    );
  });

  it('maps an unauthenticated response to a Spanish session message', async () => {
    globalThis.fetch = async () => jsonResponse(401, {});

    await assert.rejects(
      () => siniganSyncService.listTickets({}, 'token-123'),
      /Su sesión expiró o no está autenticado\./,
    );
  });

  it('sends a trimmed resolution reason and returns the result', async () => {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(201, { id: 7, status: 'CLOSED' });
    };

    const result = await siniganSyncService.resolveTicket(
      7,
      { decision: 'OFICIAL_PREVALECE', reason: '  Motivo válido  ' },
      'token-123',
    );

    assert.equal(calls[0].options.method, 'POST');
    assert.equal(
      calls[0].url,
      'http://localhost:8000/integrations/sinigan-sync/tickets/7/resolution',
    );
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Motivo válido',
    });
    assert.equal(result.status, 'CLOSED');
  });
});
