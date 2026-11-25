# Validación rápida: Genealogía y consanguinidad (HU-07)

Guía para comprobar la HU-07 una vez implementada. Usa únicamente la semilla propia del módulo ([data-model.md](data-model.md), sección "Semilla propia"); no se usan animales reales.

## Requisitos

- Entorno Python del backend (`backend/.venv`) con `requirements.txt` instalado, y `bandit` para el SAST.
- Node 20+ y dependencias de `frontend/` instaladas.
- Usuarios semilla de HU-01 en la finca 1: `vet@bovinotech.co` (VETERINARIO), `operario@bovinotech.co` (OPERARIO), `directivo@bovinotech.co` (DIRECTIVO). Contraseñas desde variables de entorno `SEED_*_PASSWORD` (nunca en el repositorio).

## Pruebas automatizadas

Desde `backend/`:

```bash
.venv/bin/python -m pytest tests/unit/test_genealogy_pedigree.py tests/unit/test_genealogy_link_rules.py tests/contract/test_genealogy_api.py tests/security/test_genealogy_authorization.py -q
.venv/bin/python -m pytest -q          # suite completa, sin regresiones
.venv/bin/bandit -r app/features/genealogy -ll
```

Desde la raíz del repositorio:

```bash
node --test frontend/src/features/genealogy/
```

Desde `frontend/`:

```bash
npm run lint && npm run build
```

Resultado esperado: todas las pruebas del módulo pasan en pocos segundos; los casos de referencia de Wright (25 %, 12,5 %, 6,25 %, 3,125 %, 1,5625 %) se reproducen exactamente; Bandit sin hallazgos de severidad media o alta; lint y build sin errores.

## Verificación manual de API (servidor local, token de VETERINARIO salvo indicación)

Contratos en [contracts/api.md](contracts/api.md).

1. **Criterio 1**: `GET /genealogy/animals/DIN-DEMO-000101/tree` → 14 posiciones, `isComplete: true`, todas `VALIDADO`. Con `DIN-DEMO-000116` → posiciones bajo `dam` en `NO_REGISTRADO` y `dam` en `PENDIENTE_VALIDACION`.
2. **Criterio 2**: `GET /genealogy/matings/evaluation?sire_din=DIN-DEMO-000116&dam_din=DIN-DEMO-000101` → `warning: true`, ancestro común `DIN-DEMO-000102`, `coefficientPercent: 12.5`, `riskLevel: "ALTO"`, `coefficientIsMinimum: true`. Con `sire_din=DIN-DEMO-000102&dam_din=DIN-DEMO-000101` → 25 %.
3. **Criterio 3**: `GET /genealogy/animals/DIN-DEMO-000118/inbreeding` → `calculationStatus: "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES"`, `coefficient: null`, `reason: "PARENTS_NOT_REGISTERED"`.
4. **Criterio 4**: `POST /genealogy/links` con `offspringDin: DIN-DEMO-000101`, `parentDin: DIN-DEMO-000119`, `parentRole: SIRE` → 422 `PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING`. Con `offspringDin: DIN-DEMO-000102`, `parentDin: DIN-DEMO-000101`, `parentRole: DAM` → 422 `GENEALOGY_CYCLE`. Con `offspringDin: DIN-DEMO-000119`, `parentDin: DIN-DEMO-000118`, `parentRole: SIRE` → 422 `PARENT_SEX_MISMATCH`.
5. **Idempotencia**: registrar `DIN-DEMO-000116` como padre de `DIN-DEMO-000119` dos veces con el mismo `clientEventId` → 201 y luego 200 `DUPLICADO`; un solo vínculo en `GET /genealogy/animals/DIN-DEMO-000119/links`.
6. **Append-only**: corregir ese vínculo con `POST /genealogy/links/{id}/corrections` (motivo obligatorio) → el historial muestra el original `CORREGIDO` y el nuevo vigente con `correctedEventId`.
7. **Validación**: con token de OPERARIO registrar la madre de `DIN-DEMO-000119` → `PENDIENTE_VALIDACION`; con token de VETERINARIO `POST /genealogy/links/{id}/validations` `VALIDADO` → el árbol muestra `VALIDADO`.
8. **RBAC y finca**: con token de DIRECTIVO, `POST /genealogy/links` → 403; con un usuario de la finca 2, `GET /genealogy/animals/DIN-DEMO-000101/tree` → 404.

