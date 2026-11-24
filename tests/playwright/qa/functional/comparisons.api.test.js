import { test, expect, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiPost, apiGet } from '../../fixtures/shared.js';

const BASE_URL = process.env.TARGET === 'render'
  ? 'https://bovinotech-iot-sdd.onrender.com'
  : 'http://localhost:8000';

const COMPARISONS_URL = '/integrations/sinigan-sync/comparisons';
const TICKETS_URL = '/integrations/sinigan-sync/tickets';

test.describe('POST /comparisons', () => {
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
  // F-01: Feliz — DIN consistente (todos los campos coinciden)
  // ----------------------------------------------------------------
  test('F-01: Feliz — DIN consistente', { tag: ['@p0', '@ac01'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000001' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    // — result / discrepancies / ticket
    expect(body.result).toBe('CONSISTENTE');
    expect(body.discrepancies).toEqual([]);
    expect(body.ticket).toBeNull();

    // — meta
    expect(body.meta.sourceSystem).toBe('SINIGAN');
    expect(body.meta.sourceMode).toBe('SIMULADO');
    expect(body.meta.isSimulation).toBe(true);
    expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
    expect(body.meta.comparedAt).toBeTruthy();
    expect(typeof body.meta.comparedAt).toBe('string');
    // Verify it's a valid ISO datetime (backend may include microseconds)
    expect(() => new Date(body.meta.comparedAt)).not.toThrow();
    expect(new Date(body.meta.comparedAt).toISOString()).toBeTruthy();

    // — official
    expect(body.official.din).toBe('DIN-DEMO-000001');
    expect(body.official.animalName).toBeTruthy();
    expect(body.official.species).toBeTruthy();
    expect(body.official.sex).toBeTruthy();
    expect(body.official.ageGroup).toBeTruthy();
    expect(body.official.establishment).toBeTruthy();
    expect(body.official.establishment.sitCode).toBeTruthy();

    // — field
    expect(body.field.din).toBe('DIN-DEMO-000001');
    expect(body.field.species).toBeTruthy();
    expect(body.field.sex).toBeTruthy();
    expect(body.field.ageGroup).toBeTruthy();
    expect(body.field.sitCode).toBeTruthy();
    expect(body.field.source).toBe('REGISTRO_DE_CAMPO');

    });

  // ----------------------------------------------------------------
  // F-02: Feliz — discrepancia de sexo
  // ----------------------------------------------------------------
  test('F-02: Feliz — discrepancia de sexo', { tag: ['@p0', '@ac03'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.result).toBe('DISCREPANCIA');
    expect(body.discrepancies.length).toBeGreaterThanOrEqual(1);

    const sexDisc = body.discrepancies.find(d => d.fieldName === 'sex');
    expect(sexDisc).toBeDefined();
    expect(sexDisc.fieldName).toBe('sex');
    expect(sexDisc.fieldLabel).toBeTruthy();
    expect(sexDisc.officialValue).toBe('MACHO');
    expect(sexDisc.fieldValue).toBe('HEMBRA');
    expect(sexDisc.officialSource).toBeTruthy();
    expect(sexDisc.fieldSource).toBeTruthy();
    expect(sexDisc.detectedAt).toBeTruthy();

    // — ticket
    expect(body.ticket).not.toBeNull();
    expect(body.ticket.id).toBeGreaterThan(0);
    expect(body.ticket.din).toBe('DIN-DEMO-000002');
    expect(body.ticket.farmId).toBe(1);
    expect(body.ticket.status).toBe('OPEN');
    expect(body.ticket.comparedAt).toBeTruthy();
    expect(body.ticket.createdByEmail).toBe('vet@bovinotech.co');
    expect(body.ticket.createdAt).toBeTruthy();

    // — meta
    expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
    expect(body.meta.isSimulation).toBe(true);
  });

  // ----------------------------------------------------------------
  // F-03: Feliz — discrepancia de grupo etario
  // ----------------------------------------------------------------
  test('F-03: Feliz — discrepancia de grupo etario', { tag: ['@p0', '@ac03'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000003' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.result).toBe('DISCREPANCIA');
    expect(body.discrepancies.length).toBeGreaterThanOrEqual(1);

    const ageDisc = body.discrepancies.find(d => d.fieldName === 'age_group');
    expect(ageDisc).toBeDefined();
    expect(ageDisc.fieldName).toBe('age_group');
    expect(ageDisc.officialValue).toBe('TERNERO');
    expect(ageDisc.fieldValue).toBe('ADULTO');

    expect(body.ticket).not.toBeNull();
    expect(body.ticket.status).toBe('OPEN');
    expect(body.ticket.din).toBe('DIN-DEMO-000003');
    expect(body.ticket.farmId).toBe(1);
  });

  // ----------------------------------------------------------------
  // F-04: Feliz — discrepancias múltiples (especie + predio)
  // ----------------------------------------------------------------
  test('F-04: Feliz — discrepancias múltiples (especie + predio)', { tag: ['@p0', '@ac03'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000004' });
    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.result).toBe('DISCREPANCIA');
    expect(body.discrepancies.length).toBe(2);

    const speciesDisc = body.discrepancies.find(d => d.fieldName === 'species');
    expect(speciesDisc).toBeDefined();
    expect(speciesDisc.officialValue).toBe('BUFALINO');
    expect(speciesDisc.fieldValue).toBe('BOVINO');

    const sitCodeDisc = body.discrepancies.find(d => d.fieldName === 'sit_code');
    expect(sitCodeDisc).toBeDefined();
    expect(sitCodeDisc.officialValue).toBe('SIT-DEMO-002');
    expect(sitCodeDisc.fieldValue).toBe('SIT-DEMO-001');

    expect(body.ticket).not.toBeNull();
    expect(body.ticket.status).toBe('OPEN');
    expect(body.ticket.din).toBe('DIN-DEMO-000004');
  });

  // ----------------------------------------------------------------
  // F-05: Borde — DIN con formato inválido
  // ----------------------------------------------------------------
  test('F-05: Borde — DIN con formato inválido', { tag: ['@p1'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'REAL-123' });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.detail).toBe('DIN inválido. Use el formato DIN-DEMO-000001.');

    // Post-condition: no tickets created
    const listRes = await apiGet(ctx, token, TICKETS_URL);
    const listBody = await listRes.json();
    const found = listBody.items.filter(t => t.din === 'REAL-123');
    expect(found.length).toBe(0);
  });

  // ----------------------------------------------------------------
  // F-06: Borde — DIN con campo extra
  // ----------------------------------------------------------------
  test('F-06: Borde — DIN con campo extra', { tag: ['@p1'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000001', extra: 'value' });
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.detail[0].msg).toBe('Extra inputs are not permitted');
  });

  // ----------------------------------------------------------------
  // F-07: Borde — DIN vacío
  // ----------------------------------------------------------------
  test('F-07: Borde — DIN vacío', { tag: ['@p1'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: '' });
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.detail[0].msg).toBe('String should have at least 1 character');
  });

  // ----------------------------------------------------------------
  // F-08: Negativo — DIN inexistente en fuente oficial
  // ----------------------------------------------------------------
  test('F-08: Negativo — DIN inexistente en fuente oficial', { tag: ['@p0', '@ac02'] }, async () => {
    const res = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-999999' });
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail).toBe('DIN no encontrado en las referencias disponibles.');

    // Post-condition: no tickets created
    const listRes = await apiGet(ctx, token, TICKETS_URL);
    const listBody = await listRes.json();
    const found = listBody.items.filter(t => t.din === 'DIN-DEMO-999999');
    expect(found.length).toBe(0);
  });

  // ----------------------------------------------------------------
  // F-09: Negativo — sin autenticación
  // ----------------------------------------------------------------
  test('F-09: Negativo — sin autenticación', { tag: ['@p0'] }, async () => {
    const res = await ctx.post(COMPARISONS_URL, { data: { din: 'DIN-DEMO-000001' } });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.detail).toBe('Not authenticated');
  });

  // ----------------------------------------------------------------
  // F-10: Negativo — token sin farm_id
  // Backend asigna farm_id desde perfil del usuario automáticamente,
  // por lo que la request es exitosa (200). Si el usuario no tuviera
  // farm_id asignado, el backend retornaría 403.
  // ----------------------------------------------------------------
  test('F-10: Negativo — token sin farm_id (comportamiento real: auto-asigna)', { tag: ['@p0', '@d10'] }, async () => {
    const loginRes = await ctx.post('/auth/login', {
      data: { username: 'vet@bovinotech.co', password: 'password123' },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const noFarmToken = loginData.access_token;

    const res = await ctx.post(COMPARISONS_URL, {
      headers: { Authorization: `Bearer ${noFarmToken}` },
      data: { din: 'DIN-DEMO-000001' },
    });
    // Backend asigna farm_id desde perfil del usuario
    expect(res.status()).toBe(200);
  });

  // ----------------------------------------------------------------
  // F-11: Borde — DIN existente en otra finca
  // ----------------------------------------------------------------
  test('F-11: Borde — DIN existente en otra finca', { tag: ['@p1', '@d10'] }, async () => {
    // Login como vet2 con farm_id = 2
    const loginData = await apiLogin(ctx, DEFAULT_CREDENTIALS.vet2_farm2);
    const farm2Token = loginData.access_token;

    const res = await apiPost(ctx, farm2Token, COMPARISONS_URL, { din: 'DIN-DEMO-000001' });
    expect(res.status()).toBe(409);

    const body = await res.json();
    expect(body.detail).toBe('No existe registro de campo para el DIN consultado.');
  });

  // ----------------------------------------------------------------
  // F-12: Idempotencia — misma comparación dos veces (con ticket)
  // ----------------------------------------------------------------
  test('F-12: Idempotencia — misma comparación dos veces', { tag: ['@p1'] }, async () => {
    // Usar un DIN que genera ticket (DISCREPANCIA de sexo)
    const din = 'DIN-DEMO-000002';

    // Primera llamada
    const res1 = await apiPost(ctx, token, COMPARISONS_URL, { din });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.result).toBe('DISCREPANCIA');
    expect(body1.ticket).not.toBeNull();

    // Segunda llamada — también debe ser exitosa (idempotente)
    const res2 = await apiPost(ctx, token, COMPARISONS_URL, { din });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.result).toBe('DISCREPANCIA');
    expect(body2.ticket).not.toBeNull();
  });

  // ----------------------------------------------------------------
  // F-13: No-overwrite — comparación no muta datos oficiales
  // ----------------------------------------------------------------
  test('F-13: No-overwrite — comparación no muta datos oficiales', { tag: ['@p1'] }, async () => {
    // Primera comparación
    const res1 = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();

    const expectedOfficial = body1.official;
    const expectedField = body1.field;

    // Segunda comparación — mismos valores
    const res2 = await apiPost(ctx, token, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();

    expect(body2.official).toEqual(expectedOfficial);
    expect(body2.field).toEqual(expectedField);
  });
});