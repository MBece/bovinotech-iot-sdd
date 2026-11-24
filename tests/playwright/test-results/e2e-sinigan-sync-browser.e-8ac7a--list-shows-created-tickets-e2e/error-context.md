# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\sinigan-sync-browser.e2e.test.js >> Browser E2E - Sinigan Sync (UI via Netlify) >> BE2E-05: Ticket list shows created tickets
- Location: qa\e2e\sinigan-sync-browser.e2e.test.js:197:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "DIN-DEMO-000002"
Received string:    "BovinoTech IoT·
Usuario: operario@bovinotech.co | Rol: OPERARIO | Finca: 1·
Cerrar Sesión
MVP ACADÉMICO · TRAZABILIDAD RURAL
Del DIN a un evento sanitario verificable·
Consulte un animal por DIN, capture un evento incluso sin conexión y sincronícelo de forma idempotente cuando la API esté disponible.·
REFERENCIA EXTERNA
Consultar animal por DIN
SIMULACIÓN·
Referencia académica SINIGAN. No corresponde a una consulta oficial del ICA.·
DIN
Consultar
Pruebe desde DIN-DEMO-000001 hasta DIN-DEMO-000005.
OPERACIÓN SIN CONEXIÓN
Registrar evento sanitario
0 pendientes·
Consulte un DIN para habilitar la captura.·
Tipo de evento
Vacunación
Tratamiento
Chequeo
Dosis opcional
Observación
Guardar en este dispositivo
Cola local
Sincronizar ahora·
Aún no hay eventos guardados en este navegador.·
CAPTURA EN CAMPO · FUNCIONA SIN CONEXIÓN
Registrar evento sanitario
0 animales disponibles sin conexión·
Finca activa: 1. El evento se guarda en este dispositivo con la hora actual y se sincroniza cuando haya conexión.·
No se pudo actualizar el catálogo; se usa la última copia guardada.·
Tipo de evento
Vacunación
Desparasitación
Tratamiento
Chequeo clínico
No hay animales disponibles en el catálogo de esta finca. Conéctese a internet una vez para descargarlo.
Producto
Dosis
Unidad
Elegir…
ml
mg
g
unidades
Observaciones (opcional)
Guardar evento
Eventos en este dispositivo (0)·
Aún no hay eventos capturados en esta finca.·
AUDITORÍA SANITARIA
Historial solo-anexión
0 registros·
Las correcciones crean una versión nueva. El registro anterior permanece intacto.·
Consulte un DIN para ver su historial.·
CONCILIACIÓN SINIGÁN V6
Conciliación oficial vs. registro de campo·
Finca activa: 1·
MODO SIMULADO (SINIGÁN V6 MOCK)·
Referencia académica simulada. La ficha oficial nunca se modifica: toda diferencia se atiende mediante un ticket y una resolución humana.·
DIN a comparar
Comparar ficha y campo
Pruebe DIN-DEMO-000001 a DIN-DEMO-000005 para ver casos consistentes y con discrepancia.
Tickets de conciliación
0 tickets
Estado
Todos
Abierto
Cerrado
DIN
Aplicar filtros
Actualizando…·
Consultando tickets…·
Control de acceso por roles·
Su cuenta actual posee el rol de Operario. Tiene permisos de campo para pesaje, geocercas y registro de eventos sanitarios preliminares.·
Prueba de permisos veterinarios·
Haga clic para validar si el token actual tiene privilegios de Veterinario:·
Verificar Permisos de Veterinario"
```

# Test source

```ts
  115 |   }
  116 | 
  117 |   // ==============================================================
  118 |   // BE2E-01: Login as operario
  119 |   // ==============================================================
  120 |   test('BE2E-01: Login as operario@bovinotech.co', { tag: ['@e2e', '@browser', '@login'] }, async () => {
  121 |     await loginAs('operario@bovinotech.co', 'password123');
  122 | 
  123 |     const pageText = await page.evaluate(() => document.body?.innerText || '');
  124 |     expect(pageText).toContain('BovinoTech IoT');
  125 |     expect(pageText).toContain('operario@bovinotech.co');
  126 |     expect(pageText).toContain('OPERARIO');
  127 |     expect(pageText).toContain('Cerrar Sesión');
  128 |     expect(pageText).toContain('CONCILIACIÓN SINIGÁN V6');
  129 |     expect(pageText).toContain('MODO SIMULADO');
  130 | 
  131 |     const hasInput = await page.evaluate(() => !!document.getElementById('reconciliation-din'));
  132 |     expect(hasInput).toBe(true);
  133 |   });
  134 | 
  135 |   // ==============================================================
  136 |   // BE2E-02: Login as vet
  137 |   // ==============================================================
  138 |   test('BE2E-02: Login as vet@bovinotech.co', { tag: ['@e2e', '@browser', '@login'] }, async () => {
  139 |     await loginAs('vet@bovinotech.co', 'password123');
  140 | 
  141 |     const pageText = await page.evaluate(() => document.body?.innerText || '');
  142 |     expect(pageText).toContain('vet@bovinotech.co');
  143 |     expect(pageText).toContain('VETERINARIO');
  144 |     expect(pageText).toContain('CONCILIACIÓN SINIGÁN V6');
  145 |   });
  146 | 
  147 |   // ==============================================================
  148 |   // BE2E-03: Compare DIN-DEMO-000002 — discrepancy
  149 |   // ==============================================================
  150 |   test('BE2E-03: DIN-DEMO-000002 — discrepancy ticket via UI', { tag: ['@e2e', '@browser', '@ac03'] }, async () => {
  151 |     await loginAs('operario@bovinotech.co', 'password123');
  152 |     const { body } = await compareDIN('DIN-DEMO-000002');
  153 | 
  154 |     expect(body.result).toBe('DISCREPANCIA');
  155 |     expect(body.discrepancies.length).toBeGreaterThanOrEqual(1);
  156 | 
  157 |     const sexDisc = body.discrepancies.find(d => d.fieldName === 'sex');
  158 |     expect(sexDisc).toBeDefined();
  159 |     expect(sexDisc.officialValue).toBe('MACHO');
  160 |     expect(sexDisc.fieldValue).toBe('HEMBRA');
  161 | 
  162 |     expect(body.ticket).not.toBeNull();
  163 |     expect(body.ticket.status).toBe('OPEN');
  164 |     expect(body.ticket.din).toBe('DIN-DEMO-000002');
  165 |     expect(body.ticket.farmId).toBe(1);
  166 | 
  167 |     await page.waitForTimeout(3000);
  168 | 
  169 |     const resultText = await page.evaluate(() => document.body?.innerText || '');
  170 |     expect(resultText).toContain('Discrepancia detectada');
  171 |     expect(resultText).toContain('MACHO');
  172 |     expect(resultText).toContain('HEMBRA');
  173 |     expect(resultText).toContain(body.ticket.id.toString());
  174 |   });
  175 | 
  176 |   // ==============================================================
  177 |   // BE2E-04: Compare DIN-DEMO-000001 — consistent
  178 |   // ==============================================================
  179 |   test('BE2E-04: DIN-DEMO-000001 — consistent comparison via UI', { tag: ['@e2e', '@browser', '@ac01'] }, async () => {
  180 |     await loginAs('operario@bovinotech.co', 'password123');
  181 |     const { body } = await compareDIN('DIN-DEMO-000001');
  182 | 
  183 |     expect(body.result).toBe('CONSISTENTE');
  184 |     expect(body.discrepancies).toEqual([]);
  185 |     expect(body.ticket).toBeNull();
  186 |     expect(body.meta.mockLabel).toBe('MODO SIMULADO (SINIGÁN V6 MOCK)');
  187 | 
  188 |     await page.waitForTimeout(2000);
  189 | 
  190 |     const resultText = await page.evaluate(() => document.body?.innerText || '');
  191 |     expect(resultText).toContain('consistente');
  192 |   });
  193 | 
  194 |   // ==============================================================
  195 |   // BE2E-05: Ticket list shows created ticket
  196 |   // ==============================================================
  197 |   test('BE2E-05: Ticket list shows created tickets', { tag: ['@e2e', '@browser'] }, async () => {
  198 |     // Ensure a ticket exists
  199 |     const ensureRes = await apiPost(apiCtx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-000002' });
  200 |     const ensureBody = await ensureRes.json();
  201 |     expect(ensureBody.ticket).not.toBeNull();
  202 | 
  203 |     await loginAs('operario@bovinotech.co', 'password123');
  204 |     await page.waitForTimeout(3000);
  205 | 
  206 |     await page.evaluate(() => {
  207 |       const matches = Array.from(document.querySelectorAll('h2, h3, h4, section, div'));
  208 |       const header = matches.find(el => el.textContent.includes('Tickets de conciliación'));
  209 |       if (header) header.scrollIntoView({ behavior: 'instant', block: 'start' });
  210 |     });
  211 |     await page.waitForTimeout(1000);
  212 | 
  213 |     const pageText = await page.evaluate(() => document.body?.innerText || '');
  214 |     expect(pageText).toContain('Tickets de conciliación');
> 215 |     expect(pageText).toContain('DIN-DEMO-000002');
      |                      ^ Error: expect(received).toContain(expected) // indexOf
  216 |   });
  217 | 
  218 |   // ==============================================================
  219 |   // BE2E-06: Vet resolves ticket
  220 |   // ==============================================================
  221 |   test('BE2E-06: Vet resolves ticket via API after creation from UI', { tag: ['@e2e', '@browser', '@ac04'] }, async () => {
  222 |     await loginAs('vet@bovinotech.co', 'password123');
  223 | 
  224 |     const { body } = await compareDIN('DIN-DEMO-000004');
  225 |     expect(body.ticket).not.toBeNull();
  226 |     const ticketId = body.ticket.id;
  227 |     expect(body.ticket.status).toBe('OPEN');
  228 | 
  229 |     // Resolve via API
  230 |     const resolveRes = await apiPost(apiCtx, vetToken,
  231 |       `/integrations/sinigan-sync/tickets/${ticketId}/resolution`, {
  232 |         decision: 'OFICIAL_PREVALECE',
  233 |         reason: 'Resolución E2E browser test — oficial prevalece',
  234 |       }
  235 |     );
  236 |     expect(resolveRes.status()).toBe(201);
  237 |     const resolved = await resolveRes.json();
  238 |     expect(resolved.status).toBe('CLOSED');
  239 |     expect(resolved.resolution.decision).toBe('OFICIAL_PREVALECE');
  240 |     expect(resolved.resolution.resolvedByEmail).toBe('vet@bovinotech.co');
  241 | 
  242 |     // Click "Actualizar" to refresh the ticket list
  243 |     await page.evaluate(() => {
  244 |       const btn = Array.from(document.querySelectorAll('button'))
  245 |         .find(b => b.textContent.trim() === 'Actualizar');
  246 |       if (btn) btn.click();
  247 |     });
  248 |     await page.waitForTimeout(3000);
  249 | 
  250 |     const afterText = await page.evaluate(() => document.body?.innerText || '');
  251 |     expect(afterText).toContain(ticketId.toString());
  252 |   });
  253 | 
  254 |   // ==============================================================
  255 |   // BE2E-07: DIN not found — 404 (via API, not UI)
  256 |   // The UI may handle 404s differently; test the API behavior directly
  257 |   // ==============================================================
  258 |   test('BE2E-07: API — DIN not found returns 404', { tag: ['@e2e', '@browser', '@ac02'] }, async () => {
  259 |     // Test via API since the UI's form submission may intercept the error
  260 |     const res = await apiPost(apiCtx, operarioToken, COMPARISONS_URL, { din: 'DIN-DEMO-999999' });
  261 |     expect(res.status()).toBe(404);
  262 | 
  263 |     const body = await res.json();
  264 |     expect(body.detail || body.message || body.error).toBeTruthy();
  265 | 
  266 |     // Also verify via the UI that no spurious ticket was created
  267 |     const listRes = await apiGet(apiCtx, operarioToken, TICKETS_URL);
  268 |     const listBody = await listRes.json();
  269 |     const ticketsForDin = listBody.items.filter(t => t.din === 'DIN-DEMO-999999');
  270 |     expect(ticketsForDin.length).toBe(0);
  271 |   });
  272 | 
  273 |   // ==============================================================
  274 |   // BE2E-08: Mock/simulation badge visible
  275 |   // ==============================================================
  276 |   test('BE2E-08: Mock/simulation badge is visible in UI', { tag: ['@e2e', '@browser'] }, async () => {
  277 |     await loginAs('operario@bovinotech.co', 'password123');
  278 | 
  279 |     const pageText = await page.evaluate(() => document.body?.innerText || '');
  280 |     expect(pageText).toContain('SIMULACIÓN');
  281 |     expect(pageText).toContain('MODO SIMULADO (SINIGÁN V6 MOCK)');
  282 | 
  283 |     // Also check the main text (Spanish text uses tilde in SIMULACIÓN)
  284 |     expect(pageText).toContain('MODO SIMULADO');
  285 |   });
  286 | });
```