## Verificación manual de interfaz

1. Iniciar sesión como VETERINARIO, abrir "Genealogía y consanguinidad" en el menú lateral; en ancho < 768 px los botones miden al menos 48x48 px y el árbol se despliega por generación.
2. Activar el modo sin conexión del navegador, registrar un vínculo válido: aparece en el contador de pendientes del módulo. Reconectar y sincronizar: se consolida una sola vez.
3. Registrar sin conexión un vínculo que el servidor rechace (por ejemplo, posición ya ocupada): tras sincronizar aparece en "Rechazados" con su motivo.
4. Evaluar Lucero (`DIN-DEMO-000118`) como madre con cualquier macho sin ancestros comunes: la UI muestra "Datos insuficientes" y nunca "0 %".

## Resultados de verificación (Agente Implementador, 2026-11-24)

### Pruebas automatizadas

- Módulo HU-07 (backend): 137 pruebas pasadas, 0 fallidas, en ~4,8 s (el tiempo incluye la fixture `autouse` de `conftest.py`, que recrea la base y siembra usuarios en cada prueba; el núcleo puro `test_genealogy_pedigree.py` corre en < 1 s).
- Suite completa backend: 421 pasadas, 0 fallidas (línea base previa: 284).
- `bandit -r app/features/genealogy -ll`: sin hallazgos (Medium 0, High 0).
- Frontend `node --test 'frontend/src/features/genealogy/*.test.js'`: 19 pasadas, 0 fallidas; todas las features: 199 pasadas, 0 fallidas.
- `npm run lint` y `npm run build`: sin errores.
- Nota de entorno: con Node 22, `node --test <directorio>` no acepta un directorio; se usa el patrón glob indicado arriba. La suite backend se ejecutó desde un directorio de trabajo limpio porque la `backend/bovinotech.db` local (ignorada por git) tenía un esquema antiguo de telemetría y hacía fallar la importación de `app.main` también en la línea base.

### Verificación de API (app completa `app.main`, base nueva, tokens de los usuarios semilla de HU-01)

| Paso | Resultado |
|---|---|
| 1. Árbol de Aurora: 14 posiciones `VALIDADO`, `isComplete: true`; Rayo: `dam` `PENDIENTE_VALIDACION`, ancestros de `dam` `NO_REGISTRADO` (`missingCount` 6) | OK |
| 2. Rayo × Aurora: advertencia, ancestro común Titán, 12,5 %, `ALTO`, mínimo estimado; Titán × Aurora: 25 % | OK |
| 3. Lucero: `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`, `coefficient: null`, `PARENTS_NOT_REGISTERED` | OK |
| 4. Rechazos `PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING`, `GENEALOGY_CYCLE`, `PARENT_SEX_MISMATCH` | OK |
| 5. Idempotencia: 201 y luego 200 `DUPLICADO`, un único vínculo | OK |
| 6. Corrección: original `CORREGIDO`, nuevo vigente con `correctedEventId` | OK |
| 7. OPERARIO registra `PENDIENTE_VALIDACION`; VETERINARIO valida y el árbol muestra `VALIDADO` | OK |
| 8. DIRECTIVO registra → 403; usuario en finca 2 consulta árbol → 404 | OK |

### Verificación manual de interfaz

Pendiente de verificación humana: no se dispuso de navegador en la sesión del agente, por lo que los pasos 1–4 de interfaz (ancho < 768 px y objetivos táctiles de 48x48 px, modo sin conexión con contador de pendientes, rechazados tras sincronizar y Lucero sin "0 %") no se ejecutaron en un navegador. Cobertura indirecta: la cola offline, la prevalidación local y `formatCoefficient` (que nunca produce "0 %" con cálculo parcial) están cubiertas por las pruebas `node:test`; los estilos fijan `min-height`/`min-width` de 48 px en botones, pestañas y campos.
