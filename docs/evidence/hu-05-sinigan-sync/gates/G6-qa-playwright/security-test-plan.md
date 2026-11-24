# Plan de Pruebas de Seguridad — HU-05 (sinigan_sync)

| Atributo | Valor |
|---|---|
| **Feature** | HU-05 — Conciliación SINIGÁN (Modo Simulado) |
| **Endpoint base** | `POST /integrations/sinigan-sync/comparisons` |
| | `GET /integrations/sinigan-sync/tickets` |
| | `GET /integrations/sinigan-sync/tickets/{id}` |
| | `POST /integrations/sinigan-sync/tickets/{id}/resolution` |
| **URL deploy** | `https://bovinotech-iot-sdd.onrender.com` |
| **Entorno de pruebas** | Playwright (Node.js) sobre la API deployada en Render |
| **Config** | `tests/playwright/playwright.security.config.js` → `baseURL: 'https://bovinotech-iot-sdd.onrender.com'` |
| **Helpers** | `tests/playwright/fixtures/shared.js` — `apiLogin`, `apiGet`, `apiPost`, `DEFAULT_CREDENTIALS` |

---

## 1. Matriz de Amenazas (OWASP Top 10 Relevante)

### 1.1 Broken Object Property Level Authorization — IDOR (OWASP API #1)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A01 | Un usuario autenticado en finca 2 lista tickets que pertenecen a finca 1 | `GET /tickets` | **High** | Logearse como `vet2@bovinotech.co` con `farm_id=2`. Hacer `GET /tickets`. Verificar que el ticket de finca 1 (`id` conocido) no aparece en `items[].id`. |
| A02 | Un usuario en finca 2 accede al detalle de un ticket de finca 1 | `GET /tickets/{id}` | **High** | Logearse como `vet2@bovinotech.co` con `farm_id=2`. Hacer `GET /tickets/{ticket_id}` donde `ticket_id` es un ticket de finca 1. Assert: `404` con `detail: "Ticket de conciliación no encontrado."`. |
| A03 | Un usuario en finca 2 resuelve un ticket de finca 1 | `POST /tickets/{id}/resolution` | **Critical** | Logearse como `vet2@bovinotech.co` con `farm_id=2`. Hacer `POST /tickets/{id}/resolution`. Assert: `404` con el mensaje de ticket no encontrado, y el ticket de finca 1 permanece `OPEN`. |
| A04 | Un usuario en finca 2 fuerza una comparación con un DIN que existe en finca 1 pero no en finca 2 | `POST /comparisons` | **Medium** | Logearse como `vet2@bovinotech.co` con `farm_id=2`. Hacer `POST /comparisons` con `{"din": "DIN-DEMO-000002"}` (registrado en finca 1). Assert: `409` con `"No existe registro de campo para el DIN consultado."` (mismo mensaje que si el DIN no existiera en ninguna finca). |

### 1.2 Broken Authentication (OWASP API #2)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A05 | Endpoint sin token de autenticación | Los 4 endpoints | **Critical** | Hacer request sin header `Authorization`. Assert: `401` con `detail: "No se pudieron validar las credenciales"` y header `WWW-Authenticate: Bearer`. |
| A06 | Token expirado | Los 4 endpoints | **High** | Generar un token JWT con `exp` en el pasado (ej: `iat` = hace 8 días, `exp` = hace 1 día). Usarlo en cada endpoint. Assert: `401` con mensaje de credenciales inválidas. |
| A07 | Token malformado (basura) | Los 4 endpoints | **Medium** | Enviar `Authorization: Bearer ESTO_NO_ES_UN_TOKEN_VALIDO`. Assert: `401`. |
| A08 | Token vacío | Los 4 endpoints | **Medium** | Enviar `Authorization: Bearer `. Assert: `401` o `422`. |
| A09 | Token firmado con otra clave (algoritmo confusión) | Los 4 endpoints | **High** | Generar un JWT con los claims válidos pero firmado con una clave diferente (ej: `"my-fake-key"`). Assert: `401`. |

