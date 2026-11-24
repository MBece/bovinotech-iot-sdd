import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiPost, apiGet } from '../../fixtures/shared.js';

const BASE_URL = process.env.TARGET === 'render'
  ? 'https://bovinotech-iot-sdd.onrender.com'
  : 'http://localhost:8000';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

/**
 * E2E tests for HU-05 sinigan_sync.
 *
 * Render only exposes the backend API (no frontend/React UI).
 * These tests simulate complete end-to-end user journeys by chaining
 * API calls as a user would through the UI.
 */
test.describe('E2E - Sinigan Sync', () => {
  let ctx;
  let vetToken;
  let operarioToken;
  let vet2Farm2Token;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });

    // Pre-login all users
    const vetLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet);
    vetToken = vetLogin.access_token;

    const operarioLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    operarioToken = operarioLogin.access_token;

    const farm2Login = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    vet2Farm2Token = farm2Login.access_token;
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  // ----------------------------------------------------------------
  // E2E-01: Flujo feliz — comparación consistente
  // ----------------------------------------------------------------
  test('E2E-01: Flujo feliz — comparación consistente', { tag: ['@p0', '@ac01', '@e2e'] }, async () => {
    // 1. Login (already done in beforeAll)
    // 2. Navigate to compare section → POST /comparisons
    // 3. Compare consistent DIN
    const res = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000001' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    // 4. Verify result: CONSISTENTE + mock label visible
    expect(body.result).toBe('CONSISTENTE');
    expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');

    // 5. Datos oficiales y de campo coinciden — no discrepancies
    expect(body.discrepancies).toEqual([]);

    // 6. No se genera ticket
    expect(body.ticket).toBeNull();

    // Verify via ticket list that no ticket was created
    const listRes = await apiGet(ctx, vetToken, TICKETS_URL);
    const listBody = await listRes.json();
    const ticketsForDin = listBody.items.filter(t => t.din === 'DIN-DEMO-000001');
    expect(ticketsForDin.length).toBe(0);
  });

  // ----------------------------------------------------------------
  // E2E-02: Flujo feliz — discrepancia → ticket → detalle
  // ----------------------------------------------------------------
  test('E2E-02: Flujo feliz — discrepancia → ticket → detalle', { tag: ['@p0', '@ac01', '@ac03', '@e2e'] }, async () => {
    // 1. Login como operario
    // 2. Comparar DIN con discrepancia de sexo
    const res = await apiPost(ctx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    // 3. Verificar resultado DISCREPANCIA + valores (MACHO vs HEMBRA)
    expect(body.result).toBe('DISCREPANCIA');

    const sexDisc = body.discrepancies.find(d => d.fieldName === 'sex');
    expect(sexDisc).toBeDefined();
    expect(sexDisc.officialValue).toBe('MACHO');
    expect(sexDisc.fieldValue).toBe('HEMBRA');

    // Verificar etiqueta de simulación
    expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');

    // 4. Indicador visual de ticket generado
    expect(body.ticket).not.toBeNull();
    expect(body.ticket.status).toBe('OPEN');
    const ticketId = body.ticket.id;

    // 5. Navegar al listado de tickets y verificar que aparece
    const listRes = await apiGet(ctx, operarioToken, TICKETS_URL);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const foundTicket = listBody.items.find(t => t.din === 'DIN-DEMO-000002');
    expect(foundTicket).toBeDefined();
    expect(foundTicket.status).toBe('OPEN');
    expect(foundTicket.farmId).toBe(1);

    // 6. Ver detalle del ticket
    const detailRes = await apiGet(ctx, operarioToken, `${TICKETS_URL}/${ticketId}`);
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();

    // Verificar snapshots y discrepancias
    expect(detail.officialSnapshot).toBeTruthy();
    expect(detail.fieldSnapshot).toBeTruthy();
    expect(detail.discrepancies.length).toBeGreaterThanOrEqual(1);
    expect(detail.resolution).toBeNull();

    // Verificar officialSource tag
    expect(detail.officialSource).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
    expect(detail.fieldSource).toBe('REGISTRO DE CAMPO');
  });

  // ----------------------------------------------------------------
  // E2E-03: Flujo feliz — veterinario resuelve ticket
  // ----------------------------------------------------------------
  test('E2E-03: Flujo feliz — veterinario resuelve ticket', { tag: ['@p0', '@ac04', '@e2e'] }, async () => {
    // 1. Login como VETERINARIO (vetToken)
    // 2. Crear un ticket fresco (usar DIN que no se haya resuelto aún)
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000004' });
    const freshBody = await freshRes.json();
    expect(freshBody.ticket).not.toBeNull();
    const ticketId = freshBody.ticket.id;

    // 3. Ver ticket en listado
    const listRes = await apiGet(ctx, vetToken, `${TICKETS_URL}?din=DIN-DEMO-000004`);
    const listBody = await listRes.json();
    expect(listBody.items.length).toBeGreaterThanOrEqual(1);
    const ticketFromList = listBody.items.find(t => t.id === ticketId);
    expect(ticketFromList).toBeDefined();
    expect(ticketFromList.status).toBe('OPEN');

    // 4. Ver detalle — botón Resolver estaría activo (simulado via API)
    const detailRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const detail = await detailRes.json();
    expect(detail.status).toBe('OPEN');
    expect(detail.discrepancies.length).toBeGreaterThan(0);
    expect(detail.resolution).toBeNull();

    // 5. Veterinario resuelve
    const resolveRes = await apiPost(ctx, vetToken, `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'El registro oficial debe prevalecer según normativa vigente',
    });
    expect(resolveRes.status()).toBe(201);

    const resolved = await resolveRes.json();
    expect(resolved.status).toBe('CLOSED');

    // 6. Verificar que ticket ahora muestra CLOSED en listado
    const listAfterRes = await apiGet(ctx, vetToken, TICKETS_URL);
    const listAfter = await listAfterRes.json();
    const resolvedTicket = listAfter.items.find(t => t.id === ticketId);
    expect(resolvedTicket).toBeDefined();
    expect(resolvedTicket.status).toBe('CLOSED');

    // 7. Ver detalle con resolución visible
    const detailAfterRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const detailAfter = await detailAfterRes.json();

    expect(detailAfter.status).toBe('CLOSED');
    expect(detailAfter.resolution).not.toBeNull();
    expect(detailAfter.resolution.decision).toBe('OFICIAL_PREVALECE');
    expect(detailAfter.resolution.reason).toBe('El registro oficial debe prevalecer según normativa vigente');
    expect(detailAfter.resolution.resolvedByEmail).toBe('vet@bovinotech.co');
    expect(detailAfter.resolution.resolvedAt).toBeTruthy();
  });

  // ----------------------------------------------------------------
  // E2E-04: Flujo negativo — OPERARIO intenta resolver
  // ----------------------------------------------------------------
  test('E2E-04: Flujo negativo — OPERARIO intenta resolver', { tag: ['@p1', '@ac04', '@e2e'] }, async () => {
    // 1. Login como operario
    // 2. Obtener un ticket OPEN
    const res = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    const body = await res.json();
    const ticketId = body.ticket.id;

    // 3. OPERARIO intenta resolver via API → 403
    const resolveRes = await apiPost(ctx, operarioToken, `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Intento de resolución por operario',
    });
    expect(resolveRes.status()).toBe(403);

    const errorBody = await resolveRes.json();
    expect(errorBody.detail || errorBody.message || errorBody.error).toBeTruthy();

    // 4. Ticket sigue OPEN
    const detailRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const detail = await detailRes.json();
    expect(detail.status).toBe('OPEN');
  });

  // ----------------------------------------------------------------
  // E2E-05: Flujo negativo — login sin farm_id
  // ----------------------------------------------------------------
  test('E2E-05: Flujo negativo — login sin farm_id', { tag: ['@p0', '@d10', '@e2e'] }, async () => {
    // Login sin farm_id — backend auto-asigna desde perfil del usuario
    const loginRes = await ctx.post('/auth/login', {
      data: { username: 'vet@bovinotech.co', password: 'password123' },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();

    // El backend asigna farm_id desde el perfil del usuario automáticamente
    // La request a conciliación es exitosa porque el usuario tiene farm asignado
    const res = await ctx.post(COMPARISONS_URL, {
      headers: { Authorization: `Bearer ${loginData.access_token}` },
      data: { din: 'DIN-DEMO-000001' },
    });
    expect(res.status()).toBe(200);
  });

  // ----------------------------------------------------------------
  // E2E-06: Flujo negativo — aislamiento por finca
  // ----------------------------------------------------------------
  test('E2E-06: Flujo negativo — aislamiento por finca', { tag: ['@p1', '@d10', '@e2e'] }, async () => {
    // 1. Login como vet2 con farm_id = 2
    // 2. Listar tickets → vacío o sin tickets de finca 1
    const listRes = await apiGet(ctx, vet2Farm2Token, TICKETS_URL);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.items)).toBe(true);

    for (const ticket of listBody.items) {
      expect(ticket.farmId).not.toBe(1);
    }

    // 3. Intentar ver detalle de ticket de finca 1 → 404
    // Primero obtener un ticket ID de finca 1
    const farm1ListRes = await apiGet(ctx, vetToken, TICKETS_URL);
    const farm1List = await farm1ListRes.json();
    if (farm1List.items.length > 0) {
      const farm1TicketId = farm1List.items[0].id;

      const detailRes = await apiGet(ctx, vet2Farm2Token, `${TICKETS_URL}/${farm1TicketId}`);
      expect(detailRes.status()).toBe(404);
    }
  });

  // ----------------------------------------------------------------
  // E2E-07: Flujo borde — DIN no encontrado
  // ----------------------------------------------------------------
  test('E2E-07: Flujo borde — DIN no encontrado', { tag: ['@p1', '@ac02', '@e2e'] }, async () => {
    // 1. Login como operario
    // 2. Comparar DIN inexistente
    const res = await apiPost(ctx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-999999' });
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail || body.message || body.error).toBeTruthy();

    // 3. Ir a listado de tickets — no se creó ningún ticket nuevo
    const listRes = await apiGet(ctx, operarioToken, TICKETS_URL);
    const listBody = await listRes.json();
    const ticketsForDin = listBody.items.filter(t => t.din === 'DIN-DEMO-999999');
    expect(ticketsForDin.length).toBe(0);
  });

  // ----------------------------------------------------------------
  // E2E-08: Flujo borde — motivo inválido al resolver
  // ----------------------------------------------------------------
  test('E2E-08: Flujo borde — motivo inválido al resolver', { tag: ['@p1', '@ac04', '@e2e'] }, async () => {
    // 1. Login como VETERINARIO
    // 2. Crear un ticket fresco
    const freshRes = await apiPost(ctx, vetToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    const freshBody = await freshRes.json();
    const ticketId = freshBody.ticket.id;

    // 3. Intentar resolver con motivo < 5 caracteres
    const shortRes = await apiPost(ctx, vetToken, `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'ab',
    });
    expect(shortRes.status()).toBe(422);

    // 4. Intentar resolver con motivo vacío
    const emptyRes = await apiPost(ctx, vetToken, `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: '',
    });
    expect(emptyRes.status()).toBe(422);

    // 5. Ticket sigue OPEN
    const detailRes = await apiGet(ctx, vetToken, `${TICKETS_URL}/${ticketId}`);
    const detail = await detailRes.json();
    expect(detail.status).toBe('OPEN');
  });

  // ----------------------------------------------------------------
  // E2E-09: Flujo de verificación de etiqueta "MODO SIMULADO"
  // ----------------------------------------------------------------
  test('E2E-09: Flujo de verificación de etiqueta MODO SIMULADO', { tag: ['@p0', '@ac01', '@e2e'] }, async () => {
    // 1. Login como operario
    // 2. Comparar cualquier DIN con discrepancia
    const res = await apiPost(ctx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    // 3. Verificar etiqueta MODO SIMULADO en meta
    expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
    expect(body.meta.sourceMode).toBe('SIMULADO');
    expect(body.meta.isSimulation).toBe(true);

    // 4. En detalle de ticket, officialSource muestra la etiqueta
    const ticketId = body.ticket.id;
    const detailRes = await apiGet(ctx, operarioToken, `${TICKETS_URL}/${ticketId}`);
    const detail = await detailRes.json();

    expect(detail.officialSource).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
    expect(detail.fieldSource).toBe('REGISTRO DE CAMPO');

    // Verificar que en discrepancias también se menciona la fuente
    for (const disc of detail.discrepancies) {
      expect(disc.officialSource).toBeTruthy();
      expect(disc.fieldSource).toBeTruthy();
    }
  });
});