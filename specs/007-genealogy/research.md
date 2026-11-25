# Investigación y decisiones: Registro genealógico y consanguinidad (HU-07)

**Fecha**: 2026-11-24 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Cada decisión indica: Decisión, Justificación y Alternativas consideradas. R1 y R2 resolvían los marcadores de aclaración de la spec y fueron **confirmadas por el usuario** el 2026-11-24 (ver spec.md, Clarifications).

---

## R1. Quién registra vínculos y estados de validación (confirmado por el usuario, Q1)

- **Decisión** (confirmada por el usuario): Opción A. El VETERINARIO registra, corrige y valida vínculos; sus vínculos nacen `VALIDADO`. El OPERARIO puede **proponer** vínculos (por ejemplo, al presenciar un parto en potrero); nacen `PENDIENTE_VALIDACION` hasta que un VETERINARIO anexa una validación (`VALIDADO` o `RECHAZADO`). Las fichas genealógicas solo las registra el VETERINARIO. ADMINISTRADOR y DIRECTIVO son de solo lectura.
- **Justificación**: Da contenido real al "estado de validación de cada vínculo" del criterio 1, encaja con la captura offline de campo y mantiene la autoridad veterinaria. El estado inicial se deriva del rol del autor en el momento del registro y se guarda de forma inmutable.
- **Alternativas**: (B) registro exclusivo del VETERINARIO: todos los vínculos serían `VALIDADO`; si se elige, se elimina `OPERARIO` de `LINK_CAPTURE_ROLES`, se omite el endpoint de validaciones y sus pruebas. Descartada por el usuario.

## R2. Ventana de tres generaciones (confirmado por el usuario, Q2)

- **Decisión** (confirmada por el usuario): La evaluación de un cruce S×D considera, para **cada candidato**, sus padres, abuelos y bisabuelos (profundidad 3 desde el candidato). El candidato mismo también cuenta como posible ancestro común (caso padre-hija). El indicador individual de un animal X se calcula como la evaluación del cruce padre(X) × madre(X) con la misma ventana. La profundidad es una constante única `GENERATION_WINDOW = 3` en `pedigree.py`.
- **Justificación**: Coincide con el árbol de tres generaciones que el veterinario ve para cada candidato: si observa un bisabuelo común en ambos árboles, el sistema lo advierte. Es más preventivo (detecta primos segundos, 1,5625 %).
- **Alternativas**: (B) ventana contada desde la cría hipotética (profundidad 2 desde cada candidato): bastaría `GENERATION_WINDOW_FROM_CANDIDATE = 2`; las pruebas de primos segundos cambiarían de "advertencia" a "sin ancestros comunes". Descartada por el usuario.

## R3. Método de cálculo del coeficiente: Wright por caminos

- **Decisión**: Coeficiente de la cría hipotética: `F = Σ_A Σ_(caminos) (1/2)^(n1 + n2 + 1) · (1 + F_A)`, donde `n1` y `n2` son las generaciones entre el padre candidato y la madre candidata y el ancestro común A. Para cada A común se combinan todos los caminos ascendentes `p1` (desde el padre) y `p2` (desde la madre) dentro de la ventana, y solo se cuentan los pares cuyos individuos en común sean únicamente A (independencia de caminos de Wright). `F_A` se toma como 0 (no se corrige por la consanguinidad del ancestro), por eso el valor se presenta como **estimado** y, con datos parciales, como **mínimo**.
- **Justificación**: Es el método estándar en mejoramiento genético bovino, explicable al veterinario (cada ancestro común aporta un término visible), exacto para los casos de referencia y barato con una ventana de 3 generaciones (máximo 15 individuos por candidato, contando al candidato).
- **Casos de referencia (pruebas obligatorias)**: hermanos completos 25 %; padre × hija 25 % (n1 = 0, n2 = 1); medios hermanos 12,5 %; dobles primos hermanos 12,5 %; primos hermanos 6,25 %; medios primos hermanos 3,125 %; primos segundos 1,5625 %; sin ancestros comunes con árbol completo 0 %.
- **Alternativas**: Método tabular de covarianzas (matriz de parentesco): exacto con `F_A` pero exige ordenar todo el hato y es menos explicable; descartado para el MVP. Conteo simple de ancestros comunes sin coeficiente: no cumple el criterio 2.

## R4. Datos insuficientes y presentación del coeficiente

