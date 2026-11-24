import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiPost, apiGet } from '../../fixtures/shared.js';

const BASE_URL = process.env.TARGET === 'render'
  ? 'https://bovinotech-iot-sdd.onrender.com'
  : 'http://localhost:8000';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('GET /tickets/{id}', () => {
  let ctx;
  let token;
  let vetToken;

  // Shared test data
  let openTicketId;
  let closedTicketId;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });

    // Login as vet
    const loginData = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet);
    vetToken = loginData.access_token;

    // Create an OPEN ticket
    const openRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    const openBody = await openRes.json();
    expect(openRes.status()).toBe(200);
    expect(openBody.ticket).not.toBeNull();
    openTicketId = openBody.ticket.id;

    // Create a CLOSED ticket: resolve one
    const listRes = await apiGet(ctx, vetToken, `${TICKETS_URL}?din=DIN-DEMO-000002`);
    const listBody = await listRes.json();
    closedTicketId = listBody.items[0].id;

    // We need a separate ticket for closed — create another one
    const closedRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000004' });
    const closedBody = await closedRes.json();
    expect(closedRes.status()).toBe(200);
    expect(closedBody.ticket).not.toBeNull();
    closedTicketId = closedBody.ticket.id;

    // Resolve it
    const resolveRes = await apiPost(ctx, vetToken, `/integrations/sinigan-sync/tickets/${closedTicketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Se cierra el ticket para tests de detalle CLOSED',
    });
    expect(resolveRes.status()).toBe(201);
  });

  test.beforeEach(async () => {
    const loginData = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet);
    token = loginData.access_token;
  });

  // ----------------------------------------------------------------
  // F-25: Feliz — detalle de ticket OPEN
  // ----------------------------------------------------------------
  test('F-25: Feliz — detalle de ticket OPEN', { tag: ['@p0', '@ac03'] }, async () => {
    const res = await apiGet(ctx, token, `${TICKETS_URL}/${openTicketId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();

    // Core fields
    expect(body.id).toBe(openTicketId);
    expect(body.din).toBeTruthy();
    expect(body.farmId).toBe(1);
    expect(body.status).toBe('OPEN');

    // Snapshots
    expect(body.officialSnapshot).toBeTruthy();
    expect(typeof body.officialSnapshot).toBe('object');
    expect(body.fieldSnapshot).toBeTruthy();
    expect(typeof body.fieldSnapshot).toBe('object');

    // Sources
    expect(body.officialSource).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
    expect(body.fieldSource).toBe('REGISTRO DE CAMPO');

    // Timestamps
    expect(body.comparedAt).toBeTruthy();
    expect(body.createdByEmail).toBeTruthy();
    expect(body.createdAt).toBeTruthy();

    // Discrepancies
    expect(Array.isArray(body.discrepancies)).toBe(true);
    expect(body.discrepancies.length).toBeGreaterThanOrEqual(1);

    for (const disc of body.discrepancies) {
      expect(disc.fieldName).toBeTruthy();
      expect(disc.fieldLabel).toBeTruthy();
      expect(disc.officialValue).toBeTruthy();
      expect(disc.fieldValue).toBeTruthy();
      expect(disc.officialSource).toBeTruthy();
      expect(disc.fieldSource).toBeTruthy();
      expect(disc.detectedAt).toBeTruthy();
    }

    // No resolution yet
    expect(body.closedAt).toBeNull();
    expect(body.resolution).toBeNull();
  });

  // ----------------------------------------------------------------
  // F-26: Feliz — detalle de ticket CLOSED
  // ----------------------------------------------------------------
  test('F-26: Feliz — detalle de ticket CLOSED', { tag: ['@p0', '@ac04'] }, async () => {
    const res = await apiGet(ctx, token, `${TICKETS_URL}/${closedTicketId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.id).toBe(closedTicketId);
    expect(body.status).toBe('CLOSED');

    // Snapshots (inmutables)
    expect(body.officialSnapshot).toBeTruthy();
    expect(body.fieldSnapshot).toBeTruthy();

    // closedAt
    expect(body.closedAt).toBeTruthy();
    expect(typeof body.closedAt).toBe('string');

    // Resolution
    expect(body.resolution).not.toBeNull();
    expect(body.resolution.decision).toBe('OFICIAL_PREVALECE');
    expect(body.resolution.reason).toBe('Se cierra el ticket para tests de detalle CLOSED');
    expect(body.resolution.resolvedByEmail).toBe('vet@bovinotech.co');
    expect(body.resolution.resolvedAt).toBeTruthy();
    expect(typeof body.resolution.resolvedAt).toBe('string');
  });

  // ----------------------------------------------------------------
  // F-27: Negativo — ticket inexistente
  // ----------------------------------------------------------------
  test('F-27: Negativo — ticket inexistente', { tag: ['@p0'] }, async () => {
    const res = await apiGet(ctx, token, `${TICKETS_URL}/999999`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail).toBe('Ticket de conciliación no encontrado.');
  });

  // ----------------------------------------------------------------
  // F-28: Negativo — ticket de otra finca
  // ----------------------------------------------------------------
  test('F-28: Negativo — ticket de otra finca', { tag: ['@p1', '@d10'] }, async () => {
    // Login as vet2 with farm_id = 2
    const farm2Login = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    const farm2Token = farm2Login.access_token;

    // Try to see a ticket from farm 1
    const res = await apiGet(ctx, farm2Token, `${TICKETS_URL}/${openTicketId}`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail).toBe('Ticket de conciliación no encontrado.');
  });

  // ----------------------------------------------------------------
  // F-29: Negativo — sin autenticación
  // ----------------------------------------------------------------
  test('F-29: Negativo — sin autenticación', { tag: ['@p0'] }, async () => {
    const res = await ctx.get(`${TICKETS_URL}/${openTicketId}`);
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('Not authenticated');
  });

  // ----------------------------------------------------------------
  // F-30: Negativo — token sin farm_id
  // Backend asigna farm_id desde perfil del usuario automáticamente.
  // ----------------------------------------------------------------
  test('F-30: Negativo — token sin farm_id (comportamiento real: auto-asigna)', { tag: ['@p0', '@d10'] }, async () => {
    const loginRes = await ctx.post('/auth/login', {
      data: { username: 'vet@bovinotech.co', password: 'password123' },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();

    const res = await ctx.get(`${TICKETS_URL}/${openTicketId}`, {
      headers: { Authorization: `Bearer ${loginData.access_token}` },
    });
    // Backend asigna farm_id desde perfil del usuario
    expect(res.status()).toBe(200);
  });
});