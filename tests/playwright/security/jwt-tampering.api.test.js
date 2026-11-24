import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiGet, apiPost } from '../fixtures/shared.js';
import { signToken, noneAlgToken } from './helpers/jwt-utils.js';

const BASE_URL = 'https://bovinotech-iot-sdd.onrender.com';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('JWT Tampering', () => {
  let ctx;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  // ----------------------------------------------------------------
  // TC-SEC-16: Token sin claim `farm_id` → SKIP (requiere SECRET_KEY real)
  // ----------------------------------------------------------------
  test('TC-SEC-16: Token without farm_id claim rejected on all endpoints @security-sinigan @p0 @jwt', async () => {
    // The backend validates the JWT and if the farm_id claim is missing,
    // it returns 401 because the token doesn't match the expected claim structure.
    // The key security property is that access is denied.
    const noFarmToken = signToken({
      sub: 'vet@bovinotech.co',
      role: 'VETERINARIO',
      pwd_change: false,
    });

    const endpoints = [
      { method: 'POST', url: COMPARISONS_URL, options: { data: { din: 'DIN-DEMO-000001' } } },
      { method: 'GET', url: TICKETS_URL, options: {} },
      { method: 'GET', url: `${TICKETS_URL}/1`, options: {} },
      { method: 'POST', url: `${TICKETS_URL}/1/resolution`, options: { data: { decision: 'OFICIAL_PREVALECE', reason: 'Motivo válido para testing.' } } },
    ];

    for (const ep of endpoints) {
      let res;
      if (ep.method === 'POST') {
        res = await ctx.post(ep.url, {
          headers: { Authorization: `Bearer ${noFarmToken}` },
          ...ep.options,
        });
      } else {
        res = await ctx.get(ep.url, {
          headers: { Authorization: `Bearer ${noFarmToken}` },
        });
      }

      // Without farm_id, the backend rejects the token at auth level
      const status = res.status();
      expect([401, 403]).toContain(status);
      const body = await res.json();
      expect(body.detail).toBe('No se pudieron validar las credenciales');
    }
  });

  // ----------------------------------------------------------------
  // TC-SEC-17: Token con farm_id no asignado al usuario → SKIP (requiere SECRET_KEY real)
  // ----------------------------------------------------------------
  test('TC-SEC-17: Token with unassigned farm_id rejected @security-sinigan @p0 @jwt', async () => {
    // The backend validates that the user (sub) is actually associated with the
    // given farm_id. Since farm_id=999 is not associated with vet@bovinotech.co,
    // the backend rejects the token at auth level (401).
    const fakeFarmToken = signToken({
      sub: 'vet@bovinotech.co',
      role: 'VETERINARIO',
      farm_id: 999,
    });

    // GET /tickets → 401 (token rejected, user not associated with farm 999)
    const listRes = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${fakeFarmToken}` },
    });
    expect(listRes.status()).toBe(401);
    const listBody = await listRes.json();
    expect(listBody.detail).toBe('No se pudieron validar las credenciales');
  });

  // ----------------------------------------------------------------
  // TC-SEC-18: Token con alg: none → 401
  // ----------------------------------------------------------------
  test('TC-SEC-18: Token with alg=none returns 401 @security-sinigan @p0 @jwt', async () => {
    const unsignedToken = noneAlgToken({
      sub: 'vet@bovinotech.co',
      role: 'VETERINARIO',
      farm_id: 1,
    });

    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${unsignedToken}` },
    });
    // alg:none may be rejected at JWT decode level (422) or auth level (401)
    expect([401, 422]).toContain(res.status());

    const body = await res.json();
    expect(body.detail).toBeTruthy();
  });

  // ----------------------------------------------------------------
  // TC-SEC-19: Replay attack (mismo token dos veces) → funciona normalmente
  // ----------------------------------------------------------------
  test('TC-SEC-19: Replay - same token used twice should work normally @security-sinigan @p1 @jwt', async () => {
    // Login once
    const opLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    const opToken = opLogin.access_token;

    // First request
    const res1 = await apiPost(ctx, opToken, COMPARISONS_URL, { din: 'DIN-DEMO-000001' });
    expect(res1.status()).toBe(200);

    // Second request with same token
    const res2 = await apiPost(ctx, opToken, COMPARISONS_URL, { din: 'DIN-DEMO-000001' });
    expect(res2.status()).toBe(200);

    // GET /tickets with same token
    const res3 = await apiGet(ctx, opToken, TICKETS_URL);
    expect(res3.status()).toBe(200);

    const body = await res3.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  // ----------------------------------------------------------------
  // A29c: Token con role manipulado (operario → VETERINARIO) → 401
  // El sub es un usuario existente (operario@bovinotech.co) pero el
  // role fue manipulado a VETERINARIO. El backend detecta la
  // inconsistencia entre role del token y el real de DB y rechaza en
  // auth level con 401.
  // ----------------------------------------------------------------
  test('A29c: Token with manipulated role rejected @security-sinigan @p0 @jwt @a29', async () => {
    const roleManipulatedToken = signToken({
      sub: 'operario@bovinotech.co',
      role: 'VETERINARIO',
      farm_id: 1,
    });

    const resolveRes = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${roleManipulatedToken}` },
    });
    expect(resolveRes.status()).toBe(401);

    const resolveBody = await resolveRes.json();
    expect(resolveBody.detail).toBe('No se pudieron validar las credenciales');
  });
});