- **Decisión**: Se enumeran las 14 posiciones de la ventana de cada candidato (2 + 4 + 8). Si falta alguna (ausencia de vínculo vigente o de ficha), el estado es `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` y se listan las posiciones faltantes. Reglas de valor:
  - Parcial y con ancestros comunes: coeficiente calculado, `coefficientIsMinimum = true`, advertencia emitida.
  - Parcial y sin ancestros comunes: `coefficient = null` (nunca 0), sin advertencia, mensaje "no se puede confirmar ausencia de consanguinidad".
  - Indicador individual de un animal sin padre o madre: `coefficient = null`, motivo `PARENTS_NOT_REGISTERED`.
  - Completo y sin ancestros comunes: `coefficient = 0.0`, estado `CÁLCULO_COMPLETO`, mensaje acotado a "dentro de 3 generaciones".
- **Literal de estado**: se usa exactamente `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` (con tilde, UTF-8), como exige la HU, y su par `CÁLCULO_COMPLETO`. Ambos se definen una sola vez como constantes en backend y frontend.
- **Alternativas**: Devolver 0 con una bandera de "incompleto": descartado, viola la regla "nunca asumir cero como certeza" y es fácil de malinterpretar en UI.

## R5. Niveles de riesgo

- **Decisión**: `ALTO` si F ≥ 0,125; `MODERADO` si 0,0625 ≤ F < 0,125; `BAJO` si 0 < F < 0,0625; sin nivel si no hay ancestros comunes. La advertencia (`warning = true`) se emite siempre que haya al menos un ancestro común (criterio 2), sea cual sea el nivel. La advertencia nunca bloquea (FR-017).
- **Justificación**: 6,25 % (primos hermanos) y 12,5 % (medios hermanos) son umbrales de referencia habituales en programas de apareamiento bovino.

## R6. Validación de vínculos y orden de comprobaciones

- **Decisión**: Orden fijo, para que el motivo reportado sea determinista:
  1. Cría y progenitor con ficha en la finca activa → si no, 404 `ANIMAL_NOT_FOUND` (sin revelar fichas de otras fincas).
  2. Anti-ciclos: progenitor igual a la cría o descendiente de la cría (búsqueda en anchura sobre **todos** los vínculos vigentes y pendientes de la finca, sin límite de generaciones) → 422 `GENEALOGY_CYCLE`.
  3. Sexo: `SIRE` exige `MACHO`, `DAM` exige `HEMBRA` → 422 `PARENT_SEX_MISMATCH`.
  4. Fechas: nacimiento del progenitor estrictamente anterior al de la cría → 422 `PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING`.
  5. Posición libre: no existe vínculo vigente para (cría, rol) → 409 `PARENT_ALREADY_REGISTERED` (para cambiarlo se usa corrección).
- **Justificación**: Con fechas estrictas, todo ciclo también violaría la regla de fechas; se comprueba el ciclo primero como defensa en profundidad y para que el criterio 4 reporte "ciclo" cuando corresponda. La anti-ciclos no se limita a 3 generaciones.
- **Alternativas**: Validar solo fechas: descartado (no expresa la regla anti-ciclos de forma explícita y auditable).

## R7. Append-only, vigencia y correcciones

- **Decisión**: Tres tablas de solo inserción: fichas, vínculos y validaciones. Ningún servicio emite `UPDATE` o `DELETE` sobre ellas y el router no expone `PUT`, `PATCH` ni `DELETE`. Cada vínculo lleva `sequence_no` por (finca, cría, rol) con restricción de unicidad; una corrección inserta un vínculo con `sequence_no` = anterior + 1, `corrected_event_id` = vínculo vigente y `correction_reason` obligatorio. El estado de cada vínculo se **deriva**: `CORREGIDO` si otro vínculo lo corrige; si no, la decisión de validación si existe; si no, su estado inicial. El vínculo vigente de una posición es el de mayor `sequence_no` con estado `VALIDADO` o `PENDIENTE_VALIDACION`; si el último está `RECHAZADO`, la posición queda libre y admite un nuevo registro (`sequence_no` = máximo + 1).
- **Justificación**: La unicidad de `sequence_no` evita dos vínculos vigentes por carrera concurrente sin necesidad de mutar una bandera "is_current". Una validación por vínculo (único `link_id`) evita decisiones contradictorias; un cambio posterior se hace por corrección.
- **Alternativas**: Columna `is_active` actualizable: descartada por violar append-only.