### 1.3 Broken Function Level Authorization (OWASP API #5)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A10 | OPERARIO intenta resolver un ticket | `POST /tickets/{id}/resolution` | **High** | Logearse como `operario@bovinotech.co` (rol OPERARIO). Hacer `POST /tickets/{id}/resolution`. Assert: `403` con `detail: "Acceso denegado: Se requiere rol de Veterinario"`. Además verificar que el ticket sigue `OPEN`. |
| A11 | ADMINISTRADOR intenta resolver un ticket | `POST /tickets/{id}/resolution` | **High** | Logearse como `admin@bovinotech.co` (rol ADMINISTRADOR). Hacer `POST /tickets/{id}/resolution`. Assert: `403`. |
| A12 | Token con rol inventado (ej: `SUPER_ADMIN`) | `POST /tickets/{id}/resolution` | **Medium** | Generar token JWT con `role: "SUPER_ADMIN"` y `farm_id: 1`. Hacer `POST /tickets/{id}/resolution`. Assert: `403`. |

### 1.4 Mass Assignment (OWASP API #6)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A13 | Body con campos extra `id`, `farm_id`, `status` en `POST /comparisons` | `POST /comparisons` | **High** | Enviar `{"din": "DIN-DEMO-000002", "id": 999, "farm_id": 1, "status": "CLOSED", "role": "VETERINARIO"}`. Assert: `422` (rechazado por `extra="forbid"` en el schema). |
| A14 | Body con campos extra `status`, `resolvedByEmail`, `id` en `POST /tickets/{id}/resolution` | `POST /tickets/{id}/resolution` | **High** | Enviar `{"decision": "OFICIAL_PREVALECE", "reason": "Motivo válido para testing.", "status": "CLOSED", "resolvedByEmail": "atacante@example.com", "id": 9999}`. Assert: `422`. |
| A15 | Body con `reason` demasiado corto (<5 chars) | `POST /tickets/{id}/resolution` | **Low** | Enviar `{"decision": "OFICIAL_PREVALECE", "reason": "abc"}`. Assert: `422` con validación de motivo. |
| A16 | Body con `din` que no cumple patrón | `POST /comparisons` | **Low** | Enviar `{"din": "INVALIDO"}`. Assert: `400` con `"DIN inválido. Use el formato DIN-DEMO-000001."`. |
| A17 | Body con `decision` inválida | `POST /tickets/{id}/resolution` | **Low** | Enviar `{"decision": "INVALIDA", "reason": "Motivo válido para testing."}`. Assert: `422`. |

### 1.5 Unconstrained Resource Consumption (OWASP API #4)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A18 | Paginación sin límite: limit > 100 | `GET /tickets` | **Medium** | Llamar `GET /tickets?limit=9999`. Assert: `422` (FastAPI rechaza por `le=100`). |
| A19 | Paginación con limit = 0 o negativo | `GET /tickets` | **Medium** | Llamar `GET /tickets?limit=0` y `GET /tickets?limit=-1`. Assert: `422`. |
| A20 | Abuso de creación de tickets (múltiples comparaciones rápidas) | `POST /comparisons` | **Low** | Enviar 20 comparaciones en secuencia. Assert: todas responden `200` sin error. No hay rate limiting en el contrato actual; documentar como observación. |

