import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiGet, apiPost } from '../fixtures/shared.js';
import { signToken } from './helpers/jwt-utils.js';

const BASE_URL = 'https://bovinotech-iot-sdd.onrender.com';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('RBAC - Broken Function Level Authorization', () => {
  let ctx;

  test.beforeAll(async () => {
    ctx = await request.newContext({ baseURL: BASE_URL });
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  // ----------------------------------------------------------------
  // TC-SEC-09: OPERARIO intenta resolver → 403
  // ----------------------------------------------------------------
  test('TC-SEC-09: OPERARIO cannot resolve tickets @security-sinigan @p0 @rbac', async () => {
    // Login as operario (farm_id=1) and create a ticket
    const opLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    const opToken = opLogin.access_token;

    const compRes = await apiPost(ctx, opToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(compRes.status()).toBe(200);
    const compBody = await compRes.json();
    const ticketId = compBody.ticket.id;

    // Try to resolve with OPERARIO token
    const resolveRes = await apiPost(ctx, opToken, `${TICKETS_URL}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Se valida la ficha oficial y se solicita corrección del registro de campo.',
    });
    expect(resolveRes.status()).toBe(403);

    const resolveBody = await resolveRes.json();
    expect(resolveBody.detail).toBe('Acceso denegado: Se requiere rol de Veterinario');

    // Verify ticket remains OPEN
    const ticketRes = await apiGet(ctx, opToken, `${TICKETS_URL}/${ticketId}`);
    expect(ticketRes.status()).toBe(200);
    const ticketBody = await ticketRes.json();
    expect(ticketBody.status).toBe('OPEN');
    expect(ticketBody.resolution).toBeNull();
  });

  // ----------------------------------------------------------------
  // TC-SEC-10: ADMINISTRADOR intenta resolver → 403
  // ----------------------------------------------------------------
  test('TC-SEC-10: ADMINISTRADOR cannot resolve tickets @security-sinigan @p0 @rbac', async () => {
    // Create a ticket using operario (farm_id=1)
    const opLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    const opToken = opLogin.access_token;

    const compRes = await apiPost(ctx, opToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(compRes.status()).toBe(200);
    const compBody = await compRes.json();
    const ticketId = compBody.ticket.id;

    // Login as admin (farm_id=1)
    const adminLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.admin);
    const adminToken = adminLogin.access_token;

    // Try to resolve with ADMINISTRADOR token
    const resolveRes = await apiPost(ctx, adminToken, `${TICKETS_URL}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Se valida la ficha oficial y se solicita corrección del registro de campo.',
    });
    expect(resolveRes.status()).toBe(403);

    const resolveBody = await resolveRes.json();
    expect(resolveBody.detail).toBe('Acceso denegado: Se requiere rol de Veterinario');
  });

  // ----------------------------------------------------------------
  // TC-SEC-11: Rol inventado → 401 (operario real, rol manipulado)
  // El backend valida el usuario y finca contra DB (pasa), pero detecta
  // inconsistencia en claims → rechaza en auth level con 401.
  // ----------------------------------------------------------------
  test('TC-SEC-11: Invented role rejected @security-sinigan @p1 @rbac', async () => {
    // Create a ticket using operario
    const opLogin = await apiLogin(ctx, DEFAULT_CREDENTIALS.operario);
    const opToken = opLogin.access_token;

    const compRes = await apiPost(ctx, opToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(compRes.status()).toBe(200);
    const compBody = await compRes.json();
    const ticketId = compBody.ticket.id;

    // Generate a token with a real existing user (operario) but an invented role.
    // The backend detects the role mismatch at auth level → 401.
    const fakeRoleToken = signToken({
      sub: 'operario@bovinotech.co',
      role: 'INVENTADO',
      farm_id: 1,
    });

    const resolveRes = await apiPost(ctx, fakeRoleToken, `${TICKETS_URL}/${ticketId}/resolution`, {
      decision: 'OFICIAL_PREVALECE',
      reason: 'Se valida la ficha oficial y se solicita corrección del registro de campo.',
    });
    // Backend rejects inconsistent claims at auth level
    expect(resolveRes.status()).toBe(401);

    const resolveBody = await resolveRes.json();
    expect(resolveBody.detail).toBe('No se pudieron validar las credenciales');
  });
});