## R8. Vínculos pendientes en el cálculo

- **Decisión**: Los vínculos `PENDIENTE_VALIDACION` **sí** participan en árbol y cálculo (prevención primero) y la respuesta indica `includesPendingLinks = true`; los `RECHAZADO` y `CORREGIDO` no participan.
- **Justificación**: Una falsa alarma revisable es preferible a omitir un riesgo real de consanguinidad; la UI muestra el estado del vínculo.

## R9. Offline-first e idempotencia

- **Decisión**: Fichas, vínculos y correcciones llevan `clientEventId` (UUID) único por finca. Repetición con el mismo contenido → HTTP 200 con el registro existente y `syncStatus: "DUPLICADO"`; mismo `clientEventId` con contenido distinto → 409 `CLIENT_EVENT_ID_CONFLICT`. En el cliente, cola `bovinotech_offline_genealogy_queue` con el esquema estándar `{ client_event_id, timestamp_utc, status, payload }`, sincronización en orden FIFO (una ficha se sincroniza antes que el vínculo que la usa). Errores transitorios (red, 5xx) dejan el elemento en `failed` para reintento; rechazos de negocio (4xx) salen de la cola y pasan a la lista local `bovinotech_offline_genealogy_rejected` con código y motivo para que el usuario los vea. Validaciones veterinarias, árbol y evaluación requieren conexión; la vista conserva en memoria/almacenamiento local el último árbol y evaluación consultados, rotulados "dato en caché".
- **Justificación**: Mismo patrón que HU-08 (`productivityOfflineQueue.js`), compatible con el Offline Hub de la constitución sin tocar el módulo `offline-sync` (otro integrante).
- **Limitación**: El badge global del App Shell pertenece a `frontend/src/features/offline-sync/`; HU-07 expone `pendingCount()` y muestra su contador en la vista propia, pero no modifica ese módulo.

## R10. Desacoplamiento y fuente SINIGÁN V6

- **Decisión**: El módulo guarda sus propias fichas (`genealogy_animals`) con DIN como string, sin llaves foráneas a tablas de otras HU. Ningún módulo existente almacena fecha de nacimiento (`sinigan` y `sinigan_sync` tienen sexo pero no fecha; `offline_capture` solo DIN y nombre), por lo que no hay módulo de animales reutilizable. El DIN se valida con el patrón del proyecto `^DIN-DEMO-[0-9]{6}$` (mayúsculas). El módulo nunca escribe en tablas de SINIGÁN ni de conciliación; la ficha genealógica es un registro de campo y no sobrescribe la fuente oficial.
- **Semilla**: DIN en el rango `DIN-DEMO-000101` a `DIN-DEMO-000119`, distinto de los usados por `sinigan`/`offline_capture` (`000001`–`0000xx`), para evitar contradicciones de sexo entre semillas de distintos módulos.

## R11. Autorización y ámbito de finca

- **Decisión**: Igual que HU-08: `get_current_user` de `auth.dependencies`, `farm_id` siempre desde `user.active_farm_id` (nunca del payload; los esquemas de entrada usan `extra="forbid"`). Sin finca activa → 403. Rol sin permiso → 403. Animal o vínculo de otra finca → 404. Matriz:

| Operación | OPERARIO | VETERINARIO | ADMINISTRADOR | DIRECTIVO |
|---|---|---|---|---|
| Registrar ficha | — | Sí | — | — |
| Registrar vínculo | Sí, `PENDIENTE_VALIDACION` | Sí, `VALIDADO` | — | — |
| Corregir vínculo | — | Sí | — | — |
| Validar o rechazar vínculo | — | Sí | — | — |
| Listar fichas, árbol, historial | Sí | Sí | Sí | Sí |
| Indicador y evaluación de cruce | — | Sí | Sí | Sí |

## R12. Pruebas y presupuesto de CI

- **Decisión**: Núcleo de cálculo en funciones puras (`pedigree.py`) probadas sin base de datos; pruebas de servicio y contrato con SQLite en memoria y una app FastAPI propia con el router del módulo (patrón de `backend/tests/test_productivity.py`), sin tocar `conftest.py`. Frontend con `node:test` (patrón de `productivityOfflineQueue.test.js`). Objetivo: < 3 s de la suite del módulo para respetar el CI < 90 s.
