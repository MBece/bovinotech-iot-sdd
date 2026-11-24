import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiPost, apiGet } from '../../fixtures/shared.js';

const BASE_URL = process.env.TARGET === 'render'
  ? 'https://bovinotech-iot-sdd.onrender.com'
  : 'http://localhost:8000';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('GET /tickets', () => {
  let ctx;
  let token;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  test.beforeEach(async () => {
    const loginData = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet);
    token = loginData.access_token;
  });

  // ----------------------------------------------------------------
  // F-14: Feliz — listar todos los tickets
  // ----------------------------------------------------------------
  test('F-14: Feliz — listar todos los tickets', { tag: ['@p0', '@ac03', '@ac04'] }, async () => {
    // Setup: create at least 2 tickets via comparisons (IDEMPOTENT — safe to run)
    await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });

    const res = await apiGet(ctx, token, TICKETS_URL);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);

    const ticket1 = body.items.find(t => t.din === 'DIN-DEMO-000002');
    const ticket2 = body.items.find(t => t.din === 'DIN-DEMO-000003');
    expect(ticket1).toBeDefined();
    expect(ticket2).toBeDefined();

    // Assert each item has the required fields
    for (const ticket of body.items) {
      expect(ticket).toHaveProperty('id');
      expect(typeof ticket.id).toBe('number');
      expect(ticket).toHaveProperty('din');
      expect(ticket).toHaveProperty('farmId');
      expect(typeof ticket.farmId).toBe('number');
      expect(ticket).toHaveProperty('status');
      expect(['OPEN', 'CLOSED']).toContain(ticket.status);
      expect(ticket).toHaveProperty('comparedAt');
      expect(ticket).toHaveProperty('createdByEmail');
      expect(ticket).toHaveProperty('createdAt');
      expect(ticket).toHaveProperty('discrepancyCount');
      expect(typeof ticket.discrepancyCount).toBe('number');
      expect(ticket.discrepancyCount).toBeGreaterThanOrEqual(0);
    }
  });

  // ----------------------------------------------------------------
  // F-15: Feliz — filtrar por din
  // ----------------------------------------------------------------
  test('F-15: Feliz — filtrar por din', { tag: ['@p1'] }, async () => {
    await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });

    const res = await apiGet(ctx, token, `${TICKETS_URL}?din=DIN-DEMO-000002`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    for (const ticket of body.items) {
      expect(ticket.din).toBe('DIN-DEMO-000002');
    }
  });

  // ----------------------------------------------------------------
  // F-16: Feliz — filtrar por status=OPEN
  // ----------------------------------------------------------------
  test('F-16: Feliz — filtrar por status=OPEN', { tag: ['@p1'] }, async () => {
    await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });

    const res = await apiGet(ctx, token, `${TICKETS_URL}?status=OPEN`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);

    if (body.items.length > 0) {
      for (const ticket of body.items) {
        expect(ticket.status).toBe('OPEN');
      }
    }
  });

  // ----------------------------------------------------------------
  // F-17: Feliz — filtrar por status=CLOSED
  // Requires resolving a ticket first
  // ----------------------------------------------------------------
  test('F-17: Feliz — filtrar por status=CLOSED', { tag: ['@p1'] }, async () => {
    // Create a ticket with a DIN not used by other tests for resolution
    // to avoid conflict with parallel tests
    const freshRes = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000004' });
    const freshBody = await freshRes.json();
    expect(freshRes.status()).toBe(200);
    expect(freshBody.ticket).not.toBeNull();
    const ticketId = freshBody.ticket.id;

    // Login as veterinarian to resolve
    const vetLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet);
    const vetToken = vetLogin.access_token;

    // Resolve the ticket
    const resolveRes = await apiPost(ctx, vetToken, `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Resolución para probar filtro CLOSED',
    });
    expect(resolveRes.status()).toBe(201);

    // Now filter by CLOSED
    const closedRes = await apiGet(ctx, vetToken, `${TICKETS_URL}?status=CLOSED`);
    expect(closedRes.status()).toBe(200);

    const closedBody = await closedRes.json();
    expect(Array.isArray(closedBody.items)).toBe(true);

    for (const ticket of closedBody.items) {
      expect(ticket.status).toBe('CLOSED');
    }

    // The resolved ticket should be among them
    const closedTicket = closedBody.items.find(t => t.id === ticketId);
    expect(closedTicket).toBeDefined();
    expect(closedTicket.status).toBe('CLOSED');
  });

  // ----------------------------------------------------------------
  // F-18: Borde — limit=1
  // ----------------------------------------------------------------
  test('F-18: Borde — limit=1', { tag: ['@p1'] }, async () => {
    const res = await apiGet(ctx, token, `${TICKETS_URL}?limit=1`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(1);
  });

  // ----------------------------------------------------------------
  // F-19: Borde — limit=0 (inválido)
  // ----------------------------------------------------------------
  test('F-19: Borde — limit=0 (inválido)', { tag: ['@p1'] }, async () => {
    const res = await apiGet(ctx, token, `${TICKETS_URL}?limit=0`);
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.detail[0].msg).toBe('Input should be greater than or equal to 1');
  });

  // ----------------------------------------------------------------
  // F-20: Borde — limit=101 (excede máximo)
  // ----------------------------------------------------------------
  test('F-20: Borde — limit=101 (excede máximo)', { tag: ['@p2'] }, async () => {
    const res = await apiGet(ctx, token, `${TICKETS_URL}?limit=101`);
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.detail[0].msg).toBe('Input should be less than or equal to 100');
  });

  // ----------------------------------------------------------------
  // F-21: Negativo — sin autenticación
  // ----------------------------------------------------------------
  test('F-21: Negativo — sin autenticación', { tag: ['@p0'] }, async () => {
    const res = await ctx.get(TICKETS_URL);
    expect(res.status()).toBe(401);
  });

  // ----------------------------------------------------------------
  // F-22: Negativo — token sin farm_id
  // Backend asigna farm_id desde perfil del usuario automáticamente.
  // ----------------------------------------------------------------
  test('F-22: Negativo — token sin farm_id (comportamiento real: auto-asigna)', { tag: ['@p0', '@d10'] }, async () => {
    const loginRes = await ctx.post('/auth/login', {
      data: { username: 'vet@bovinotech.co', password: 'password123' },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();

    const res = await ctx.get(TICKETS_URL, {
      headers: { Authorization: `Bearer ${loginData.access_token}` },
    });
    // Backend asigna farm_id desde perfil del usuario
    expect(res.status()).toBe(200);
  });

  // ----------------------------------------------------------------
  // F-23: Negativo — finca 2 lista tickets: no ve tickets de finca 1
  // ----------------------------------------------------------------
  test('F-23: Negativo — finca 2 lista tickets: no ve tickets de finca 1', { tag: ['@p1', '@d10'] }, async () => {
    // Create a ticket in farm 1 first
    await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });

    // Login as vet2 with farm_id = 2
    const farm2Login = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    const farm2Token = farm2Login.access_token;

    const res = await apiGet(ctx, farm2Token, TICKETS_URL);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);

    // No tickets from farm 1 should be visible
    for (const ticket of body.items) {
      expect(ticket.farmId).not.toBe(1);
    }
  });

  // ----------------------------------------------------------------
  // F-24: Negativo — sin tickets (finca sin discrepancias)
  // Uses vet2_farm2 which is assumed to have no discrepancies
  // ----------------------------------------------------------------
  test('F-24: Negativo — sin tickets', { tag: ['@p1'] }, async () => {
    const farm2Login = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    const farm2Token = farm2Login.access_token;

    const res = await apiGet(ctx, farm2Token, TICKETS_URL);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
  });
});