# Security Review — HU-05 (sinigan_sync)

| Atributo | Valor |
|---|---|
| **Revisor** | Sec Reviewer |
| **Feature** | HU-05 — Conciliación SINIGÁN (Modo Simulado) |
| **Backend** | `https://bovinotech-iot-sdd.onrender.com` |
| **Fecha** | 2026-11-24 |
| **Tests analizados** | `tests/playwright/security/` (6 spec files, 23 tests) |
| **Plan de referencia** | `security-test-plan.md` (20 TC-SEC numerados + matriz de amenazas OWASP) |

---

## 1. Resumen de Cobertura

### 1.1 Tests creados vs Plan

| Fuente | Cantidad |
|---|---|
| Tests implementados (archivos `.test.js`) | **23** tests |
| TC-SEC definidos en el plan | **20** casos numerados + amenazas en matriz |
| Tests implementados con numeración TC-SEC | 22 tests (TC-SEC-01 al 22) |
| Tests sin numeración en plan pero implementados | TC-SEC-19 (Replay), TC-SEC-22 (Abuso) |
| Amenazas del plan **no implementadas** | **12** (ver Hallazgos §3) |

### 1.2 Vectores OWASP cubiertos

| Categoría OWASP API # | Vector | Tests que lo cubren | Estado |
|---|---|---|---|
| **API1** | Broken Object Level Authorization (IDOR) | TC-SEC-01, 02, 03, 04 | ✅ Cubierto |
| **API2** | Broken Authentication | TC-SEC-04*, 05*, 07*, 08*, 06* (*nombres código), TC-SEC-18 | ✅ Cubierto |
| **API3** | Broken Object Property Level Authorization | — | ❌ No cubierto directamente (ver nota) |
| **API4** | Unconstrained Resource Consumption | TC-SEC-20, 21, 22 | ✅ Cubierto (parcial) |
| **API5** | Broken Function Level Authorization | TC-SEC-09, 10, 11 | ✅ Cubierto |
| **API6** | Mass Assignment | TC-SEC-12, 13, 14, 15 | ✅ Cubierto |
| **API7** | Security Misconfiguration | — | ❌ No cubierto |
| **API8** | Injection | — | No aplica (según plan) |

> **Nota API3:** El plan mapea TC-SEC-10/11 (Mass Assignment) a API3, pero estos realmente pertenecen a API6. No hay tests que cubran API3 como tal (ej: filtrar propiedades de objetos en respuestas).

### 1.3 Severidades cubiertas

| Severidad | En plan | Implementados | Brecha |
|---|---|---|---|
| **Critical** | 7 amenazas (A03, A05, A26, A27, A29, A31, A28?) | Parcial: A03✅, A05✅, A26✅, A27✅, A31✅ | ❌ **A29 no implementado** (cross-farm token) |
| **High** | ~11 amenazas (A01, A02, A06, A09, A10, A11, A13, A14, A21, A22, A30, A32) | Parcial | ❌ **A21, A22, A30, A32 no implementados** |
| **Medium** | ~8 amenazas (A04, A07, A08, A12, A18, A19, A23, A25, A28) | Parcial: A04✅, A07✅, A08✅, A12✅, A18✅, A19✅ | ❌ **A23, A25, A28 no implementados** |
| **Low** | ~5 amenazas (A15, A16, A17, A20, A24) | Parcial: A20✅ | ❌ **A15, A16, A17, A24 no implementados** |

---

## 2. Evaluación de Calidad

### 2.1 Especificidad de los asserts

