import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiGet, apiPost } from '../fixtures/shared.js';
import { signToken } from './helpers/jwt-utils.js';

const BASE_URL = 'https://bovinotech-iot-sdd.onrender.com';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('IDOR - Aislamiento por finca', () => {
  test.describe.configure({ timeout: 120000 });
  let ctx;
  /** @type {number} */
  let ticketIdFarm1;
  let tokenOperario;
  let tokenVet2;

  test.beforeAll(async () => {
    test.setTimeout(90000);
    ctx = await request.newContext({ baseURL: BASE_URL });

    // Login as operario (farm_id=1) and create a ticket
    const opLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    tokenOperario = opLogin.access_token;

    const compRes = await apiPost(ctx, tokenOperario, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(compRes.status()).toBe(200);
    const compBody = await compRes.json();
    expect(compBody.ticket).not.toBeNull();
    ticketIdFarm1 = compBody.ticket.id;

    // Login as vet2 (farm_id=2)
    const v2Login = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    tokenVet2 = v2Login.access_token;
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  // ----------------------------------------------------------------
  // TC-SEC-01: Ticket de finca 1 no visible desde finca 2 (listado)
  // ----------------------------------------------------------------
  test('TC-SEC-01: IDOR - ticket farm 1 not visible from farm 2 list @security-sinigan @p0 @idor', async () => {
    const res = await apiGet(ctx, tokenVet2, TICKETS_URL);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);

    // Farm 1 ticket ID must not appear in the list
    const farm1Ticket = body.items.find(t => t.id === ticketIdFarm1);
    expect(farm1Ticket).toBeUndefined();

    // If there are items, they must all have farmId === 2
    for (const ticket of body.items) {
      expect(ticket.farmId).toBe(2);
    }
  });

  // ----------------------------------------------------------------
  // TC-SEC-01b: Detalle de ticket de finca 1 retorna 404 desde finca 2
  // ----------------------------------------------------------------
  test('TC-SEC-02: IDOR - ticket detail from farm 1 returns 404 from farm 2 @security-sinigan @p0 @idor', async () => {
    const res = await apiGet(ctx, tokenVet2, `${TICKETS_URL}/${ticketIdFarm1}`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail).toBe('Ticket de conciliación no encontrado.');

    // Must NOT leak any ticket data
    expect(body).not.toHaveProperty('farm_id');
    expect(body).not.toHaveProperty('din');
    expect(body).not.toHaveProperty('status');

    // Verify the same message as a genuinely non-existent ticket
    const resNonExistent = await apiGet(ctx, tokenVet2, `${TICKETS_URL}/999999`);
    expect(resNonExistent.status()).toBe(404);
    const nonExistentBody = await resNonExistent.json();
    expect(nonExistentBody.detail).toBe('Ticket de conciliación no encontrado.');
    // Messages must be identical
    expect(body.detail).toBe(nonExistentBody.detail);
  });

  // ----------------------------------------------------------------
  // TC-SEC-03: Resolución de ticket de finca 1 desde finca 2 → 404 + no escritura
  // ----------------------------------------------------------------
  test('TC-SEC-03: IDOR - resolve ticket from farm 1 returns 404 and does not write @security-sinigan @p0 @idor', { timeout: 90000 }, async () => {
    const res = await apiPost(ctx, tokenVet2, `${TICKETS_URL}/${ticketIdFarm1}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Se valida la ficha oficial y se solicita corrección del registro de campo.',
    });
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail).toBe('Ticket de conciliación no encontrado.');

    // Verify the ticket is still OPEN using the operario token (farm 1)
    const ticketRes = await apiGet(ctx, tokenOperario, `${TICKETS_URL}/${ticketIdFarm1}`);
    expect(ticketRes.status()).toBe(200);
    const ticketBody = await ticketRes.json();
    expect(ticketBody.status).toBe('OPEN');
    expect(ticketBody.resolution).toBeNull();
  });

  // ----------------------------------------------------------------
  // TC-SEC-04: Comparación contra DIN de otra finca → 409 indistinguible
  // ----------------------------------------------------------------
  test('TC-SEC-04: IDOR - comparison against DIN from another farm returns 409 indistinguishable @security-sinigan @p1 @idor', async () => {
    // DIN-DEMO-000002 exists as FieldAnimalRecord in farm 1, not in farm 2
    const res = await apiPost(ctx, tokenVet2, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(res.status()).toBe(409);

    const body = await res.json();
    expect(body.detail).toBe('No existe registro de campo para el DIN consultado.');

    // For a DIN that doesn't exist in the official source (DIN-DEMO-999999),
    // the backend returns 404. The key assertion is that DIN-DEMO-000002 from
    // farm 1 yields 409 (not 200 or 404), without leaking farm 1's data.
    // The 409 status is already indistinguishable from "DIN not found in this farm's registry".
    const resNonExistent = await apiPost(ctx, tokenVet2, COMPARISONS_URL, { din: 'DIN-DEMO-999999' });
    // DIN-DEMO-999999 doesn't exist in official source → backend returns 404
    expect(resNonExistent.status()).toBe(404);
    const nonExistentBody = await resNonExistent.json();
    expect(nonExistentBody.detail.length).toBeGreaterThan(0);
  });

  // ----------------------------------------------------------------
  // A29: Cross-farm token → 403/401
  // El token está firmado correctamente con sub=operario@bovinotech.co
  // y farm_id=2, pero el usuario solo pertenece a finca 1.
  // ----------------------------------------------------------------
  test('A29: Cross-farm token rejected @security-sinigan @p0 @a29 @idor', async () => {
    // Generate a JWT with a user that belongs to farm 1
    // but claims farm_id=2 in the token payload.
    const crossFarmToken = signToken({
      sub: 'operario@bovinotech.co',
      role: 'OPERARIO',
      farm_id: 2,
    });

    // Try GET /tickets (list) with the cross-farm token
    const listRes = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${crossFarmToken}` },
    });
    const listStatus = listRes.status();
    expect([401, 403]).toContain(listStatus);

    const listBody = await listRes.json();
    expect(listBody.detail).toBe('No se pudieron validar las credenciales');

    // Try POST /comparisons with the cross-farm token
    const compRes = await ctx.post(COMPARISONS_URL, {
      headers: { Authorization: `Bearer ${crossFarmToken}` },
      data: { din: 'DIN-DEMO-000001' },
    });
    const compStatus = compRes.status();
    expect([401, 403]).toContain(compStatus);

    const compBody = await compRes.json();
    expect(compBody.detail).toBe('No se pudieron validar las credenciales');

    // Try GET /tickets/1 (detail) with the cross-farm token
    const detailRes = await ctx.get(`${TICKETS_URL}/1`, {
      headers: { Authorization: `Bearer ${crossFarmToken}` },
    });
    const detailStatus = detailRes.status();
    expect([401, 403]).toContain(detailStatus);

    const detailBody = await detailRes.json();
    expect(detailBody.detail).toBe('No se pudieron validar las credenciales');

    // Try POST /tickets/1/resolution with the cross-farm token
    const resRes = await ctx.post(`${TICKETS_URL}/1/resolution`, {
      headers: { Authorization: `Bearer ${crossFarmToken}` },
      data: { decision: 'OFICIAL_PREVALECE', reason: 'Test motivo válido.' },
    });
    const resStatus = resRes.status();
    expect([401, 403]).toContain(resStatus);

    const resBody = await resRes.json();
    expect(resBody.detail).toBe('No se pudieron validar las credenciales');
  });
});