### 1.6 Security Misconfiguration (OWASP API #8)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A21 | Fuga de información en error 404 de ticket inexistente vs. ticket de otra finca | `GET /tickets/{id}` | **High** | Verificar que el mensaje de error para ticket inexistente es idéntico al de ticket de otra finca: `detail: "Ticket de conciliación no encontrado."`. Ambos deben responder `404`. |
| A22 | Fuga de información en error 409 de DIN sin registro vs. DIN de otra finca | `POST /comparisons` | **High** | Verificar que el mensaje para DIN que no existe en la tabla FieldAnimalRecord es idéntico al de DIN que existe pero en otra finca: `detail: "No existe registro de campo para el DIN consultado."`. Ambos deben responder `409`. |
| A23 | CORS permitiendo orígenes no autorizados | Todos | **Medium** | Enviar `OPTIONS` request con `Origin: https://evil.com`. Assert: respuesta no incluye `Access-Control-Allow-Origin: *`. |
| A24 | Response headers de seguridad | Todos | **Low** | Verificar presencia de headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`. |
| A25 | Errores detallados en responses 422 | `POST /comparisons`, `POST /tickets/{id}/resolution` | **Medium** | Verificar que los errores `422` no filtran stack traces ni información de infraestructura. Deben ser mensajes Pydantic/VALIDATION genéricos. |

### 1.7 JWT Tampering (OWASP API #2 / #3)

| # | Amenaza | Endpoint | Severidad | Cómo detectarlo |
|---|---|---|---|---|
| A26 | Token sin claim `farm_id` (token legado pre-HU-01) | Los 4 endpoints | **Critical** | Generar token con `{"sub": "vet@bovinotech.co", "role": "VETERINARIO"}` sin `farm_id`. Assert: `403` en todos los endpoints con `"Se requiere una finca activa para operar la conciliación."`. |
| A27 | Token con `farm_id` manipulado a un valor que no pertenece al usuario | `GET /tickets`, `GET /tickets/{id}`, `POST /tickets/{id}/resolution`, `POST /comparisons` | **Critical** | Generar token con `farm_id: 3` (finca inexistente o no autorizada). Assert: en GET /tickets devuelve lista vacía; en el resto responde `404` o `409` sin filtrar datos de otras fincas. |
| A28 | Token con `farm_id` como string en vez de entero | Los 4 endpoints | **Medium** | Generar token con `farm_id: "1"`. Assert: según implementación puede fallar o tomarse como 1. Documentar resultado. |
| A29 | Token con `sub` de un usuario existente pero con `farm_id` de otra finca | `GET /tickets/{id}` | **Critical** | Generar token con `{"sub": "vet@bovinotech.co", "role": "VETERINARIO", "farm_id": 2}`. Assert: `404` al intentar acceder a ticket de finca 1. |
| A30 | Token sin `sub` (email) | Los 4 endpoints | **High** | Generar token con `{"role": "VETERINARIO", "farm_id": 1}`. Assert: `401`. |
| A31 | Algorithm none en JWT | Los 4 endpoints | **Critical** | Generar token con header `{"alg": "none"}` y payload válido, sin firma. Assert: `401`. |
| A32 | Token con `alg: HS256` pero usando la clave pública como HMAC secret (si el servidor expone/public-key) | Los 4 endpoints | **High** | Generar token con payload válido, firmado con clave pública conocida como HMAC secret. Assert: `401`. |

---

## 2. Casos de Prueba de Seguridad

Cada caso está diseñado para ser traducido directamente a un test de Playwright usando los helpers de `fixtures/shared.js`.

> **Setup común:** Usar `apiLogin(requestContext, credentials)` del helper compartido para obtener tokens. Para los tests que requieren un ticket abierto, usar `POST /comparisons` con `{"din": "DIN-DEMO-000002"}` (genera discrepancia + ticket OPEN en finca 1).

---

### TC‑SEC‑01: IDOR — Ticket de finca 1 no visible desde finca 2 (GET /tickets)

| Campo | Valor |
|---|---|
| **Amenaza** | A01 |
| **Severidad** | High |
| **Descripción** | Un usuario con `farm_id=2` no debe ver tickets de finca 1 en el listado. |

**Setup:**
1. Login como `operario@bovinotech.co` (farm_id=1 por defecto).
2. Crear un ticket: `POST /comparisons` con `{"din": "DIN-DEMO-000002"}`.
3. Extraer `ticket.id` del response.

**Pasos:**
4. Login como `vet2@bovinotech.co` con `farm_id=2` → obtener token2.
5. `GET /integrations/sinigan-sync/tickets` con `Authorization: Bearer {token2}`.

**Asserts:**
- Status: `200`
- `items[].id` NO debe contener el `ticket.id` de finca 1.
- Si hay items, todos deben tener `farmId === 2`.

---

### TC‑SEC‑02: IDOR — Detalle de ticket de finca 1 como `404` desde finca 2

| Campo | Valor |
|---|---|
| **Amenaza** | A02 |
| **Severidad** | High |
| **Descripción** | GET /tickets/{id} de un ticket de finca 1 responde 404 idéntico a ticket inexistente cuando se accede desde finca 2. |

**Setup:**
1. Crear un ticket en finca 1 (mismo setup que TC‑SEC‑01).

**Pasos:**
2. Login como `vet2@bovinotech.co` con `farm_id=2`.
3. `GET /integrations/sinigan-sync/tickets/{ticket_id}`.

**Asserts:**
- Status: `404`
- `detail`: `"Ticket de conciliación no encontrado."` (exacto, sin indicar que existe pero en otra finca).
- Validar que el body NO contenga campos como `farm_id`, `din` o `status` (no filtrar datos del ticket real).

---

### TC‑SEC‑03: IDOR — Resolución de ticket de finca 1 desde finca 2 retorna `404` y no escribe

| Campo | Valor |
|---|---|
| **Amenaza** | A03 |
| **Severidad** | Critical |
| **Descripción** | Un VETERINARIO de finca 2 no puede resolver un ticket de finca 1. La respuesta debe ser `404` y el ticket debe permanecer `OPEN`. |

**Setup:**
1. Crear un ticket en finca 1 (mismo setup que TC‑SEC‑01).
2. Login como `vet2@bovinotech.co` con `farm_id=2`.

**Pasos:**
3. `POST /integrations/sinigan-sync/tickets/{ticket_id}/resolution` con body:
```json
{
  "decision": "OFICIAL_PREVALECE",
  "reason": "Se valida la ficha oficial y se solicita corrección del registro de campo."
}
```

**Asserts:**
- Status: `404`
- `detail`: `"Ticket de conciliación no encontrado."`
- Luego, como paso adicional de verificación: login como `operario@bovinotech.co` y hacer `GET /integrations/sinigan-sync/tickets/{ticket_id}`.
- Verificar que `status` sigue siendo `"OPEN"` y `resolution` es `null`.

---

### TC‑SEC‑04: IDOR — Comparación contra DIN de otra finca retorna `409` sin filtrar existencia

| Campo | Valor |
|---|---|
| **Amenaza** | A04 |
| **Severidad** | Medium |
| **Descripción** | POST /comparisons con un DIN que existe como FieldAnimalRecord en finca 1 pero no en finca 2 responde `409` (mismo que DIN inexistente). |

**Setup:**
1. Login como `vet2@bovinotech.co` con `farm_id=2`.

**Pasos:**
2. `POST /integrations/sinigan-sync/comparisons` con `{"din": "DIN-DEMO-000002"}` (existe en finca 1, no en finca 2).

**Asserts:**
- Status: `409`
- `detail`: `"No existe registro de campo para el DIN consultado."` (idéntico al mensaje de DIN que no existe en ninguna finca, ej: `"DIN-DEMO-999999"`).

---

### TC‑SEC‑05: Sin autenticación devuelve `401` en los 4 endpoints

| Campo | Valor |
|---|---|
| **Amenaza** | A05 |
| **Severidad** | Critical |
| **Descripción** | Todos los endpoints de HU-05 rechazan requests sin header Authorization. |

**Pasos:**
1. `POST /integrations/sinigan-sync/comparisons` con `{"din": "DIN-DEMO-000001"}` (sin auth).
2. `GET /integrations/sinigan-sync/tickets` (sin auth).
3. `GET /integrations/sinigan-sync/tickets/1` (sin auth).
4. `POST /integrations/sinigan-sync/tickets/1/resolution` con body válido (sin auth).

**Asserts (para cada uno):**
- Status: `401`
- `detail`: `"No se pudieron validar las credenciales"` (exacto)
- Header `www-authenticate` debe contener `Bearer`.

---

### TC‑SEC‑06: Token expirado devuelve `401`

| Campo | Valor |
|---|---|
| **Amenaza** | A06 |
| **Severidad** | High |
| **Descripción** | Un token cuyo `exp` está en el pasado es rechazado. |

**Setup:**
1. Generar token JWT manualmente con librería `jsonwebtoken`:
   - Header: `{"alg": "HS256", "typ": "JWT"}`
   - Payload: `{"sub": "vet@bovinotech.co", "role": "VETERINARIO", "farm_id": 1, "iat": <hace 8 días>, "exp": <hace 1 día>}`
   - Firma: HMAC-SHA256 con `"dev-insecure-key-only-for-local-testing"` (la clave de desarrollo).

**Pasos:**
2. Ejecutar los 4 endpoints con ese token.

**Asserts:**
- Status: `401`
- `detail`: `"No se pudieron validar las credenciales"`

---

### TC‑SEC‑07: Token malformado devuelve `401`

| Campo | Valor |
|---|---|
| **Amenaza** | A07 |
| **Severidad** | Medium |

**Pasos:**
1. `GET /integrations/sinigan-sync/tickets` con `Authorization: Bearer ESTO_NO_ES_UN_TOKEN_VALIDO`.

**Asserts:**
- Status: `401`

---

### TC‑SEC‑08: RBAC — OPERARIO no puede resolver tickets

| Campo | Valor |
|---|---|
| **Amenaza** | A10 |
| **Severidad** | High |
| **Descripción** | Un usuario con rol OPERARIO recibe `403` al intentar resolver. El ticket debe quedar `OPEN`. |

**Setup:**
1. Login como `operario@bovinotech.co` (farm_id=1).
2. Crear un ticket: `POST /comparisons` con `{"din": "DIN-DEMO-000002"}` → extraer `ticket_id`.

**Pasos:**
3. Con el mismo token de OPERARIO: `POST /tickets/{ticket_id}/resolution` con body válido.

**Asserts:**
- Status: `403`
- `detail`: `"Acceso denegado: Se requiere rol de Veterinario"`
- Luego `GET /tickets/{ticket_id}` con el mismo token → `status` = `"OPEN"`.

---

### TC‑SEC‑09: RBAC — ADMINISTRADOR no puede resolver tickets

| Campo | Valor |
|---|---|
| **Amenaza** | A11 |
| **Severidad** | High |

**Setup:**
1. Login como `operario@bovinotech.co`, crear ticket → extraer `ticket_id`.
2. Login como `admin@bovinotech.co` con `farm_id=1`.

**Pasos:**
3. `POST /tickets/{ticket_id}/resolution` con body válido.

**Asserts:**
- Status: `403`
- `detail`: `"Acceso denegado: Se requiere rol de Veterinario"`

---

### TC‑SEC‑10: Mass Assignment — Campos extra en POST /comparisons

| Campo | Valor |
|---|---|
| **Amenaza** | A13 |
| **Severidad** | High |

**Setup:**
1. Login como `operario@bovinotech.co`.

**Pasos:**
2. `POST /comparisons` con body:
```json
{
  "din": "DIN-DEMO-000002",
  "id": 999,
  "farm_id": 2,
  "status": "CLOSED",
  "role": "VETERINARIO"
}
```

**Asserts:**
- Status: `422`
- El body de error debe mencionar `extra_fields` o campos no esperados.
- Ticket NO debe crearse (verificar con GET /tickets que no hay ticket con `din=DIN-DEMO-000002` si antes no existía).

---

### TC‑SEC‑11: Mass Assignment — Campos extra en POST /resolution

| Campo | Valor |
|---|---|
| **Amenaza** | A14 |
| **Severidad** | High |

**Setup:**
1. Login como `operario@bovinotech.co`, crear ticket → extraer `ticket_id`.
2. Login como `vet@bovinotech.co` (farm_id=1).

**Pasos:**
3. `POST /tickets/{ticket_id}/resolution` con body:
```json
{
  "decision": "OFICIAL_PREVALECE",
  "reason": "Se valida la ficha oficial y se solicita corrección del registro de campo.",
  "status": "CLOSED",
  "resolvedByEmail": "atacante@example.com",
  "id": 9999,
  "officialSource": "MODO SIMULADO (SINIGÁN V6 MOCK)"
}
```

**Asserts:**
- Status: `422`
- `GET /tickets/{ticket_id}` con token de vet → `status` = `"OPEN"` y `resolution` = `null`.

---

### TC‑SEC‑12: Sin finca activa devuelve `403` en los 4 endpoints

| Campo | Valor |
|---|---|
| **Amenaza** | A26 |
| **Severidad** | Critical |
| **Descripción** | Token legado (sin `farm_id`) es rechazado con `403` en todos los endpoints y no escribe datos. |

**Setup:**
1. Generar token JWT sin `farm_id`:
   - Payload: `{"sub": "vet@bovinotech.co", "role": "VETERINARIO", "pwd_change": false}`.
   - Firmar con `"dev-insecure-key-only-for-local-testing"`.

**Pasos:**
2. Ejecutar los 4 endpoints con ese token (sin farm_id).

**Asserts (para cada uno):**
- Status: `403`
- `detail`: `"Se requiere una finca activa para operar la conciliación."`

---

### TC‑SEC‑13: Token con `farm_id` de finca inexistente

| Campo | Valor |
|---|---|
| **Amenaza** | A27 |
| **Severidad** | Critical |

**Setup:**
1. Generar token JWT con `farm_id: 999` (finca inexistente).

**Pasos:**
2. `GET /tickets` → assert lista vacía (`items: []`), status `200`.
3. `GET /tickets/1` → assert `404`.
4. `POST /comparisons` con `{"din": "DIN-DEMO-000001"}` → assert `404` (DIN no encontrado en oficial, no tiene registro de campo en finca 999).

---

### TC‑SEC‑14: JWT Algorithm None

| Campo | Valor |
|---|---|
| **Amenaza** | A31 |
| **Severidad** | Critical |

**Setup:**
1. Generar token JWT con `alg: "none"` en el header y payload válido, **sin firma** (tres segmentos: `base64(header).base64(payload).`).
   - Header decodificado: `{"alg": "none", "typ": "JWT"}`
   - Payload: `{"sub": "vet@bovinotech.co", "role": "VETERINARIO", "farm_id": 1}`

**Pasos:**
2. `GET /integrations/sinigan-sync/tickets` con ese token.

**Asserts:**
- Status: `401` (el servidor debe rechazar tokens sin firma).

---

### TC‑SEC‑15: Token con `sub` de otro usuario y `farm_id` manipulado

| Campo | Valor |
|---|---|
| **Amenaza** | A29 |
| **Severidad** | Critical |
| **Descripción** | Token firmado válidamente pero con combinación `sub=vet@bovinotech.co` + `farm_id=2` usando la clave de desarrollo. |

**Setup:**
1. Generar token: `{"sub": "vet@bovinotech.co", "role": "VETERINARIO", "farm_id": 2}`.
2. Crear un ticket en finca 1 vía `operario@bovinotech.co`.

**Pasos:**
3. `GET /tickets/{ticket_id}` con el token manipulado.

**Asserts:**
- Status: `404`
- `detail`: `"Ticket de conciliación no encontrado."`

---

### TC‑SEC‑16: Validación de límite de paginación

| Campo | Valor |
|---|---|
| **Amenaza** | A18 |
| **Severidad** | Medium |

**Setup:**
1. Login como `operario@bovinotech.co`.

**Pasos:**
2. `GET /tickets?limit=9999` → assert `422`.
3. `GET /tickets?limit=0` → assert `422`.
4. `GET /tickets?limit=-5` → assert `422`.
5. `GET /tickets?limit=100` → assert `200` (límite máximo permitido).
6. `GET /tickets?limit=1` → assert `200` (límite mínimo permitido).

---

### TC‑SEC‑17: Validación de formato DIN

| Campo | Valor |
|---|---|
| **Amenaza** | A16 |
| **Severidad** | Low |

**Pasos:**
1. Login como `operario@bovinotech.co`.
2. `POST /comparisons` con `{"din": "INVALIDO"}` → assert `400`.
3. `POST /comparisons` con `{"din": "DIN-DEMO-000001"}` → assert `200` (válido).
4. `POST /comparisons` con `{"din": ""}` → assert `422`.

---

### TC‑SEC‑18: Doble resolución de ticket retorna `409`

| Campo | Valor |
|---|---|
| **Amenaza** | Invariante #5 del modelo de datos |
| **Severidad** | Medium |

**Setup:**
1. Login como `vet@bovinotech.co`, crear un ticket (DIN-DEMO-000002), resolverlo → assert `201`.

**Pasos:**
2. Intentar resolver el mismo ticket nuevamente.

**Asserts:**
- Status: `409`
- `detail`: `"El ticket de conciliación ya está cerrado."`

---

### TC‑SEC‑19: No existen rutas PUT/PATCH/DELETE sobre tickets

| Campo | Valor |
|---|---|
| **Amenaza** | Invariante #6 del modelo de datos |
| **Severidad** | Medium |

**Setup:**
1. Login como `vet@bovinotech.co`, crear ticket → extraer `ticket_id`.

**Pasos:**
2. `PUT /tickets/{ticket_id}` → assert `404` o `405`.
3. `PATCH /tickets/{ticket_id}` → assert `404` o `405`.
4. `DELETE /tickets/{ticket_id}` → assert `404` o `405`.
5. `PUT /tickets/{ticket_id}/resolution` → assert `404` o `405`.
6. `PATCH /tickets/{ticket_id}/resolution` → assert `404` o `405`.
7. `DELETE /tickets/{ticket_id}/resolution` → assert `404` o `405`.
8. Verificar que `GET /tickets/{ticket_id}` aún funciona → `status` = `"OPEN"`.

---

### TC‑SEC‑20: Response headers de seguridad

| Campo | Valor |
|---|---|
| **Amenaza** | A24 |
| **Severidad** | Low |

**Pasos:**
1. `GET /integrations/sinigan-sync/tickets` con auth válida.
2. Verificar headers de respuesta:
   - `x-content-type-options` = `nosniff` o presente.
   - `x-frame-options` = `DENY` o presente.
   - `strict-transport-security` = presente (idealmente `max-age=31536000`).

---

## 3. Estrategia de Ejecución

### 3.1 Priorización

| Prioridad | Casos | Criterio |
|---|---|---|
| **P0** (Critical — blocker) | TC‑SEC‑01, 02, 03, 05, 06, 08, 09, 12, 14, 15 | IDOR, Broken Auth, Broken Function Level Auth, JWT tampering que comprometen aislamiento de tenant o permiten acceso no autorizado. Deben fallar CI/CD si fallan. |
| **P1** (High — debe pasar) | TC‑SEC‑04, 07, 10, 11, 13, 16, 18, 19 | Mass assignment, paginación, doble resolución, rutas destructivas. Riesgo medio-alto. |
| **P2** (Medium — desirable) | TC‑SEC‑17, 20 | Validación de formato, headers de seguridad. Bajas consecuencias de seguridad pero buena práctica. |

### 3.2 Dependencias

| Test | Depende de | Nota |
|---|---|---|
| TC‑SEC‑01, 02, 03, 08, 09, 11, 15 | Creación de un ticket en finca 1 | Usar `POST /comparisons` con `DIN-DEMO-000002` (discrepancia garantizada) |
| TC‑SEC‑04 | Seed de field_animals en finca 1 | `DIN-DEMO-000002` existe en el fixture por defecto |
| TC‑SEC‑18 | Creación + primera resolución exitosa | Orden específico |
| TC‑SEC‑06, 12, 13, 14, 15 | Generación manual de JWT | Requiere librería `jsonwebtoken` en Node.js y conocer la SECRET_KEY de desarrollo |
| TC‑SEC‑05, 07 | Ninguna setup | Son los más rápidos |
| TC‑SEC‑19 | Creación de ticket | Dependencia simple |

### 3.3 Setup de tokens especiales

Para los tests que requieren **generación manual de tokens**, se necesita:

```javascript
import jwt from 'jsonwebtoken';