| Archivo | Evaluación |
|---|---|
| **idor.api.test.js** | ✅ **Excelente.** Asserts específicos: status exacto, mensaje exacto (`"Ticket de conciliación no encontrado."`), verifica ausencia de propiedades sensibles (`farm_id`, `din`, `status`), compara mensaje contra ticket genuinamente inexistente. |
| **auth.api.test.js** | ⚠️ **Regular.** Verifica status `401` correctamente, pero usa `detail.length > 0` en lugar de validar el mensaje exacto `"No se pudieron validar las credenciales"` que el plan especifica. Esto podría dejar pasar un mensaje de error incorrecto que igualmente tenga longitud > 0. |
| **rbac.api.test.js** | ✅ **Bueno.** Verifica status exacto (`403`) y mensaje exacto (`"Acceso denegado: Se requiere rol de Veterinario"`). TC-SEC-11 podría ser más específico (usa `detail.length > 0`). |
| **mass-assignment.api.test.js** | ⚠️ **Aceptable.** Verifica `422` correctamente, pero la validación del mensaje de error es genérica (`includes('extra' \|\| 'unexpected' \|\| 'forbid')`). Podría falsamente excluir errores con redacción diferente. |
| **jwt-tampering.api.test.js** | ⚠️ **Mixto.** TC-SEC-18 verifica mensaje exacto ✅; TC-SEC-16/17 usan `detail.length > 0` ❌. TC-SEC-19 (Replay) es correcto pero es un **falso negativo documentado** (ver Hallazgos). |
| **resource-consumption.api.test.js** | ⚠️ **Aceptable.** Verifica status y estructura. TC-SEC-22 usa lógica `successCount > 0` que es débil como assert de seguridad. |

### 2.2 Verificación de mensajes de error exactos

| Test | ¿Mensaje exacto? | Detalle |
|---|---|---|
| TC-SEC-02 | ✅ `"Ticket de conciliación no encontrado."` | Ideal |
| TC-SEC-03 | ✅ `"Ticket de conciliación no encontrado."` | Ideal |
| TC-SEC-04 | ✅ `"No existe registro de campo para el DIN consultado."` | Ideal |
| TC-SEC-09 | ✅ `"Acceso denegado: Se requiere rol de Veterinario"` | Ideal |
| TC-SEC-10 | ✅ `"Acceso denegado: Se requiere rol de Veterinario"` | Ideal |
| TC-SEC-18 | ✅ `"No se pudieron validar las credenciales"` | Ideal |
| TC-SEC-04* (auth) | ❌ `detail.length > 0` | El plan pide `"No se pudieron validar las credenciales"` |
| TC-SEC-05* (auth) | ❌ `detail.length > 0` | El plan pide `"No se pudieron validar las credenciales"` |
| TC-SEC-06* (auth) | ❌ `detail.length > 0` | El plan pide `"No se pudieron validar las credenciales"` |
| TC-SEC-06* (wrong key) | ❌ `detail.length > 0` | El plan pide `401` con mensaje de credenciales inválidas |

### 2.3 Verificación de fuga de información

| Aspecto | Evaluación |
|---|---|
| **IDOR ticket detail** (TC-SEC-02) | ✅ Excelente: verifica que `body` NO contenga `farm_id`, `din`, `status`. |
| **IDOR mensaje indistinguible** (TC-SEC-02, 03) | ✅ Excelente: compara mensaje contra el de un ticket ID inexistente (999999). |
| **IDOR comparación cross-farm** (TC-SEC-04) | ✅ Bueno: verifica que `409` es diferente de `404` (DIN realmente inexistente). |
| **Stack traces en errores 422** | ❌ No se verifica. Ningún test inspecciona que los errores 422 no contengan `stack`, `traceback` o `exception`. |
| **Stack traces en errores 401/404** | ❌ No se verifica explícitamente. |
| **Headers de seguridad** | ❌ No se verifica presencia de `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`. |
| **CORS** | ❌ No se verifica. |

### 2.4 Uso de tokens: reales vs simulados

| Tipo de token | Tests que lo usan | Evaluación |
|---|---|---|
| **Tokens reales** (vía `apiLogin`) | IDOR, RBAC, Mass Assignment, Resource Consumption | ✅ Representa el flujo real del usuario |
| **Tokens firmados manualmente** (vía `signToken` con `DEV_SECRET_KEY`) | Auth (expirado, wrong key), JWT Tampering | ⚠️ **Riesgo conocido:** Dependen de conocer la `SECRET_KEY` de desarrollo (`'dev-insecure-key-only-for-local-testing'`). Si el backend de Render cambia la clave secreta, estos tests fallarán aunque el comportamiento de seguridad sea correcto. |
| **Token `alg: none`** | TC-SEC-18 | ✅ Técnica correcta para probar este vector específico. |

---

## 3. Hallazgos

