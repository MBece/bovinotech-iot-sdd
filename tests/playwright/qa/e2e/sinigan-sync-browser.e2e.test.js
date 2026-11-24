import { test, expect, chromium, request } from '@playwright/test';
import { DEFAULT_CREDENTIALS, apiLogin, apiGet, apiPost } from '../../fixtures/shared.js';

const NETLIFY_URL = 'https://bovinotech-iot-sdd.netlify.app';
const API_BASE = 'https://bovinotech-iot-sdd.onrender.com';

const COMPARISONS_URL = `${API_BASE}/integrations/sinigan-sync/comparisons`;
const TICKETS_URL = `${API_BASE}/integrations/sinigan-sync/tickets`;

/**
 * Browser E2E tests for HU-05 sinigan_sync via the React frontend on Netlify.
 */
test.describe('Browser E2E - Sinigan Sync (UI via Netlify)', () => {
  let browser;
  let page;
  let apiCtx;
  let operarioToken;
  let vetToken;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    apiCtx = await request.newContext({ baseURL: API_BASE });

    const operarioLogin = await apiLogin(apiCtx, DEFAULT_CREDENTIALS.operario);
    operarioToken = operarioLogin.access_token;
    const vetLogin = await apiLogin(apiCtx, DEFAULT_CREDENTIALS.vet);
    vetToken = vetLogin.access_token;
  });

  test.afterAll(async () => {
    await browser.close();
    await apiCtx.dispose();
  });

  test.beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1280, height: 1080 } });
  });

  test.afterEach(async () => {
    await page.close();
  });

  /**
   * Login via the Netlify frontend.
   */
  async function loginAs(email, password) {
    await page.goto(NETLIFY_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Wait for login form to be fully rendered
    await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#password', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('button[type="submit"]', { state: 'visible', timeout: 5000 });

    // Fill fields carefully
    await page.fill('#email', email);
    await page.fill('#password', password);

    // Click submit
    await page.click('button[type="submit"]');

    // Wait for login to complete — "Iniciando sesión..." means still loading,
    // "Cerrar Sesión" means logged in successfully
    // Use poll-based approach: wait until "Cerrar Sesión" appears or timeout
    try {
      await page.waitForFunction(
        () => document.body?.innerText?.includes('Cerrar Sesión'),
        { timeout: 30000 }
      );
    } catch (e) {
      // If it times out, take a screenshot for debugging
      await page.screenshot({ path: '../../screenshots/login-failure.png', fullPage: true });
      throw e;
    }

    // Extra wait for full dashboard render
    await page.waitForTimeout(2000);
  }

  /**
   * Perform a reconciliation comparison via the UI.
   */
  async function compareDIN(din) {
    // Scroll reconciliation input into view
    await page.evaluate(() => {
      const el = document.getElementById('reconciliation-din');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(800);

    // Fill using native value setter to trigger React onChange
    await page.evaluate((value) => {
      const el = document.getElementById('reconciliation-din');
      if (el) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, din);
    await page.waitForTimeout(500);

    // Listen for the API response before clicking
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/sinigan-sync/comparisons'), { timeout: 20000 }
    );

    await page.click('button:has-text("Comparar ficha y campo")');

    const response = await responsePromise;
    const body = await response.json();
    return { response, body };
  }

  // ==============================================================
  // BE2E-01: Login as operario
  // ==============================================================
  test('BE2E-01: Login as operario@bovinotech.co', { tag: ['@e2e', '@browser', '@login'] }, async () => {
    await loginAs('operario@bovinotech.co', 'password123');

    const pageText = await page.evaluate(() => document.body?.innerText || '');
    expect(pageText).toContain('BovinoTech IoT');
    expect(pageText).toContain('operario@bovinotech.co');
    expect(pageText).toContain('OPERARIO');
    expect(pageText).toContain('Cerrar Sesión');
    expect(pageText).toContain('CONCILIACIÓN SINIGÁN V6');
    expect(pageText).toContain('MODO SIMULADO');

    const hasInput = await page.evaluate(() => !!document.getElementById('reconciliation-din'));
    expect(hasInput).toBe(true);
  });

  // ==============================================================
  // BE2E-02: Login as vet
  // ==============================================================
  test('BE2E-02: Login as vet@bovinotech.co', { tag: ['@e2e', '@browser', '@login'] }, async () => {
    await loginAs('vet@bovinotech.co', 'password123');

    const pageText = await page.evaluate(() => document.body?.innerText || '');
    expect(pageText).toContain('vet@bovinotech.co');
    expect(pageText).toContain('VETERINARIO');
    expect(pageText).toContain('CONCILIACIÓN SINIGÁN V6');
  });

  // ==============================================================
  // BE2E-03: Compare DIN-DEMO-000002 — discrepancy
  // ==============================================================
  test('BE2E-03: DIN-DEMO-000002 — discrepancy ticket via UI', { tag: ['@e2e', '@browser', '@ac03'] }, async () => {
    await loginAs('operario@bovinotech.co', 'password123');
    const { body } = await compareDIN('DIN-DEMO-000002');

    expect(body.result).toBe('DISCREPANCIA');
    expect(body.discrepancies.length).toBeGreaterThanOrEqual(1);

    const sexDisc = body.discrepancies.find(d => d.fieldName === 'sex');
    expect(sexDisc).toBeDefined();
    expect(sexDisc.officialValue).toBe('MACHO');
    expect(sexDisc.fieldValue).toBe('HEMBRA');

    expect(body.ticket).not.toBeNull();
    expect(body.ticket.status).toBe('OPEN');
    expect(body.ticket.din).toBe('DIN-DEMO-000002');
    expect(body.ticket.farmId).toBe(1);

    await page.waitForTimeout(3000);

    const resultText = await page.evaluate(() => document.body?.innerText || '');
    expect(resultText).toContain('Discrepancia detectada');
    expect(resultText).toContain('MACHO');
    expect(resultText).toContain('HEMBRA');
    expect(resultText).toContain(body.ticket.id.toString());
  });

  // ==============================================================
  // BE2E-04: Compare DIN-DEMO-000001 — consistent
  // ==============================================================
  test('BE2E-04: DIN-DEMO-000001 — consistent comparison via UI', { tag: ['@e2e', '@browser', '@ac01'] }, async () => {
    await loginAs('operario@bovinotech.co', 'password123');
    const { body } = await compareDIN('DIN-DEMO-000001');

    expect(body.result).toBe('CONSISTENTE');
    expect(body.discrepancies).toEqual([]);
    expect(body.ticket).toBeNull();
    expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');

    await page.waitForTimeout(2000);

    const resultText = await page.evaluate(() => document.body?.innerText || '');
    expect(resultText).toContain('consistente');
  });

  // ==============================================================
  // BE2E-05: Ticket list shows created ticket
  // ==============================================================
  test('BE2E-05: Ticket list shows created tickets', { tag: ['@e2e', '@browser'] }, async () => {
    // Ensure a ticket exists
    const ensureRes = await apiPost(apiCtx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
    const ensureBody = await ensureRes.json();
    expect(ensureBody.ticket).not.toBeNull();

    await loginAs('operario@bovinotech.co', 'password123');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      const matches = Array.from(document.querySelectorAll('h2, h3, h4, section, div'));
      const header = matches.find(el => el.textContent.includes('Tickets de conciliación'));
      if (header) header.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(1000);

    const pageText = await page.evaluate(() => document.body?.innerText || '');
    expect(pageText).toContain('Tickets de conciliación');
    expect(pageText).toContain('DIN-DEMO-000002');
  });

  // ==============================================================
  // BE2E-06: Vet resolves ticket
  // ==============================================================
  test('BE2E-06: Vet resolves ticket via API after creation from UI', { tag: ['@e2e', '@browser', '@ac04'] }, async () => {
    await loginAs('vet@bovinotech.co', 'password123');

    const { body } = await compareDIN('DIN-DEMO-000004');
    expect(body.ticket).not.toBeNull();
    const ticketId = body.ticket.id;
    expect(body.ticket.status).toBe('OPEN');

    // Resolve via API
    const resolveRes = await apiPost(apiCtx, vetToken,
      `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
        decision: 'OFICIAL_PREVALECE',
        reason: 'Resolución E2E browser test — oficial prevalece',
      }
    );
    expect(resolveRes.status()).toBe(201);
    const resolved = await resolveRes.json();
    expect(resolved.status).toBe('CLOSED');
    expect(resolved.resolution.decision).toBe('OFICIAL_PREVALECE');
    expect(resolved.resolution.resolvedByEmail).toBe('vet@bovinotech.co');

    // Click "Actualizar" to refresh the ticket list
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Actualizar');
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);

    const afterText = await page.evaluate(() => document.body?.innerText || '');
    expect(afterText).toContain(ticketId.toString());
  });

  // ==============================================================
  // BE2E-07: DIN not found — 404 (via API, not UI)
  // The UI may handle 404s differently; test the API behavior directly
  // ==============================================================
  test('BE2E-07: API — DIN not found returns 404', { tag: ['@e2e', '@browser', '@ac02'] }, async () => {
    // Test via API since the UI's form submission may intercept the error
    const res = await apiPost(apiCtx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-999999' });
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.detail || body.message || body.error).toBeTruthy();

    // Also verify via the UI that no spurious ticket was created
    const listRes = await apiGet(apiCtx, operarioToken, TICKETS_URL);
    const listBody = await listRes.json();
    const ticketsForDin = listBody.items.filter(t => t.din === 'DIN-DEMO-999999');
    expect(ticketsForDin.length).toBe(0);
  });

  // ==============================================================
  // BE2E-08: Mock/simulation badge visible
  // ==============================================================
  test('BE2E-08: Mock/simulation badge is visible in UI', { tag: ['@e2e', '@browser'] }, async () => {
    await loginAs('operario@bovinotech.co', 'password123');

    const pageText = await page.evaluate(() => document.body?.innerText || '');
    expect(pageText).toContain('SIMULACIÓN');
    expect(pageText).toContain('MODO SIMULADO (SINIGÁN V6 MOCK)');

    // Also check the main text (Spanish text uses tilde in SIMULACIÓN)
    expect(pageText).toContain('MODO SIMULADO');
  });
});