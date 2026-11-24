# QA Review — HU-05 (sinigan_sync)

**Fecha:** 2026-11-24  
**Revisor:** QA Reviewer  
**Artefacto revisado:** Tests funcionales y E2E en `tests/playwright/qa/`  
**Plan de pruebas:** `docs/evidence/hu-05-sinigan-sync/gates/G6-qa-playwright/qa-test-plan.md`

---

## 1. Resumen de cobertura

### 1.1 Cantidad de tests vs plan original

| Tipo | Plan | Implementado | Diferencia |
|------|:----:|:------------:|:----------:|
| Funcionales API — feliz | 12 | 12 | 0 |
| Funcionales API — borde | 10 | 10 | 0 |
| Funcionales API — negativo | 23 | 23 | 0 |
| E2E | 9 | 9 | 0 |
| **Total** | **54** | **54** | **0** |

Coincidencia exacta con el plan. Todos los IDs `F-01` a `F-45` y `E2E-01` a `E2E-09` están cubiertos.

### 1.2 Cobertura de Acceptance Criteria

| AC | Descripción | Cubierto por | Estado |
|:--:|-------------|--------------|:------:|
| AC-01 | Comparación consistente → no genera ticket | F-01, E2E-01, E2E-09 | ✅ |
| AC-02 | DIN inexistente → 404, no crea registros | F-08, E2E-07 | ⚠️ Parcial (ver Hallazgos) |
| AC-03 | Discrepancia → ticket OPEN con detalle | F-02, F-03, F-04, F-14, F-25, E2E-02 | ✅ |
| AC-04 | Resolución veterinaria → CLOSED | F-31..F-41, F-45, E2E-03, E2E-04 | ✅ |

### 1.3 Cobertura D10 (Aislamiento por finca)

| Escenario | Plan | Implementado | Comportamiento real |
|-----------|:----:|:------------:|-------------------|
| Token sin `farm_id` → 403 en comparisons | F-10 | ✅ | Devuelve 200 (backend auto-asigna) |
| Token sin `farm_id` → 403 en listado | F-22 | ✅ | Devuelve 200 (backend auto-asigna) |
| Token sin `farm_id` → 403 en detalle | F-30 | ✅ | Devuelve 200 (backend auto-asigna) |
| Token sin `farm_id` → 403 en resolución | F-44 | ✅ | Devuelve 201/409 (backend auto-asigna) |
| DIN en otra finca → 409 | F-11 | ✅ | ✅ |
| Tickets finca 2 no ve tickets finca 1 | F-23 | ✅ | ✅ |
| Ticket otra finca → 404 en detalle | F-28 | ✅ | ✅ |
| Ticket otra finca → 404 en resolución | F-43 | ✅ | ✅ |
| Login sin farm_id → flujo completo | E2E-05 | ✅ | ✅ |
| Aislamiento por finca completo | E2E-06 | ✅ | ✅ |

**D10 cubierto pero con discrepancia documentada:** los tests token-sin-farm_id reconocen explícitamente que el backend auto-asigna desde el perfil del usuario, por lo que devuelven 200/201/409 en lugar del 403 que plantea el plan.

### 1.4 Escenarios borde y negativos

- **Formato inválido:** F-05 (400)
- **Campos extra:** F-06, F-41 (422)
- **Campos vacíos:** F-07, F-35 (422)
- **Límites:** F-19 (limit=0 → 422), F-20 (limit=101 → 422), F-18 (limit=1 → 200)
- **Solo espacios:** F-36 (422)
- **Longitud mínima:** F-37 (< 5 chars → 422)
- **Longitud máxima:** F-38 (> 500 chars → 422)
- **Trim:** F-39 (201 con razón recortada)
- **Decisión inválida:** F-40 (422)
- **Ticket inexistente:** F-27 (404), F-42 (404)
- **Sin autenticación:** F-09, F-21, F-29 (401)
- **Segundo intento de resolución:** F-34 (409)
- **OPERARIO no resuelve:** F-33 (403), E2E-04 (403)
- **Sin tickets (finca limpia):** F-24 (200, `items = []`)

---

## 2. Evaluación de calidad de asserts

### 2.1 Especificidad de asserts

| Tipo de assert | Ejemplos | Evaluación |
|----------------|----------|:----------:|
| **Valores exactos** | `result = "CONSISTENTE"`, `officialValue = "MACHO"`, `resolution.reason = "Motivo válido"` (post-trim), `officialSource = "MODO SIMULADO (SINIGÁN V6 MOCK)"` | ✅ Excelente |
| **Tipado y estructura** | `typeof body.id === 'number'`, `Array.isArray(body.items)`, `body.ticket.id > 0` | ✅ Bueno |
| **Genéricos (error messages)** | `body.detail \|\| body.message \|\| body.error` en ~15 tests | ⚠️ Mejorable |
| **Existencia vaga** | `body.official.animalName` solo `.toBeTruthy()`, sin ver valor exacto | ⚠️ Aceptable (son datos de seed) |