### 3.1 Falsos positivos / negativos potenciales

| # | Hallazgo | Tipo | Severidad |
|---|---|---|---|
| **FP-01** | **Replay attack (TC-SEC-19) se reporta como "funciona normalmente"**. El test verifica que el mismo token se reusa exitosamente, lo cual es comportamiento esperado. No hay un test que *detecte* un ataque de replay real. Esto no es un falso positivo del test, sino una **observación documentada**: el sistema no tiene protección contra replay. | Observación | Medium |
| **FP-02** | **Auth tests con `detail.length > 0`**. Si el backend cambiara el mensaje de error a algo como `"error": "x"` (longitud 1), el test pasaría igual. Esto podría enmascarar un cambio en la estrategia de errores. | Falso negativo potencial | Medium |
| **FP-03** | **Mass assignment con `includes('extra')`**. Si el backend cambia la redacción del error a `"campos no permitidos"` (no incluye "extra", "unexpected" ni "forbid"), el test fallaría aunque el comportamiento de seguridad sea correcto. | Falso positivo potencial | Low |
| **FP-04** | **TC-SEC-11 (rol inventado)** devuelve `401` porque el `sub` (`fake@bovinotech.co`) no existe en la DB, no específicamente porque el rol `SUPER_ADMIN` sea inválido. El test no distingue entre "usuario no existe" y "rol inventado rechazado". | Falso negativo | Medium |

### 3.2 Vectores no cubiertos (brechas respecto al plan)

| # | Amenaza faltante | En plan | Severidad | Impacto |
|---|---|---|---|---|
| **GAP-01** | **A29 — Cross-farm token**: Token con `sub=vet@bovinotech.co` + `farm_id=2` accediendo a ticket de finca 1. | TC-SEC-15 | **Critical** | Sin este test, no se verifica que el backend valide la pertenencia usuario-finca a nivel de endpoint. |
| **GAP-02** | **A16 — Formato DIN**: `POST /comparisons` con `din: "INVALIDO"` → `400`. | TC-SEC-17 | Low | Validación de entrada básica. |
| **GAP-03** | **A15 — reason demasiado corto**: `reason: "abc"` → `422`. | No numerado | Low | Validación de longitud mínima. |
| **GAP-04** | **A17 — decisión inválida**: `decision: "INVALIDA"` → `422`. | No numerado | Low | Validación de enumeración. |
| **GAP-05** | **Doble resolución** — Resolver un ticket ya resuelto → `409`. | TC-SEC-18 | Medium | Invariante de negocio. |
| **GAP-06** | **No PUT/PATCH/DELETE** sobre tickets. | TC-SEC-19 | Medium | Seguridad por profundidad. |
| **GAP-07** | **A24 — Response headers**: `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`. | TC-SEC-20 | Low | Seguridad de navegación (menos relevante para API). |
| **GAP-08** | **A23 — CORS**: Verificar que `Access-Control-Allow-Origin` no sea `*`. | A23 | Medium | Riesgo de CSRF si hay frontend. |
| **GAP-09** | **A25 — Stack traces en 422**: Verificar que errores de validación no filtren información interna. | A25 | Medium | Fuga de información. |
| **GAP-10** | **A28 — `farm_id` como string**: Token con `farm_id: "1"` (string vs int). | A28 | Medium | Type confusion. |
| **GAP-11** | **A30 — Token sin `sub`**: Payload sin email. | A30 | High | Validación de claims. |
| **GAP-12** | **A32 — Clave pública como HMAC secret**: Si el servidor expone clave pública, un atacante podría firmar tokens. | A32 | High | Algoritmo confusion (JWT). |

### 3.3 Riesgos residuales

| Riesgo | Descripción | Probabilidad | Impacto |
|---|---|---|---|
| **Clave secreta hardcodeada** | La `DEV_SECRET_KEY = 'dev-insecure-key-only-for-local-testing'` está hardcodeada en `jwt-utils.js`. Cualquiera con acceso al repo puede firmar tokens válidos contra entornos que usen esta clave. | Alta (si Render usa esta clave) | Crítico |
| **Sin protección contra replay** | TC-SEC-19 confirma que el mismo token funciona indefinidamente. No hay `jti`, nonce, ni rotación de tokens. | Media | Medio |
| **Sin rate limiting** | TC-SEC-22 verifica que 10 requests rápidas funcionan sin error. No hay límite de tasa en `POST /comparisons`. | Media | Bajo (abuso de recursos) |
| **Numeración inconsistente** | Los tests usan números TC-SEC que no coinciden con el plan (ej: código tiene TC-SEC-06 = wrong key, plan tiene TC-SEC-06 = expired token). | Alta (confusión en reportes) | Bajo (impacto operativo) |

