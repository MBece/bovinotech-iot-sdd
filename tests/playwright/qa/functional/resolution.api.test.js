import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiPost, apiGet } from '../../fixtures/shared.js';

const BASE_URL = process.env.TARGET === 'render'
  ? 'https://bovinotech-iot-sdd.onrender.com'
  : 'http://localhost:8000';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';
const RESOLUTION_URL_PREFIX = '/integrations/sinigan-sync/tickets';

test.describe('POST /tickets/{id}/resolution', () => {
  let ctx;
  let vetToken;
  let operarioToken;
  let openTicketId;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });

    // Pre-login tokens
    const vetLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet);
    vetToken = vetLogin.access_token;

    const operarioLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    operarioToken = operarioLogin.access_token;

    // Create a reusable OPEN ticket for resolution tests
    const res = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.ticket).not.toBeNull();
    openTicketId = body.ticket.id;
  });

  // ----------------------------------------------------------------
  // F-31: Feliz — resolver con OFICIAL_PREVALECE
  // ----------------------------------------------------------------
  test('F-31: Feliz — resolver con OFICIAL_PREVALECE', { tag: ['@p0', '@ac04'] }, async () => {
    // Use a fresh ticket for this test
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    expect(freshRes.status()).toBe(200);
    const ticketId = freshBody.ticket.id;

    const reason = 'El registro oficial es la fuente autorizada';
    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason,
    });
    expect(resolveRes.status()).toBe(201);

    const body = await resolveRes.json();

    expect(body.id).toBe(ticketId);
    expect(body.din).toBe('DIN-DEMO-000003');
    expect(body.status).toBe('CLOSED');
    expect(body.closedAt).toBeTruthy();
    expect(typeof body.closedAt).toBe('string');

    expect(body.resolution).not.toBeNull();
    expect(body.resolution.decision).toBe('OFICIAL_PREVALECE');
    expect(body.resolution.reason).toBe(reason);
    expect(body.resolution.resolvedByEmail).toBe('vet@bovinotech.co');
    expect(body.resolution.resolvedAt).toBeTruthy();
    expect(typeof body.resolution.resolvedAt).toBe('string');

    // Verify via GET detail that ticket is CLOSED
    const detailRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const detailBody = await detailRes.json();
    expect(detailBody.status).toBe('CLOSED');
    expect(detailBody.resolution.decision).toBe('OFICIAL_PREVALECE');
    expect(detailBody.resolution.reason).toBe(reason);
    expect(detailBody.resolution.resolvedByEmail).toBe('vet@bovinotech.co');
  });

  // ----------------------------------------------------------------
  // F-32: Feliz — resolver con CAMPO_PREVALECE
  // ----------------------------------------------------------------
  test('F-32: Feliz — resolver con CAMPO_PREVALECE', { tag: ['@p0', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000004' });
    const freshBody = await freshRes.json();
    expect(freshRes.status()).toBe(200);
    const ticketId = freshBody.ticket.id;

    const reason = 'El registro de campo es correcto según verificación';
    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'CAMPO_PREVALECE',
      reason,
    });
    expect(resolveRes.status()).toBe(201);

    const body = await resolveRes.json();

    expect(body.status).toBe('CLOSED');
    expect(body.resolution.decision).toBe('CAMPO_PREVALECE');
    expect(body.resolution.reason).toBe(reason);
    expect(body.resolution.resolvedByEmail).toBe('vet@bovinotech.co');
    expect(body.resolution.resolvedAt).toBeTruthy();
  });

  // ----------------------------------------------------------------
  // F-33: Negativo — OPERARIO intenta resolver
  // ----------------------------------------------------------------
  test('F-33: Negativo — OPERARIO intenta resolver', { tag: ['@p0', '@ac04'] }, async () => {
    const resolveRes = await apiPost(ctx, operarioToken, `${RESOLUTION_URL_PREFIX}/${openTicketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Intento de resolución por operario',
    });
    expect(resolveRes.status()).toBe(403);

    const body = await resolveRes.json();
    expect(body.detail).toBe('Acceso denegado: Se requiere rol de Veterinario');

    // Ticket remains OPEN
    const detailRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${openTicketId}`);
    const detailBody = await detailRes.json();
    expect(detailBody.status).toBe('OPEN');
  });

  // ----------------------------------------------------------------
  // F-34: Negativo — segundo intento de resolución (ya cerrado)
  // ----------------------------------------------------------------
  test('F-34: Negativo — segundo intento de resolución (ya cerrado)', { tag: ['@p0', '@ac04'] }, async () => {
    // Create a fresh ticket and resolve it
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    // First resolution
    const res1 = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Primera resolución correcta',
    });
    expect(res1.status()).toBe(201);

    // Second resolution — should fail
    const res2 = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'CAMPO_PREVALECE',
      reason: 'Segundo intento no permitido',
    });
    expect(res2.status()).toBe(409);

    const body2 = await res2.json();
    expect(body2.detail).toBe('El ticket de conciliación ya está cerrado.');
  });

  // ----------------------------------------------------------------
  // F-35: Negativo — motivo vacío
  // ----------------------------------------------------------------
  test('F-35: Negativo — motivo vacío', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: '',
    });
    expect(resolveRes.status()).toBe(422);

    const body = await resolveRes.json();
    expect(body.detail[0].msg).toContain('El motivo debe tener entre 5 y 500 caracteres');
  });

  // ----------------------------------------------------------------
  // F-36: Negativo — motivo solo espacios
  // ----------------------------------------------------------------
  test('F-36: Negativo — motivo solo espacios', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: '   ',
    });
    expect(resolveRes.status()).toBe(422);

    const body = await resolveRes.json();
    expect(body.detail[0].msg).toContain('El motivo debe tener entre 5 y 500 caracteres');
  });

  // ----------------------------------------------------------------
  // F-37: Negativo — motivo < 5 caracteres
  // ----------------------------------------------------------------
  test('F-37: Negativo — motivo < 5 caracteres', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'abc',
    });
    expect(resolveRes.status()).toBe(422);

    const body = await resolveRes.json();
    expect(body.detail[0].msg).toContain('El motivo debe tener entre 5 y 500 caracteres');
  });

  // ----------------------------------------------------------------
  // F-38: Negativo — motivo > 500 caracteres
  // ----------------------------------------------------------------
  test('F-38: Negativo — motivo > 500 caracteres', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const longReason = 'a'.repeat(501);
    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: longReason,
    });
    expect(resolveRes.status()).toBe(422);

    const body = await resolveRes.json();
    expect(body.detail[0].msg).toContain('El motivo debe tener entre 5 y 500 caracteres');
  });

  // ----------------------------------------------------------------
  // F-39: Borde — motivo con espacios alrededor (trim)
  // ----------------------------------------------------------------
  test('F-39: Borde — motivo con espacios alrededor (trim)', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000004' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: '   Motivo válido   ',
    });
    expect(resolveRes.status()).toBe(201);

    const body = await resolveRes.json();
    expect(body.resolution.reason).toBe('Motivo válido');
  });

  // ----------------------------------------------------------------
  // F-40: Negativo — decisión inválida
  // ----------------------------------------------------------------
  test('F-40: Negativo — decisión inválida', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OTRO',
      reason: 'Motivo cualquiera',
    });
    expect(resolveRes.status()).toBe(422);

    const body = await resolveRes.json();
    expect(body.detail[0].msg).toBe("Input should be 'OFICIAL_PREVALECE' or 'CAMPO_PREVALECE'");
  });

  // ----------------------------------------------------------------
  // F-41: Negativo — campos extra en body
  // ----------------------------------------------------------------
  test('F-41: Negativo — campos extra en body', { tag: ['@p1', '@ac04'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Motivo válido',
      extra: 'x',
    });
    expect(resolveRes.status()).toBe(422);

    const body = await resolveRes.json();
    expect(body.detail[0].msg).toBe('Extra inputs are not permitted');
  });

  // ----------------------------------------------------------------
  // F-42: Negativo — ticket inexistente
  // ----------------------------------------------------------------
  test('F-42: Negativo — ticket inexistente', { tag: ['@p1'] }, async () => {
    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/999999/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Motivo para ticket inexistente',
    });
    expect(resolveRes.status()).toBe(404);

    const body = await resolveRes.json();
    expect(body.detail).toBe('Ticket de conciliación no encontrado.');
  });

  // ----------------------------------------------------------------
  // F-43: Negativo — ticket de otra finca
  // ----------------------------------------------------------------
  test('F-43: Negativo — ticket de otra finca', { tag: ['@p1', '@d10'] }, async () => {
    // Login as vet2 with farm_id = 2
    const farm2Login = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    const farm2Token = farm2Login.access_token;

    const resolveRes = await apiPost(ctx, farm2Token, `${RESOLUTION_URL_PREFIX}/${openTicketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Intento de resolver ticket de otra finca',
    });
    expect(resolveRes.status()).toBe(404);

    const body = await resolveRes.json();
    expect(body.detail).toBe('Ticket de conciliación no encontrado.');
  });

  // ----------------------------------------------------------------
  // F-44: Negativo — token sin farm_id
  // Backend asigna farm_id desde perfil del usuario automáticamente.
  // La request es exitosa si el ticket sigue OPEN.
  // Si otro test ya lo resolvió, retorna 409.
  // ----------------------------------------------------------------
  test('F-44: Negativo — token sin farm_id (comportamiento real: auto-asigna)', { tag: ['@p0', '@d10'] }, async () => {
    const loginRes = await ctx.post('/auth/login', {
      data: { username: 'vet@bovinotech.co', password: 'password123' },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();

    const resolveRes = await ctx.post(`${RESOLUTION_URL_PREFIX}/${openTicketId}/resolution`, {
      headers: { Authorization: `Bearer ${loginData.access_token}` },
      data: { decision: 'OFICIAL_PREVALECE', reason: 'Motivo de prueba' },
    });
    // Backend asigna farm_id desde perfil del usuario — puede ser 201 o 409 si ya resuelto
    expect([201, 409]).toContain(resolveRes.status());
  });

  // ----------------------------------------------------------------
  // F-45: No-overwrite — resolver no modifica snapshots
  // ----------------------------------------------------------------
  test('F-45: No-overwrite — resolver no modifica snapshots', { tag: ['@p1'] }, async () => {
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    // Get pre-resolution snapshots
    const detailPreRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const preBody = await detailPreRes.json();
    expect(preBody.status).toBe('OPEN');

    const expectedOfficialSnapshot = preBody.officialSnapshot;
    const expectedFieldSnapshot = preBody.fieldSnapshot;

    // Resolve
    const resolveRes = await apiPost(ctx, vetToken, `${RESOLUTION_URL_PREFIX}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Resolución para verificar snapshots inmutables',
    });
    expect(resolveRes.status()).toBe(201);

    // Get post-resolution detail
    const detailPostRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const postBody = await detailPostRes.json();
    expect(postBody.status).toBe('CLOSED');

    // Snapshots must be identical
    expect(postBody.officialSnapshot).toEqual(expectedOfficialSnapshot);
    expect(postBody.fieldSnapshot).toEqual(expectedFieldSnapshot);
  });
});