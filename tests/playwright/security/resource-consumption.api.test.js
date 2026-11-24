import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiGet, apiPost } from '../fixtures/shared.js';

const BASE_URL = 'https://bovinotech-iot-sdd.onrender.com';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('Unconstrained Resource Consumption', () => {
  let ctx;
  let opToken;

  test.beforeAll(async () => {
    test.setTimeout(90000);
    ctx = await request.newContext({ baseURL: BASE_URL });
    const opLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    opToken = opLogin.access_token;
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  // ----------------------------------------------------------------
  // TC-SEC-20: Paginación con limit=100 → 200 OK
  // ----------------------------------------------------------------
  test('TC-SEC-20: Pagination with limit=100 returns 200 @security-sinigan @p1 @pagination', async () => {
    const res = await apiGet(ctx, opToken, `${TICKETS_URL}?limit=100`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(100);
  });

  // ----------------------------------------------------------------
  // TC-SEC-21: Paginación con limit=-1 → 422
  // ----------------------------------------------------------------
  test('TC-SEC-21: Pagination with limit=-1 returns 422 @security-sinigan @p1 @pagination', async () => {
    const res = await apiGet(ctx, opToken, `${TICKETS_URL}?limit=-1`);
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.detail || body.message || body.error).toBeTruthy();
  });

  // ----------------------------------------------------------------
  // TC-SEC-22: Abuso de creación de tickets (10 comparaciones rápidas seguidas)
  // ----------------------------------------------------------------
  test('TC-SEC-22: Multiple rapid comparisons should not break @security-sinigan @p2 @pagination', async () => {
    const dins = [
      'DIN-DEMO-000001',
      'DIN-DEMO-000002',
      'DIN-DEMO-000003',
      'DIN-DEMO-000004',
    ];

    // Send 10 rapid comparisons (mixing valid and invalid-ish DINS)
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const din = dins[i % dins.length];
      promises.push(apiPost(ctx, opToken, COMPARISONS_URL, { din }));
    }

    const results = await Promise.allSettled(promises);

    let successCount = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const status = result.value.status();
        // Accept either 200 (ok) or 409 (already resolved/repeated)
        if (status === 200 || status === 409) {
          successCount++;
        }
      }
    }

    // At least some should succeed (the endpoint should handle the load)
    expect(successCount).toBeGreaterThan(0);

    // Verify the API is still responsive after the abuse
    const healthRes = await apiGet(ctx, opToken, TICKETS_URL);
    expect(healthRes.status()).toBe(200);
    const healthBody = await healthRes.json();
    expect(Array.isArray(healthBody.items)).toBe(true);
  });

  // ----------------------------------------------------------------
  // A29d: Abuso de listado — 10 requests secuenciales a GET /tickets
  // ----------------------------------------------------------------
  test('A29d: Rapid 10 GET /tickets requests should not break @security-sinigan @p2 @rate-limit @a29', { timeout: 120000 }, async () => {
    // Send requests sequentially to avoid overwhelming the free-tier backend
    let ok = 0;
    let rateLimited = 0;
    let crashes = 0;

    for (let i = 0; i < 10; i++) {
      const res = await apiGet(ctx, opToken, `${TICKETS_URL}?limit=5`);
      if (res.status() === 200) ok++;
      else if (res.status() === 429) rateLimited++;
      else if (res.status() >= 500) crashes++;
    }

    // At least one request succeeded or was rate-limited gracefully
    expect(ok + rateLimited).toBeGreaterThan(0);

    // No 5xx errors
    expect(crashes).toBe(0);

    // Verify the API is still responsive after the burst
    const healthRes = await apiGet(ctx, opToken, TICKETS_URL);
    expect(healthRes.status()).toBe(200);
    const healthBody = await healthRes.json();
    expect(Array.isArray(healthBody.items)).toBe(true);
  });
});