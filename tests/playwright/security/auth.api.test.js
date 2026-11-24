import { test, expect, request } from '@playwright/test';
import { signToken } from './helpers/jwt-utils.js';

const BASE_URL = 'https://bovinotech-iot-sdd.onrender.com';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('Broken Authentication', () => {
  let ctx;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  /**
   * Helper to verify a 401 response for all 4 endpoints.
   * @param {object} options
   * @param {string} [options.token] - Bearer token (omit for no-auth)
   * @param {number} [options.expectedStatus] - Expected status code
   */
  async function assertAuthFailureOnAllEndpoints({ token, expectedStatus = 401 } = {}) {
    const headers = token !== undefined
      ? { Authorization: `Bearer ${token}` }
      : {};

    // 1. POST /comparisons
    const res1 = await ctx.post(COMPARISONS_URL, {
      headers,
      data: { din: 'DIN-DEMO-000001' },
    });
    expect(res1.status()).toBe(expectedStatus);

    // 2. GET /tickets
    const res2 = await ctx.get(TICKETS_URL, { headers });
    expect(res2.status()).toBe(expectedStatus);

    // 3. GET /tickets/1
    const res3 = await ctx.get(`${TICKETS_URL}/1`, { headers });
    expect(res3.status()).toBe(expectedStatus);

    // 4. POST /tickets/1/resolution
    const res4 = await ctx.post(`${TICKETS_URL}/1/resolution`, {
      headers,
      data: { decision: 'OFICIAL_PREVALECE', reason: 'Test motivo válido.' },
    });
    expect(res4.status()).toBe(expectedStatus);
  }

  // ----------------------------------------------------------------
  // TC-SEC-04: Sin token → 401 en los 4 endpoints
  // ----------------------------------------------------------------
  test('TC-SEC-04: No auth token returns 401 on all endpoints @security-sinigan @p0 @auth', async () => {
    const res = await ctx.get(TICKETS_URL);
    expect(res.status()).toBe(401);

    // Verify the error details for one endpoint
    const body = await res.json();
    expect(body.detail).toBe('Not authenticated');

    // Verify www-authenticate header
    const allHeaders = res.headers();
    const headerKey = Object.keys(allHeaders).find(
      k => k.toLowerCase() === 'www-authenticate'
    );
    if (headerKey) {
      expect(allHeaders[headerKey].toLowerCase()).toContain('bearer');
    }

    // Test all 4 endpoints
    await assertAuthFailureOnAllEndpoints();
  });

  // ----------------------------------------------------------------
  // TC-SEC-05: Token expirado → 401
  // ----------------------------------------------------------------
  test('TC-SEC-05: Expired token returns 401 on all endpoints @security-sinigan @p0 @auth', async () => {
    const expiredToken = signToken(
      { sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 1 },
      { algorithm: 'HS256', expiresIn: '-1d' }
    );

    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('No se pudieron validar las credenciales');

    await assertAuthFailureOnAllEndpoints({ token: expiredToken });
  });

  // ----------------------------------------------------------------
  // TC-SEC-07: Token malformado → 401
  // ----------------------------------------------------------------
  test('TC-SEC-07: Malformed token returns 401 @security-sinigan @p1 @auth', async () => {
    const malformedToken = 'ESTO_NO_ES_UN_TOKEN_VALIDO';

    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${malformedToken}` },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('No se pudieron validar las credenciales');
  });

  // ----------------------------------------------------------------
  // TC-SEC-08: Token vacío → 401
  // ----------------------------------------------------------------
  test('TC-SEC-08: Empty token returns 401 @security-sinigan @p1 @auth', async () => {
    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: 'Bearer ' },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('No se pudieron validar las credenciales');
  });

  // ----------------------------------------------------------------
  // TC-SEC-06: Token firmado con otra clave → 401
  // ----------------------------------------------------------------
  test('TC-SEC-06: Token signed with wrong key returns 401 on all endpoints @security-sinigan @p0 @auth', async () => {
    // Import the wrong-key helper
    const { wrongKeyToken } = await import('./helpers/jwt-utils.js');
    const fakeToken = wrongKeyToken(
      { sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 1 },
      'my-fake-key'
    );

    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('No se pudieron validar las credenciales');

    await assertAuthFailureOnAllEndpoints({ token: fakeToken });
  });

  // ----------------------------------------------------------------
  // A29b: Token sin claim `sub` → 401
  // ----------------------------------------------------------------
  test('A29b: Token without sub claim rejected @security-sinigan @p1 @auth @a29', async () => {
    const noSubToken = signToken({
      role: 'OPERARIO',
      farm_id: 1,
    });

    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${noSubToken}` },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('No se pudieron validar las credenciales');
  });
});