---

## 4. Veredicto

> ## APROBADO CON OBSERVACIONES

### Justificación

**Fortalezas:**
- El corazón de la seguridad (IDOR, RBAC, Broken Auth, Mass Assignment, JWT tampering) está cubierto con 23 tests.
- Los tests de IDOR son ejemplares: verifican status exacto, mensaje de error exacto, ausencia de fuga de datos, y comparación contra recursos genuinamente inexistentes.
- Los tests de RBAC y Mass Assignment verifican que el estado del recurso no cambia tras el intento denegado (defensa en profundidad).
- Los helpers están bien factorizados en `shared.js` y `jwt-utils.js`.

**Observaciones que deben resolverse antes del pase a producción:**

1. **Crítico:** Implementar el test faltante **A29 (Cross-farm token — TC-SEC-15 del plan)**. Es un vector Critical que valida que un token con `sub` válido pero `farm_id` de otra finca no pueda acceder a tickets ajenos.

2. **Alto:** Los tests de autenticación deben verificar el **mensaje de error exacto** (`"No se pudieron validar las credenciales"`) en lugar de `detail.length > 0`. Esto previene regresiones silenciosas.

3. **Medio:** Implementar los tests de **fuga de información en errores 422** (A25): verificar que ningún error contenga `stack`, `traceback`, o `exception`.

4. **Medio:** Implementar test de **CORS** (A23) para verificar que `Access-Control-Allow-Origin` no sea `*`.

5. **Medio:** Implementar test de **token sin `sub`** (A30) — High en el plan.

6. **Medio:** Verificar que la `DEV_SECRET_KEY` en el código de test coincide con la clave real del backend de Render. Si no es así, los tests de JWT tampering (TC-SEC-16, 17, 18, 05*, 06*) son inválidos contra el entorno real.

7. **Bajo:** Implementar tests de **DIN format validation** (A16), **double resolution**, **no PUT/PATCH/DELETE**, y **security headers** para cerrar todas las brechas del plan.

**Riesgos aceptados:**
- Sin protección contra replay (no está en el contrato actual).
- Sin rate limiting (documentado en el plan como observación).

---

## Resumen ejecutivo (10 líneas)

1. Se analizaron 23 tests de seguridad en 6 spec files contra el plan maestro que define 20 TC-SEC y 32 amenazas OWASP.
2. Los tests de IDOR son ejemplares: verifican mensajes exactos, ausencia de fuga de datos, y comparación contra recursos inexistentes.
3. El principal gap crítico es el test A29 (cross-farm token) del plan, que verifica que un token con sub válido pero farm_id ajeno sea rechazado — no está implementado.
4. Los tests de autenticación usan `detail.length > 0` en vez del mensaje exacto especificado en el plan, lo que permite regresiones silenciosas.
5. Faltan 12 amenazas del plan: CORS, fuga en errores 422, token sin sub, formato DIN, doble resolución, rutas destructivas, headers de seguridad, y otras.
6. La clave secreta de desarrollo está hardcodeada en `jwt-utils.js`; si no coincide con la de Render, los 7 tests que firman tokens manualmente son inválidos.
7. TC-SEC-11 (rol inventado) tiene un falso negativo: devuelve 401 porque el usuario no existe en DB, no específicamente por el rol inválido.
8. El sistema no tiene protección contra replay ni rate limiting, documentado como riesgo aceptado.
9. La numeración TC-SEC en el código no coincide con la del plan (ej: código usa TC-SEC-06 para wrong key, plan para expired token).
10. **Veredicto: APROBADO CON OBSERVACIONES** — Se requiere implementar A29 (crítico) y corregir los asserts genéricos de auth antes del pase a producción.