### 2.2 Verificación de mensajes de error exactos

**No se verifica el texto exacto de ningún mensaje de error.** En ~15 tests la validación es genérica:

```js
expect(body.detail || body.message || body.error).toBeTruthy();
```

Esto significa que el backend podría devolver cualquier texto no vacío y el test pasaría. No se validan mensajes como:
- `"Se requiere una finca activa para operar la conciliación."` (esperado en F-10 según plan)
- `"Ticket ya cerrado"` (esperado en F-34)

**F-34** hace un esfuerzo mejor con `expect(msg).toContain('cerrado')`, pero solo en ese test.

### 2.3 Verificación de no-escrituras no deseadas

| Test | Verifica no-escritura | Cómo |
|:----:|:---------------------:|------|
| F-01/E2E-01 | ✅ | `ticket = null` + `GET /tickets` filter muestra 0 tickets para ese DIN |
| F-08 | ❌ | Solo verifica status 404, no verifica que no se crearon registros |
| F-05 | ❌ | Solo verifica status 400, no verifica que no se crearon registros |
| E2E-07 | ✅ | Verifica `GET /tickets` no incluye DIN-999999 |
| F-33 | ✅ | Verifica ticket sigue OPEN tras intento fallido |
| F-34 | ✅ | Verifica segunda resolución da 409 |
| F-45 | ✅ | Verifica snapshots inmutables |

**F-08 y F-05 son los principales vacíos:** no verifican la post-condición de que no se escribieron registros.

### 2.4 Idempotencia

- **F-12:** Implementado, pero **usa `DIN-DEMO-000001`** (CONSISTENTE, no genera ticket), lo que reduce el valor del test. El plan original especifica `DIN-DEMO-000002` para verificar que la segunda llamada no duplica el ticket.
- **F-34:** ✅ Verifica que la segunda resolución sobre el mismo ticket retorna 409.

### 2.5 No-overwrite

- **F-13:** ✅ Comparación repetida devuelve los mismos `official` y `field`.
- **F-45:** ✅ Snapshots inmutables pre y post resolución.

---

## 3. Hallazgos

### 🔴 F-12: Idempotencia implementada con el DIN incorrecto

**Archivo:** `comparisons.api.test.js` línea 254  
**Problema:** El test usa `DIN-DEMO-000001` (CONSISTENTE → no genera ticket). El plan especifica `DIN-DEMO-000002` (DISCREPANCIA → genera ticket). Al no generarse ticket, la verificación "segunda llamada no duplica ticket" es trivial (siempre es 0 tickets).  
**Riesgo:** No se verifica que el backend no duplique tickets cuando debería haber exactamente 1.  
**Sugerencia:** Cambiar a un DIN que genere discrepancia o agregar un test complementario.

### 🟡 D10 — Token sin farm_id: discrepancia plan vs comportamiento real

**Tests:** F-10, F-22, F-30, F-44  
**Problema:** El plan dice que deben retornar 403. Los tests documentan que el backend auto-asigna `farm_id` desde el perfil del usuario, por lo que retornan 200/201/409. Los tests están **documentando el comportamiento real** con comentarios explícitos, pero no coinciden con el plan.  
**Riesgo:** Si en el futuro se elimina la auto-asignación, los tests seguirán pasando (no validan 403). No hay test que realmente verifique el escenario de "usuario sin farm_id asignado en su perfil" porque el seed no contempla ese usuario.  
**Sugerencia:** Evaluar si el plan debe actualizarse o si debe agregarse un usuario seed sin farm_id y un test que verifique 403.

### 🟡 F-08 y F-05: Falta verificación de post-condición "no writes"

**Archivo:** `comparisons.api.test.js`  
**Problema:** El plan especifica que F-08 debe verificar que no se crean registros ("No se crean field_animal_records, tickets, discrepancias ni resoluciones"). El test solo verifica status=404. Similar para F-05 (status=400).  
**Sugerencia:** Agregar verificación via `GET /tickets` de que no se generaron tickets para esos DINs, similar a E2E-07.

### 🟡 Validación genérica de mensajes de error en ~15 tests

**Problema:** El patrón `body.detail || body.message || body.error` es frágil: un backend que devuelva `{}` (falsy) o `""` (falsy) pasaría el test si el status code coincide. Además no diferencia entre tipos de error.  
**Sugerencia:** Usar `expect.any(String)` para mínimo, o verificar fragmentos clave del mensaje esperado como ya se hace en F-34 (`toContain('cerrado')`).