const DEV_SECRET_KEY = 'dev-insecure-key-only-for-local-testing';

function makeToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, DEV_SECRET_KEY, { algorithm: 'HS256', expiresIn });
}

// Token expirado (A06)
const expiredToken = jwt.sign(
  { sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 1 },
  DEV_SECRET_KEY,
  { algorithm: 'HS256', expiresIn: '-1d' }
);

// Token sin farm_id (A26)
const noFarmToken = makeToken({ sub: 'vet@bovinotech.co', role: 'VETERINARIO' });

// Token farm_id inexistente (A27)
const fakeFarmToken = makeToken({ sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 999 });

// Token algorithm none (A31) — solo el formato, sin firma
const noneAlgToken = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 1 })).toString('base64url'),
  '' // sin firma
].join('.');

// Token con sub y farm_id inconsistentes (A29)
const crossFarmToken = makeToken({ sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 2 });
```

> **⚠️ Importante:** La `SECRET_KEY` en producción es diferente. Estos tests solo funcionan contra el entorno de desarrollo/Render si se conoce la clave real. Si no se puede acceder a la clave de Render, priorizar los tests de IDOR y RBAC que usan login real, y marcar los de JWT tampering como "observación" (requieren entorno controlado con la clave conocida).

### 3.4 Verificación de fuga de información en errores

Para asegurar que no hay **information leakage**:

1. **TC‑SEC‑21 (verificación adicional):** Para cada endpoint que devuelva error, inspeccionar el body completo:
   - No debe contener `stack`, `traceback`, `trace_id`, `exception`, `error_code` interno.
   - Debe contener solo `detail` (y opcionalmente `headers` para `401`).
   - El mensaje debe coincidir exactamente con el contrato.

2. **TC‑SEC‑22 (verificación adicional):** Para `POST /comparisons` con un DIN que **no existe en la fuente oficial**:
   - Status: `404`
   - `detail`: `"DIN no encontrado en las referencias disponibles."`
   - No debe revelar si el DIN existe como `FieldAnimalRecord` en otras fincas.

3. **Fallo silencioso en IDOR:** Confirmar que TC‑SEC‑02 y TC‑SEC‑03 devuelven el mismo mensaje exacto que un ticket que genuinamente no existe (ej: `id=9999`):
   - `"Ticket de conciliación no encontrado."` para ambos.

### 3.5 Ejecución en CI/CD

```bash
cd tests/playwright
npx playwright test --config=playwright.security.config.js --grep @security-sinigan
```

Se recomienda etiquetar cada test con anotaciones de Playwright:
- `@security-sinigan` — todos los tests de este plan
- `@p0`, `@p1`, `@p2` — prioridad
- `@idor`, `@auth`, `@rbac`, `@mass-assignment`, `@jwt`, `@pagination` — vector

Ejemplo:
```javascript
test.describe('HU-05 Security', () => {
  test('TC-SEC-01: IDOR — ticket farm 1 not visible from farm 2 @security-sinigan @p0 @idor', async () => { ... });
});
```

### 3.6 Orden de ejecución recomendado

1. TC‑SEC‑05 (sin auth — más básico, depende de nada)
2. TC‑SEC‑07 (token malformado — rápido)
3. TC‑SEC‑12 (sin farm_id — setup con generación manual)
4. TC‑SEC‑06 (token expirado)
5. TC‑SEC‑14 (algorithm none)
6. TC‑SEC‑17 (validación DIN — también rápido)
7. TC‑SEC‑01, 02, 03 (IDOR — requieren crear ticket)
8. TC‑SEC‑04 (IDOR comparación)
9. TC‑SEC‑08, 09 (RBAC)
10. TC‑SEC‑10, 11 (mass assignment)
11. TC‑SEC‑15 (cross-farm token)
12. TC‑SEC‑16 (paginación)
13. TC‑SEC‑18 (doble resolución)
14. TC‑SEC‑19 (rutas destructivas)
15. TC‑SEC‑13 (finca inexistente)
16. TC‑SEC‑20 (headers)

---

## Anexo: Mapa de cobertura OWASP

| Categoría OWASP API | Casos que la cubren |
|---|---|
| API1: Broken Object Level Authorization | TC‑SEC‑01, 02, 03, 04 |
| API2: Broken Authentication | TC‑SEC‑05, 06, 07, 12, 14, 15 |
| API3: Broken Object Property Level Authorization | TC‑SEC‑10, 11 |
| API4: Unconstrained Resource Consumption | TC‑SEC‑16 |
| API5: Broken Function Level Authorization | TC‑SEC‑08, 09 |
| API6: Mass Assignment | TC‑SEC‑10, 11 |
| API7: Security Misconfiguration | TC‑SEC‑20, 21, 22 |
| API8: Injection | (No aplica — no hay SQL dinámico ni queries concatenadas en el código revisado) |

---

_Generado por Sec Analyst — HU-05 sinigan_sync — Nov 2026_