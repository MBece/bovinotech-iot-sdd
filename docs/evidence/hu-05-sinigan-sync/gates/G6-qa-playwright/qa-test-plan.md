# Plan de Pruebas Funcionales y E2E — HU-05 (sinigan_sync)

**HU-05:** Interoperabilidad simulada con SINIGÁN V6 y conciliación de conflictos  
**Rama:** `feat/hu-05-sinigan-sync`  
**Módulo:** `sinigan_sync`  
**Fecha:** 2026-11-22  
**Responsable:** QA Designer  
**Base URL local:** `http://localhost:8000`  
**Base URL Render:** `https://bovinotech-iot-sdd.onrender.com`  

---

## Índice

1. [Mapa de casos funcionales (API)](#1-mapa-de-casos-funcionales-api)
2. [Mapa de casos E2E (UI con navegador)](#2-mapa-de-casos-e2e-ui-con-navegador)
3. [Cobertura de asserts por tipo](#3-cobertura-de-asserts-por-tipo)
4. [Estrategia de ejecución](#4-estrategia-de-ejecucion)
5. [Data de prueba / Seed](#5-data-de-prueba--seed)

---

## 1. Mapa de casos funcionales (API)

### 1.1 `POST /integrations/sinigan-sync/comparisons`

Compara la ficha oficial simulada contra el registro de campo de la finca activa.

| # | Escenario | Body | Status esperado | Asserts clave | Prioridad | AC |
|---|-----------|------|----------------|--------------|-----------|----|
| F-01 | **Feliz — DIN consistente** (todos los campos coinciden) | `{ "din": "DIN-DEMO-000001" }` | `200` | `result = "CONSISTENTE"`, `discrepancies = []`, `ticket = null`. `meta.mockLabel = "MODO SIMULADO (SINIGÁN V6 MOCK)"`, `meta.isSimulation = true`, `meta.sourceMode = "SIMULADO"`. `official` contiene `din`, `animalName`, `species`, `sex`, `ageGroup`, `establishment.sitCode`. `field` contiene `din`, `species`, `sex`, `ageGroup`, `sitCode`, `source = "REGISTRO_DE_CAMPO"`. `comparedAt` no vacío. | P0 | AC-01 |
| F-02 | **Feliz — discrepancia de sexo** | `{ "din": "DIN-DEMO-000002" }` | `200` | `result = "DISCREPANCIA"`, `discrepancies[0].fieldName = "sex"`, `discrepancies[0].officialValue = "MACHO"`, `discrepancies[0].fieldValue = "HEMBRA"`. `ticket` no null, `ticket.status = "OPEN"`, `ticket.din = "DIN-DEMO-000002"`, `ticket.farmId = 1`, `ticket.createdByEmail` = email del usuario autenticado. | P0 | AC-03 |
| F-03 | **Feliz — discrepancia de grupo etario** | `{ "din": "DIN-DEMO-000003" }` | `200` | `result = "DISCREPANCIA"`, `discrepancies[0].fieldName = "age_group"`, `officialValue = "TERNERO"`, `fieldValue = "ADULTO"`. `ticket` creado con `status = "OPEN"`. | P0 | AC-03 |
| F-04 | **Feliz — discrepancias múltiples (especie + predio)** | `{ "din": "DIN-DEMO-000004" }` | `200` | `result = "DISCREPANCIA"`, 2 discrepancias: `species` (BUFALINO vs BOVINO) y `sit_code` (SIT-DEMO-002 vs SIT-DEMO-001). `ticket` creado. | P0 | AC-03 |
| F-05 | **Borde — DIN con formato inválido** | `{ "din": "REAL-123" }` | `400` | Mensaje de error por formato inválido. No se crean registros (post-condición). | P1 | — |
| F-06 | **Borde — DIN con campo extra** | `{ "din": "DIN-DEMO-000001", "extra": "value" }` | `422` | Rechazo por `extra` no permitido (`extra="forbid"`). | P1 | — |
| F-07 | **Borde — DIN vacío** | `{ "din": "" }` | `422` | Rechazo por campo vacío. | P1 | — |
| F-08 | **Negativo — DIN inexistente en fuente oficial** | `{ "din": "DIN-DEMO-999999" }` | `404` | Mensaje de no encontrado. **No se crean** `field_animal_records`, tickets, discrepancias ni resoluciones (post-condición vía DB). | P0 | AC-02 |
| F-09 | **Negativo — sin autenticación** | `{ "din": "DIN-DEMO-000001" }` | `401` | Sin header `Authorization`. | P0 | — |
| F-10 | **Negativo — token sin `farm_id` activo** | token legado sin `farm_id` | `403` | Mensaje: `"Se requiere una finca activa para operar la conciliación."` | P0 | D10 |
| F-11 | **Borde — DIN existente en otra finca** (operario finca 2 consulta DIN que solo está en finca 1) | `{ "din": "DIN-DEMO-000001" }` | `409` | Mismo error que registro inexistente. No se crea ticket. | P1 | D10 |
| F-12 | **Idempotencia — misma comparación dos veces** | `{ "din": "DIN-DEMO-000002" }` | `200` (ambas) | La segunda llamada no duplica ticket. Al listar tickets, solo aparece 1. | P1 | Invariante |
| F-13 | **No-overwrite — comparación no muta datos oficiales** | `{ "din": "DIN-DEMO-000002" }` | `200` | Los valores oficiales en respuesta siguen siendo los del mock. El registro de campo no se modifica. | P1 | RN |

---

### 1.2 `GET /integrations/sinigan-sync/tickets`

Lista tickets de conciliación de la finca activa.

| # | Escenario | Query params | Status | Asserts clave | Prioridad | AC |
|---|-----------|-------------|--------|--------------|-----------|----|
| F-14 | **Feliz — listar todos los tickets** (previo crear 2+ tickets) | — | `200` | `items` es array. Cada item tiene: `id`, `din`, `farmId`, `status`, `comparedAt`, `createdByEmail`, `createdAt`, `discrepancyCount`. Al menos los tickets creados están presentes. | P0 | AC-03/04 |
| F-15 | **Feliz — filtrar por `din`** | `?din=DIN-DEMO-000003` | `200` | Solo devuelve items con ese DIN. | P1 | — |
| F-16 | **Feliz — filtrar por `status=OPEN`** | `?status=OPEN` | `200` | Todos los items tienen `status = "OPEN"`. | P1 | — |
| F-17 | **Feliz — filtrar por `status=CLOSED`** | `?status=CLOSED` | `200` | Todos los items tienen `status = "CLOSED"` (requiere resolver uno antes). | P1 | — |
| F-18 | **Borde — `limit=1`** | `?limit=1` | `200` | `items` tiene largo 1. | P1 | — |
| F-19 | **Borde — `limit=0` (inválido)** | `?limit=0` | `422` | Rechazo por límite fuera de rango (1–100). | P1 | — |
| F-20 | **Borde — `limit=101` (excede máximo)** | `?limit=101` | `422` | Rechazo. | P2 | — |
| F-21 | **Negativo — sin autenticación** | — | `401` | — | P0 | — |
| F-22 | **Negativo — token sin `farm_id`** | — | `403` | Mensaje de finca requerida. | P0 | D10 |
| F-23 | **Negativo — finca 2 lista tickets: no ve tickets de finca 1** | — | `200` | `items` vacío o sin IDs de finca 1. | P1 | D10 |
| F-24 | **Negativo — sin tickets** (finca sin discrepancias) | — | `200` | `items = []`. | P1 | — |

---

### 1.3 `GET /integrations/sinigan-sync/tickets/{id}`

Detalle de un ticket (incluye snapshots, discrepancias, resolución).

| # | Escenario | ID | Status | Asserts clave | Prioridad | AC |
|---|-----------|----|--------|--------------|-----------|----|
| F-25 | **Feliz — detalle de ticket OPEN** | ID de ticket abierto | `200` | `id`, `din`, `farmId`, `status = "OPEN"`, `officialSnapshot` (dict con campos), `fieldSnapshot` (dict con campos), `officialSource = "MODO SIMULADO (SINIGÁN V6 MOCK)"`, `fieldSource = "REGISTRO DE CAMPO"`, `comparedAt`, `createdByEmail`, `createdAt`, `discrepancies[]` con cada discrepancia, `closedAt = null`, `resolution = null`. | P0 | AC-03 |
| F-26 | **Feliz — detalle de ticket CLOSED** | ID de ticket cerrado | `200` | `status = "CLOSED"`, `closedAt` no nulo, `resolution` no nulo con `decision`, `reason`, `resolvedByEmail`, `resolvedAt`. Los snapshots son inmutables (iguales a cuando se abrió). | P0 | AC-04 |
| F-27 | **Negativo — ticket inexistente** | `999999` | `404` | Mismo mensaje que "de otra finca". | P0 | — |
| F-28 | **Negativo — ticket de otra finca** | ID de ticket en finca 1 (desde finca 2) | `404` | Indistinguible de inexistente. | P1 | D10 |
| F-29 | **Negativo — sin autenticación** | 1 | `401` | — | P0 | — |
| F-30 | **Negativo — token sin `farm_id`** | 1 | `403` | — | P0 | D10 |

---

### 1.4 `POST /integrations/sinigan-sync/tickets/{id}/resolution`

Resuelve un ticket (solo VETERINARIO, solo OPEN).

| # | Escenario | Body | Status | Asserts clave | Prioridad | AC |
|---|-----------|------|--------|--------------|-----------|----|
| F-31 | **Feliz — resolver con OFICIAL_PREVALECE** | `{ "decision": "OFICIAL_PREVALECE", "reason": "..." }` | `201` | `id = ticketId`, `din` intacto, `status = "CLOSED"`, `closedAt` no nulo, `resolution.decision = "OFICIAL_PREVALECE"`, `resolution.reason` igual al enviado, `resolution.resolvedByEmail` = email del veterinario, `resolution.resolvedAt` no nulo. GET detalle posterior confirma `status = "CLOSED"` y resolución completa. | P0 | AC-04 |
| F-32 | **Feliz — resolver con CAMPO_PREVALECE** | `{ "decision": "CAMPO_PREVALECE", "reason": "..." }` | `201` | Ídem F-31 pero con la otra decisión. | P0 | AC-04 |
| F-33 | **Negativo — OPERARIO intenta resolver** | Válido | `403` | Mensaje de rol insuficiente. Ticket sigue OPEN. | P0 | AC-04 |
| F-34 | **Negativo — segundo intento de resolución (ya cerrado)** | Válido | `409` | "Ticket ya cerrado". | P0 | AC-04 Invariante 5 |
| F-35 | **Negativo — motivo vacío** | `"reason": ""` | `422` | — | P1 | AC-04 |
| F-36 | **Negativo — motivo solo espacios** | `"reason": "   "` | `422` | — | P1 | AC-04 |
| F-37 | **Negativo — motivo < 5 caracteres** | `"reason": "abc"` | `422` | Post-trim. | P1 | AC-04 |
| F-38 | **Negativo — motivo > 500 caracteres** | `"reason": "a" * 501` | `422` | — | P1 | AC-04 |
| F-39 | **Borde — motivo con espacios alrededor (trim)** | `"reason": "   Motivo válido   "` | `201` | `resolution.reason` debe ser `"Motivo válido"` (sin espacios). | P1 | AC-04 |
| F-40 | **Negativo — decisión inválida** | `"decision": "OTRO"` | `422` | — | P1 | AC-04 |
| F-41 | **Negativo — campos extra en body** | `{ "decision": "OFICIAL_PREVALECE", "reason": "...", "extra": "x" }` | `422` | — | P1 | AC-04 |
| F-42 | **Negativo — ticket inexistente** | Válido | `404` | — | P1 | — |
| F-43 | **Negativo — ticket de otra finca** | Válido | `404` | Indistinguible de inexistente. | P1 | D10 |
| F-44 | **Negativo — token sin `farm_id`** | Válido | `403` | — | P0 | D10 |
| F-45 | **No-overwrite — resolver no modifica snapshots** | Válido | `201` | GET detalle: `officialSnapshot` y `fieldSnapshot` idénticos al ticket abierto. | P1 | Invariante 4 |

---

## 2. Mapa de casos E2E (UI con navegador)

Flujos completos que ejercitan la interfaz real del frontend (React). Asume rutas UI definidas para HU-05 (a confirmar con el desarrollador frontend).

### 2.1 Flujo feliz: comparación consistente

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-01 | 1 | Navegar a `/login` | Formulario de login visible |
| | 2 | Ingresar credenciales `vet@bovinotech.co` / `password123`, farm_id = 1 | Redirección al dashboard |
| | 3 | Navegar a la sección "Conciliación SINIGÁN" (o ruta correspondiente) | Interfaz de comparación visible |
| | 4 | Ingresar DIN `DIN-DEMO-000001` y presionar "Comparar" | — |
| | 5 | — | Ver resultado: etiqueta `"CONSISTENTE"` + etiqueta `"MODO SIMULADO (SINIGÁN V6 MOCK)"` visible |
| | 6 | — | Datos oficiales y de campo coinciden. No se genera ticket. |

**Prioridad:** P0  
**Relación:** AC-01

### 2.2 Flujo feliz: discrepancia → ticket → detalle

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-02 | 1 | Login como `operario@bovinotech.co` / `password123`, farm_id = 1 | Dashboard |
| | 2 | Ir a comparar DIN `DIN-DEMO-000002` | — |
| | 3 | — | Resultado `"DISCREPANCIA"`, se muestran ambos valores (sexo MACHO oficial vs HEMBRA campo) + etiqueta de simulación |
| | 4 | — | Indicador visual de que se generó un ticket |
| | 5 | Navegar al listado de tickets | Ticket `DIN-DEMO-000002` aparece en la tabla con status `"OPEN"`, `farmId = 1` |
| | 6 | Click en el ticket para ver detalle | Página de detalle: muestra `officialSnapshot`, `fieldSnapshot`, discrepancias, `resolution = null` |

**Prioridad:** P0  
**Relación:** AC-01, AC-03

### 2.3 Flujo feliz: veterinario resuelve ticket

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-03 | 1 | Login como `vet@bovinotech.co` / `password123`, farm_id = 1 | Dashboard |
| | 2 | Ir a listado de tickets | Ver ticket OPEN de `DIN-DEMO-000002` (creado en E2E-02 o seed) |
| | 3 | Click en el ticket | Detalle con discrepancias visibles, botón "Resolver" activo |
| | 4 | Seleccionar decisión `OFICIAL_PREVALECE`, escribir motivo válido (≥5 chars), presionar "Resolver" | — |
| | 5 | — | Confirmación de resolución. Ticket ahora muestra `"CLOSED"` |
| | 6 | Volver al listado | Ticket aparece con status `"CLOSED"` |
| | 7 | Click en el ticket resuelto | Detalle: `resolution.decision`, `resolution.reason`, `resolvedByEmail`, `resolvedAt` visibles |

**Prioridad:** P0  
**Relación:** AC-04

### 2.4 Flujo negativo: OPERARIO intenta resolver

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-04 | 1 | Login como `operario@bovinotech.co`, farm_id = 1 | Dashboard |
| | 2 | Ir a detalle de ticket OPEN | Botón "Resolver" NO debe estar visible o debe mostrar tooltip "Solo veterinarios" |
| | 3 | (Opcional) Intentar resolver via API simulando clic | Error `403`, ticket sigue OPEN |

**Prioridad:** P1  
**Relación:** AC-04 (rol)

### 2.5 Flujo negativo: login sin farm_id

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-05 | 1 | Login con token que no contiene `farm_id` (usuario legado) | — |
| | 2 | Intentar acceder a cualquier ruta de conciliación | Error `403` con mensaje: "Se requiere una finca activa para operar la conciliación." |
| | 3 | Las demás secciones de la app siguen funcionando | — |

**Prioridad:** P0  
**Relación:** D10

### 2.6 Flujo negativo: aislamiento por finca

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-06 | 1 | Login como `vet2@bovinotech.co` / `password123`, farm_id = 2 | Dashboard |
| | 2 | Ir a listado de tickets | Lista vacía o sin tickets de finca 1 |
| | 3 | Intentar ver detalle de ticket ID=1 (de finca 1) vía URL directa | Error `404` |

**Prioridad:** P1  
**Relación:** D10

### 2.7 Flujo borde: DIN no encontrado

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-07 | 1 | Login como `operario@bovinotech.co`, farm_id = 1 | Dashboard |
| | 2 | Comparar DIN `DIN-DEMO-999999` | — |
| | 3 | — | Mensaje de error "No encontrado" o `404` informativo |
| | 4 | Ir a listado de tickets | No se creó ningún ticket nuevo |

**Prioridad:** P1  
**Relación:** AC-02

### 2.8 Flujo borde: motivo inválido al resolver

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-08 | 1 | Login como `vet@bovinotech.co`, farm_id = 1 | Dashboard |
| | 2 | Ir a detalle de ticket OPEN | — |
| | 3 | Intentar resolver con motivo `"ab"` (< 5 chars) | Validación en frontend o error `422` con mensaje descriptivo |
| | 4 | Intentar resolver con motivo vacío | Validación impide envío o error `422` |
| | 5 | Ticket sigue OPEN, no se modificó | — |

**Prioridad:** P1  
**Relación:** AC-04

### 2.9 Flujo de verificación de etiqueta "MODO SIMULADO"

| # | Paso | Acción | Verificación |
|---|------|--------|-------------|
| E2E-09 | 1 | Login como `operario@bovinotech.co`, farm_id = 1 | Dashboard |
| | 2 | Comparar cualquier DIN (ej. `DIN-DEMO-000002`) | — |
| | 3 | — | En cada sección donde se muestren datos oficiales, la etiqueta `"MODO SIMULADO (SINIGÁN V6 MOCK)"` es visible |
| | 4 | — | En detalle de ticket, `officialSource` muestra la etiqueta |

**Prioridad:** P0  
**Relación:** AC-01, Regla de negocio

---

## 3. Cobertura de asserts por tipo

### 3.1 Status code

| Assert | Casos que lo cubren |
|--------|-------------------|
| `200` | F-01, F-02, F-03, F-04, F-12, F-13, F-14, F-15, F-16, F-17, F-18, F-23, F-24, F-25, F-26 |
| `201` | F-31, F-32, F-39 |
| `400` | F-05 |
| `401` | F-09, F-21, F-29, F-44 (anónimos) |
| `403` | F-10, F-22, F-30, F-33, F-44 (rol) |
| `404` | F-08, F-27, F-28, F-42, F-43 |
| `409` | F-11, F-34 |
| `422` | F-06, F-07, F-19, F-20, F-35, F-36, F-37, F-38, F-40, F-41 |

### 3.2 Response body — campos obligatorios

**Meta** (toda respuesta de comparación):
- `meta.sourceSystem = "SINIGAN"` (string)
- `meta.sourceMode = "SIMULADO"` (string)
- `meta.isSimulation = true` (booleano)
- `meta.mockLabel = "MODO SIMULADO (SINIGÁN V6 MOCK)"` (string exacta)
- `meta.comparedAt` (string ISO datetime, no vacío)

**Comparación consistente:**
- `result = "CONSISTENTE"` (string)
- `discrepancies = []` (array vacío)
- `ticket = null`

**Comparación con discrepancia:**
- `result = "DISCREPANCIA"`
- `discrepancies` array con items que tienen: `fieldName`, `fieldLabel`, `officialValue`, `fieldValue`, `officialSource`, `fieldSource`, `detectedAt`
- `ticket` objeto con: `id` (int > 0), `din`, `farmId` (int), `status` ("OPEN"), `comparedAt`, `createdByEmail`, `createdAt`

**Ticket list (GET /tickets):**
- `items` array de objetos con: `id`, `din`, `farmId`, `status`, `comparedAt`, `createdByEmail`, `createdAt`, `closedAt` (null o string), `discrepancyCount` (int ≥ 0)

**Ticket detail (GET /tickets/{id}):**
- `officialSnapshot` (dict), `fieldSnapshot` (dict)
- `officialSource`, `fieldSource`
- `discrepancies[]` (array)
- `resolution` (null si OPEN, objeto si CLOSED)

**Resolución:**
- `resolution.decision` ∈ {"OFICIAL_PREVALECE", "CAMPO_PREVALECE"}
- `resolution.reason` (string 5–500 trimmed)
- `resolution.resolvedByEmail` (string, email)
- `resolution.resolvedAt` (ISO datetime)
- `closedAt` (ISO datetime)

### 3.3 Idempotencia (segunda llamada no duplica)

| Caso | Verificación |
|------|-------------|
| F-12 | POST /comparisons dos veces para el mismo DIN con discrepancia → solo 1 ticket en DB/listado |
| F-31/32 | POST /resolution dos veces → segunda da 409, no se duplica resolución |

### 3.4 No-overwrite (datos oficiales/campo no mutan)

| Caso | Verificación |
|------|-------------|
| F-13 | Comparar DIN → los valores `official` coinciden con el mock, `field` con el registro de campo. Repetir y verificar que son los mismos. |
| F-45 | Resolver ticket → GET detalle post-resolución: `officialSnapshot` y `fieldSnapshot` idénticos a los del ticket abierto. |

### 3.5 Simulated mode label

| Caso | Verificación |
|------|-------------|
| F-01, F-02, F-25 | `meta.mockLabel = "MODO SIMULADO (SINIGÁN V6 MOCK)"` en toda respuesta de comparación |
| F-25 | `officialSource = "MODO SIMULADO (SINIGÁN V6 MOCK)"` en detalle de ticket |
| E2E-09 | La UI muestra la etiqueta textual en todas las secciones de datos oficiales |

### 3.6 Aislamiento por finca (D10)

| Caso | Verificación |
|------|-------------|
| F-10, F-22, F-30, F-44 | Token sin `farm_id` → 403 en todos los endpoints |
| F-11 | POST /comparisons con DIN de otra finca → 409 |
| F-28, F-43 | Ticket de otra finca → 404 (indistinguible de inexistente) |
| F-23 | GET /tickets desde finca 2 → no ve tickets de finca 1 |

### 3.7 Invariantes del modelo de datos

| Invariante | Verificación |
|-----------|-------------|
| DIN inexistente no crea registros | F-08: contar filas DB antes/después |
| Sin diferencias no crea ticket | F-01: `ticket = null`, GET /tickets no incluye nuevo |
| Snapshots inmutables | F-45: `officialSnapshot`/`fieldSnapshot` no cambian tras resolver |
| Resolución no modifica datos origen | F-45 + verificación de que `official`/`field` originales no cambiaron |
| Ticket cerrado no se reabre | F-34: segunda resolución da 409 |
| Sin endpoints PUT/PATCH/DELETE | Verificar que no están registrados en el router |
| Toda operación exige finca activa | F-10, F-22, F-30, F-44 |
| Ticket de otra finca = 404 | F-28, F-43 |

---

## 4. Estrategia de ejecución

### 4.1 Orden sugerido de ejecución

Los tests se organizan en 3 capas ejecutables de forma independiente:

```
Capa 1 — Smoke (rápidos, sin dependencias de estado)
  ├── F-09: Comparación sin auth → 401
  ├── F-10: Comparación sin farm_id → 403
  ├── F-21: Listado sin auth → 401
  ├── F-29: Detalle sin auth → 401
  ├── F-44: Resolución sin auth → 401
  ├── F-05: DIN inválido → 400
  ├── F-06: Campos extra → 422
  └── F-08: DIN inexistente → 404 + no-writes

Capa 2 — Flujos funcionales (construyen estado progresivamente)
  ├── F-01: Comparación consistente → 200
  ├── F-02: Discrepancia sexo → ticket creado
  ├── F-03: Discrepancia edad → ticket creado
  ├── F-04: Discrepancias múltiples → ticket creado
  ├── F-14: Listar tickets (verifica que aparecen los 3 anteriores)
  ├── F-25: Detalle de ticket OPEN
  ├── F-31/32: Resolución veterinaria → 201
  ├── F-26: Detalle de ticket CLOSED
  └── F-17: Filtrar por status=CLOSED

Capa 3 — Negativos / bordes / invariantes (dependen de estado previo)
  ├── F-12: Idempotencia (repetir comparación)
  ├── F-13: No-overwrite
  ├── F-33: OPERARIO no resuelve → 403
  ├── F-34: Segunda resolución → 409
  ├── F-35..F-41: Validaciones de motivo/decisión
  ├── F-45: Resolver no modifica snapshots
  ├── F-15..F-20: Filtros de listado
  ├── F-27: Ticket inexistente → 404
  ├── F-11: DIN en otra finca → 409
  ├── F-23: Aislamiento finca 2
  ├── F-28: Ticket otra finca → 404
  └── F-43: Resolver ticket otra finca → 404
```

### 4.2 Dependencias entre tests

| Test | Depende de | Motivo |
|------|-----------|--------|
| F-02, F-03, F-04 | F-08 (implícito: DB debe tener seed) | Usan DINs del seed de prueba |
| F-14 (listar todos) | F-02, F-03, F-04 (al menos uno ejecutado) | Necesita tickets en DB |
| F-15, F-16, F-18, F-19 | F-14 (implícito: hay tickets) | Filtros sobre listado |
| F-17 (filtrar CLOSED) | F-31 o F-32 (al menos un ticket cerrado) | Necesita ticket CLOSED |
| F-25 (detalle OPEN) | F-02, F-03, F-04 | Necesita ID de ticket abierto |
| F-26 (detalle CLOSED) | F-31 o F-32 | Necesita ID de ticket cerrado |
| F-31, F-32 (resolver) | F-02 | Necesita un ticket abierto para resolver |
| F-33 (OPERARIO no resuelve) | F-02 | Necesita ticket abierto |
| F-34 (segunda resolución) | F-31 | Necesita ticket ya cerrado |
| F-35..F-41 | F-02 | Necesitan ticket abierto para probar validaciones |
| F-45 (no-overwrite snapshots) | F-02 + F-31 | Comparar snapshot pre/post resolución |
| F-12 (idempotencia) | Independiente (usa su propio setup) | Puede crear ticket y repetir |
| F-11, F-23, F-28, F-43 | Seed con dos fincas (farm_id=1 y farm_id=2) | Requiere datos en ambas fincas |

### 4.3 Setup / Teardown necesario

#### Setup global (beforeAll):
1. Asegurar que el servidor backend está corriendo (local o Render).
2. Verificar que el seed de datos está cargado (finca 1: DINs DEMO-000001 a 000004; finca 2: sin registros o con datos separados).
3. Crear usuarios de prueba con roles si no existen.

#### Setup por test / describe:
| Recurso | Cómo se obtiene |
|---------|----------------|
| Token de autenticación | `apiLogin(requestContext, creds)` → `access_token` |
| ID de ticket abierto | `POST /comparisons` con DIN de discrepancia → `ticket.id` |
| Ticket de otra finca | Login como finca 2, crear ticket (si aplica), o usar seed |

#### Teardown:
- No es estrictamente necesario limpiar entre tests porque cada test usa datos distintos o verifica invariantes.
- Para tests de idempotencia: verificar que no se duplicaron registros (assert sin limpieza).
- Para tests de escritura (resolución): usar tickets recién creados en el mismo test.
- Opcional: truncar tablas `reconciliation_*` entre suites si se requiere aislamiento total.

### 4.4 Configuración de Playwright

- **Proyecto `api`:** `tests/playwright/qa/functional/*.api.test.js`
  - Usar `requestContext` para llamadas HTTP directas (sin navegador).
  - Reutilizar `DEFAULT_CREDENTIALS`, `apiLogin`, `apiGet`, `apiPost` desde `fixtures/shared.js`.

- **Proyecto `e2e`:** `tests/playwright/qa/e2e/*.e2e.test.js`
  - Usar `page` (navegador Chromium) con `baseURL`.
  - Login vía UI (completar formulario) o vía API + inyectar token en localStorage (más rápido).
  - Para el login por API + UI: `page.evaluate(() => localStorage.setItem('token', token))`.

### 4.5 Archivos propuestos

```
tests/playwright/qa/
├── functional/
│   └── sinigan_sync.api.test.js      # Tests F-01 a F-45
├── e2e/
│   └── sinigan_sync.e2e.test.js      # Tests E2E-01 a E2E-09
└── fixtures/
    └── shared.js                      # Ya existe (apiLogin, apiGet, apiPost, DEFAULT_CREDENTIALS)
```

---

## 5. Data de prueba / Seed

Usuarios disponibles en el seed:

| Email | Rol | farm_id | Contraseña |
|-------|-----|---------|-----------|
| `vet@bovinotech.co` | VETERINARIO | 1 | `password123` |
| `vet2@bovinotech.co` | VETERINARIO | 1 o 2 | `password123` |
| `operario@bovinotech.co` | OPERARIO | 1 | `password123` |
| `admin@bovinotech.co` | ADMIN | 1 | `password123` |

DINs de prueba y su comportamiento esperado en finca 1:

| DIN | official vs field | Resultado esperado |
|-----|------------------|-------------------|
| `DIN-DEMO-000001` | Coinciden completamente | CONSISTENTE |
| `DIN-DEMO-000002` | Sexo difiere (MACHO vs HEMBRA) | DISCREPANCIA (1) |
| `DIN-DEMO-000003` | Grupo etario difiere (TERNERO vs ADULTO) | DISCREPANCIA (1) |
| `DIN-DEMO-000004` | Especie (BUFALINO vs BOVINO) + predio (SIT-DEMO-002 vs SIT-DEMO-001) | DISCREPANCIA (2) |
| `DIN-DEMO-999999` | No existe | 404 |

---

## Resumen de cobertura

| Tipo | Cantidad | IDs |
|------|----------|-----|
| Casos funcionales API — feliz | 12 | F-01..F-04, F-14..F-18, F-25, F-26, F-31, F-32 |
| Casos funcionales API — borde | 10 | F-05..F-07, F-11, F-12, F-13, F-19, F-20, F-24, F-39 |
| Casos funcionales API — negativo | 23 | F-08, F-09, F-10, F-21, F-22, F-23, F-27..F-30, F-33..F-38, F-40..F-45 |
| Casos E2E (UI) | 9 | E2E-01..E2E-09 |
| **Total** | **54** | |
| **Cobertura AC** | — | AC-01 (F-01, E2E-01), AC-02 (F-08, E2E-07), AC-03 (F-02..F-04, E2E-02), AC-04 (F-31..F-41, E2E-03..E2E-04) |

---

*Fin del plan de pruebas. Listo para ser convertido a código Playwright.*