### 🟡 Estado compartido entre tests de tickets-detail (F-25 a F-30)

**Archivo:** `tickets-detail.api.test.js`  
**Problema:** `openTicketId` y `closedTicketId` se calculan en `beforeAll`. Si el backend se resetea entre ejecuciones de test, los IDs podrían cambiar (aunque funcionalmente correctos).  
**Riesgo:** Bajo mientras el seed sea estable. Si hay ejecución paralela con otros tests que trabajan sobre los mismos DINs, los IDs podrían referenciar tickets cerrados por otro test.  
**Sugerencia:** Considerar creación de tickets frescos en `beforeEach` en lugar de `beforeAll` para mayor aislamiento.

### 🟢 Código duplicado: BASE_URL y URL endpoints en cada archivo

**Problema:** `BASE_URL`, `COMPARISONS_URL`, `TICKETS_URL`, `RESOLUTION_URL_PREFIX` se definen en los 5 archivos de test.  
**Impacto:** Mantenibilidad media — si cambia una ruta hay que actualizar 5 archivos.  
**Sugerencia:** Mover estas constantes a `fixtures/shared.js`.

### 🟢 Sin tests de UI real (solo API)

**Problema:** El plan describe 9 tests E2E con interacción de navegador (login UI, clicks, navegación de rutas). Todos los E2E implementados son en realidad llamadas API directas con `requestContext`.  
**Justificación:** El Readme/Render solo expone el backend, no el frontend React. Es una limitación del entorno, no del código. Los tests funcionan como integración API.  
**Sugerencia:** Documentar que los "E2E" son realmente flujos multi-llamada API y agregar tests con navegador real cuando el frontend esté disponible en Render.

### 🟢 Seed fijo, tests con datos compartidos

**Problema:** Todos los tests usan los mismos DINs del seed (`DIN-DEMO-000001` a `DIN-DEMO-000004`). Tests en diferentes archivos pueden crear múltiples tickets para el mismo DIN (F-31 → `DIN-DEMO-000003`, F-35..F-37 también → `DIN-DEMO-000003`). Cada comparación genera un ticket nuevo, por lo que no hay conflicto, pero F-24 (sin tickets en finca 2) asume que la finca 2 no tiene tickets, lo que es frágil si otro test genera tickets para farm_id=2.  
**Riesgo:** Bajo mientras los tests corran en orden secuencial y no haya tests paralelos entre fincas.

---

## 4. Veredicto

### APROBADO CON OBSERVACIONES

**Fundamento:** La suite es completa (54/54 tests según el plan), cubre todos los ACs con buena calidad general de asserts. Sin embargo, se identifican **2 observaciones que deben corregirse antes de considerar la suite definitiva**:

1. **🔴 F-12 usa DIN-DEMO-000001 (consistente) en lugar de DIN-DEMO-000002 (discrepancia).** No se verifica idempotencia real (que una segunda comparación no duplique tickets). Debe corregirse el DIN o agregarse un test complementario.

2. **🟡 Validación genérica de errores en ~15 tests.** Sin verificar mensajes específicos, errores de validación podrían pasar desapercibidos. Se recomienda migrar a asserts sobre fragmentos de texto esperado, al menos para los mensajes críticos (F-10, F-33, F-34, F-40).

**Mejoras recomendadas (no bloqueantes):**
- Agregar verificación de no-writes en F-08 y F-05 (post-condición vía `GET /tickets`).
- Centralizar `BASE_URL` y rutas en `fixtures/shared.js`.
- Evaluar si el plan de pruebas debe actualizarse para reflejar el comportamiento real de auto-asignación de `farm_id`.
- Documentar que los "E2E" son flujos multi-llamada API (no UI real con navegador).

---

## Resumen (10 líneas)

Se revisaron los 54 tests QA de HU-05 contra el plan de pruebas. La cobertura es completa: 45 funcionales (F-01..F-45) y 9 E2E (E2E-01..E2E-09), cubriendo AC-01, AC-02, AC-03, AC-04 y D10. Los asserts son mayoritariamente específicos con valores exactos (result, officialValue, fieldValue, mockLabel, resolution.decision). Se identificaron dos hallazgos principales: F-12 usa el DIN incorrecto para idempotencia (usa DIN consistente en lugar de uno con discrepancia), y ~15 tests usan validación genérica de errores sin verificar el texto exacto del mensaje. Faltan verificaciones de post-condición "no writes" en F-05 y F-08. Los tests token-sin-farm_id documentan que el backend auto-asigna farm_id (200/201 en vez del 403 del plan). Veredicto: **APROBADO CON OBSERVACIONES** — corregir F-12 y mejorar asserts de mensajes de error.