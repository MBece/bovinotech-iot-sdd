import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { syncService } from './syncService.js';

const event = {
  clientEventId: '00000000-0000-0000-0000-000000000001',
  din: 'DIN-DEMO-000001',
  eventType: 'DEWORMING',
  fieldOccurredAt: '2026-11-24T14:00:00.000Z',
  product: 'Ivermectina simulada',
  dose: 5,
  doseUnit: 'ml',
  validationStatus: 'PENDIENTE_VALIDACION',
};

describe('syncService', () => {
  it('retries transient network failures with progressive waits', async () => {
    let attempts = 0;
    const waits = [];
    const result = await syncService.syncEvents([event], 'token', {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) throw new TypeError('network down');
        return {
          ok: true,
          json: async () => ({
            results: [{ clientEventId: event.clientEventId, status: 'SINCRONIZADO' }],
          }),
        };
      },
      sleep: async (milliseconds) => waits.push(milliseconds),
      maxAttempts: 3,
    });

    assert.equal(attempts, 3);
    assert.equal(result[0].status, 'SINCRONIZADO');
    assert.equal(waits.length, 2);
    assert.ok(waits[1] > waits[0]);
  });

  it('does not retry authorization failures', async () => {
    let attempts = 0;
    await assert.rejects(
      syncService.syncEvents([event], 'token', {
        fetchImpl: async () => {
          attempts += 1;
          return {
            ok: false,
            status: 403,
            json: async () => ({ detail: 'Acceso denegado' }),
          };
        },
        sleep: async () => {},
      }),
      /Acceso denegado/,
    );
    assert.equal(attempts, 1);
  });

  it('sends the complete sanitary contract', async () => {
    let body;
    await syncService.syncEvents([event], 'token', {
      fetchImpl: async (_url, options) => {
        body = JSON.parse(options.body);
        return { ok: true, json: async () => ({ results: [] }) };
      },
      sleep: async () => {},
    });

    assert.equal(body.items[0].eventType, 'DEWORMING');
    assert.equal(body.items[0].product, 'Ivermectina simulada');
    assert.equal(body.items[0].doseUnit, 'ml');
  });

  it('converts a structured 422 response into a readable per-event failure', async () => {
    const [result] = await syncService.syncEvents([event], 'token', {
      fetchImpl: async () => ({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [{ msg: 'Indique el producto aplicado' }],
        }),
      }),
      sleep: async () => {},
    });

    assert.equal(result.clientEventId, event.clientEventId);
    assert.equal(result.status, 'FALLIDO');
    assert.match(result.detail, /Indique el producto aplicado/);
    assert.doesNotMatch(result.detail, /\[object Object\]/);
  });

  it('isolates a legacy invalid event without blocking the next event', async () => {
    const legacyEvent = {
      ...event,
      clientEventId: '00000000-0000-0000-0000-000000000002',
      product: null,
      doseUnit: null,
    };
    let calls = 0;
    const results = await syncService.syncEvents([legacyEvent, event], 'token', {
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 422,
            json: async () => ({ detail: [{ msg: 'Indique el producto aplicado' }] }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ clientEventId: event.clientEventId, status: 'SINCRONIZADO' }],
          }),
        };
      },
      sleep: async () => {},
    });

    assert.equal(calls, 2);
    assert.deepEqual(results.map((result) => result.status), ['FALLIDO', 'SINCRONIZADO']);
  });

  it('normalizes legacy API statuses and translates literal validation errors', async () => {
    let calls = 0;
    const results = await syncService.syncEvents([event, event], 'token', {
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              results: [{ clientEventId: event.clientEventId, status: 'CREADO' }],
            }),
          };
        }
        return {
          ok: false,
          status: 422,
          json: async () => ({
            detail: [{ type: 'literal_error', msg: "Input should be 'VACCINATION'" }],
          }),
        };
      },
      sleep: async () => {},
    });

    assert.equal(results[0].status, 'SINCRONIZADO');
    assert.equal(results[1].status, 'FALLIDO');
    assert.match(results[1].detail, /no es compatible con la versión del servidor/);
    assert.doesNotMatch(results[1].detail, /Input should be/);
  });
});
