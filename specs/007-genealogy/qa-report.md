# Informe QA y Seguridad: HU-07 Registro genealógico y advertencia preventiva de consanguinidad

**Agente**: QA y Seguridad (`qa-seguridad`), auditor independiente (no escribió el código).
**Rama**: `feat/hu-07-genealogy` (verificada; sin commits sobre `main`, cambios sin confirmar).
**Fecha**: 2026-11-24
**Insumos**: `specs/007-genealogy/` (spec.md con Clarifications, plan.md, research.md, data-model.md, contracts/api.md, contracts/frontend.md, quickstart.md, tasks.md), `backend/app/features/genealogy/`, `frontend/src/features/genealogy/`, `backend/tests/**/test_genealogy_*.py`, `backend/tests/fixtures/genealogy_factory.py`, diff de `backend/app/main.py` y `frontend/src/App.jsx`.

## 1. Resumen

El backend cumple los criterios de aceptación de la HU. El cálculo de Wright es correcto: los caminos son independientes, el candidato puede ser a la vez ancestro común y no hay doble conteo. Los rechazos por fecha, sexo y ciclo funcionan bien, la idempotencia también, el historial es append-only y las fincas están aisladas. Bandit no reporta problemas y no hay secretos en el código. La suite completa de backend (421), las 199 pruebas frontend, `lint` y `build` pasan. Además ejecuté 39 pruebas sintéticas propias desde el scratchpad, y todas pasan.

El defecto bloqueante está en la cola offline del frontend. Las entradas no guardan el autor ni la finca, y cualquier sesión que abra la vista las envía con su propio token. Si un OPERARIO captura vínculos en un dispositivo compartido y después entra un VETERINARIO, esas propuestas se crean como `VALIDADO` a nombre del veterinario, sin que nadie las haya revisado. Eso se salta FR-019 y FR-020 y rompe la trazabilidad de autoría. Hay además dos hallazgos MEDIOS en el frontend: la cola trata 401/403 como rechazo definitivo y las cachés locales no se separan por usuario ni por finca.

**Veredicto: RECHAZADO** (1 hallazgo ALTO).

## 2. Matriz criterio → evidencia

| Criterio | Evidencia | Estado |
|---|---|---|
| CA1 HU / US2-1 / FR-010 / SC-002: árbol de 3 generaciones con estado de cada vínculo | `pedigree.py:119-154` (14 posiciones fijas); `test_genealogy_pedigree.py::test_complete_tree_has_fourteen_validated_positions`, `::test_ancestors_beyond_third_generation_are_not_included`; QA: `test_single_parent_tree_and_indicator_partial` (un solo progenitor → `missing_count=7`) | Cumple |
| US2-2 / FR-011: posiciones faltantes "No registrado", árbol incompleto | `pedigree.py:129-134` (un hueco propaga `NO_REGISTRADO` hacia arriba); `PedigreeTree.jsx:31-61` | Cumple |
| US2-4: vínculo corregido, solo el vigente en el árbol, historial con autor y motivo | `pedigree.py:42-58`; QA `test_correction_creates_cycle_rejected_and_history_kept` (estados `CORREGIDO` + `VALIDADO`) | Cumple |
| CA2 HU / US3-1 / FR-012-014 / SC-003: advertencia con ancestro común y coeficiente | `pedigree.py:195-279`; QA: padre×hija 25 %, madre×hijo 25 %, abuelo×nieta 12,5 %, medios hermanos 12,5 %, primos 6,25 % (MODERADO), primos segundos 1,5625 % (BAJO), retrocruza repetida 37,5 %; seed 116×101 = 12,5 % | Cumple |
| Wright: independencia de caminos / candidato como ancestro / sin doble conteo | `pedigree.py:203` (`set(p1) & set(p2) == {din}`); QA `test_full_sibs_with_half_sib_parents_path_independence` (F = 1/4 + 2·1/32 = 31,25 %, G con exactamente 2 pares de caminos); `test_father_daughter_25` (un solo ancestro común, los ancestros del padre no se suman) | Cumple |
| CA3 HU / US3-2 / FR-015-016 / SC-004: datos insuficientes, nunca 0 %, literal `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` | `pedigree.py:16, 240-267` (`coefficient=None` si es parcial y no hay ancestros comunes); QA API `test_seed_half_sibs_and_partial` (DIN-DEMO-000119 → literal exacto, `coefficient=null`); QA `test_partial_never_zero_and_minimum_flag` (28 posiciones faltantes); frontend `genealogyPresentation.js:50-61` + QA node `UI never shows 0 % when partial` | Cumple |
| US3-4: parcial con ancestros comunes → valor mínimo | `pedigree.py:258` (`coefficient_is_minimum`), mensaje "mínimo"; UI "≥ X % (mínimo estimado)" | Cumple |
| US3-6: candidato ancestro del otro | QA padre×hija, madre×hijo, abuelo×nieta | Cumple |
| CA4 HU / US1-2 / FR-003: progenitor nacido después o el mismo día | `service.py:236-240` (estrictamente anterior); QA `test_same_birthdate_rejected_one_day_before_accepted`, `test_parent_born_after_offspring_rejected` | Cumple |
| CA4 HU / US1-3 / FR-004: ciclos sin límite de generaciones | `pedigree.py:69-87` (BFS sin límite); QA `test_indirect_cycle_five_generations` (código `GENEALOGY_CYCLE`), autovínculo | Cumple |
| US1-4 / FR-005: sexo incompatible | `service.py:233-235`; QA `test_self_link_and_sex_mismatch` (hembra como padre, macho como madre) | Cumple |
| Cruce consigo mismo / mismo sexo / roles invertidos | `service.py:408-422`; QA `test_mating_self_same_sex_reversed` (422 en los tres casos) | Cumple |
| FR-006 / FR-018 / aislamiento por finca | Toda consulta filtra por `farm_id` (`service.py:76, 87, 116-118, 331, 362`); QA `test_cross_farm_isolation`: no se vincula, consulta, evalúa ni valida nada de otra finca, y la respuesta 404 es idéntica a la de un DIN inexistente | Cumple |
| FR-019 / FR-020: OPERARIO → `PENDIENTE_VALIDACION`, solo VETERINARIO valida | `router.py:26-30`, `service.py:243-244, 360-384`; QA `test_operator_pending_then_vet_validates_operator_cannot` (403 OPERARIO, 409 doble validación, 422 motivo en blanco) | Cumple en backend; **se elude desde el frontend (H-01)** |
| FR-008 / SC-006: append-only | Sin UPDATE/DELETE en el módulo (grep); router sin PUT/PATCH/DELETE (QA `test_unauthenticated_real_app_401` → 404/405); validación como tabla aparte con `UNIQUE(link_id)` | Cumple |
| FR-009 / SC-005: idempotencia `clientEventId` | `service.py:285-289, 326-330, 164-172`; QA: mismo contenido → 200 `DUPLICADO` con el mismo id; contenido distinto → 409 `CLIENT_EVENT_ID_CONFLICT`; id de vínculo reutilizado en corrección → 409; fichas: 200/409/409 por DIN duplicado | Cumple en backend; en el cliente, ver H-01 y H-02 |
| FR-021: no toca el DIN oficial | El módulo no importa `sinigan` ni escribe en sus tablas | Cumple |
| FR-017: advertencia no bloqueante | La evaluación es GET de solo lectura; la UI la describe como preventiva | Cumple |
| UI-001: 48×48 px, `inputMode="numeric"` | `genealogy.css:44-45,108,129,217`; inputs DIN con `inputMode="numeric"` | Cumple (sin verificar en navegador, H-06) |
| UI-003 / casos de borde offline: FIFO, rechazados visibles | `genealogyOfflineQueue.js:63-101`; QA node `FIFO order and stop on network error, rejected kept` | Cumple, con H-01, H-02 y H-05 |
| SC-007: < 2 s | QA `test_large_herd_latency` con 6000 animales y 11 200 vínculos: árbol 0,17 s, evaluación 0,19 s, historial 0,15 s, alta de vínculo 0,37 s | Cumple |
| Seguridad: autenticación real | QA `test_unauthenticated_real_app_401`: sin token, la `app` real responde 401 en GET y POST | Cumple |
| Validación de entrada / inyección | Pydantic `extra="forbid"`, patrón DIN, longitudes, UUID; QA `test_animal_input_validation` (7 casos → 422), `test_injection_in_path_and_query` (SQLi/XSS en ruta y `q` → 404/422 o lista vacía; los 19 animales siguen intactos); ORM sin SQL textual | Cumple |
| XSS frontend | No hay `dangerouslySetInnerHTML`, `innerHTML` ni `eval` en el módulo; todo se renderiza como texto JSX. Un nombre `<img onerror>` se guarda como dato y se sirve como JSON | Cumple |
| Bandit / secretos | `bandit -r backend/app/features/genealogy`: 0 issues (1105 LOC); grep de credenciales: 0 coincidencias | Cumple |
| Alcance | `conftest.py`, `offline-sync` y los demás módulos no aparecen en `git status`. main.py: +13 líneas (import de modelos/router/seed, `seed_genealogy()`, `include_router`) al final de cada bloque. App.jsx: +16 líneas (import, botón de navegación, render condicionado por rol). No se alteran rutas existentes | Cumple (ver H-09) |

## 3. Hallazgos

### H-01 [ALTA] La cola offline no guarda autor ni finca: cualquier sesión la drena y convierte propuestas del OPERARIO en vínculos VALIDADOS a nombre del VETERINARIO

- **Archivos**: `frontend/src/features/genealogy/genealogyOfflineQueue.js:44-56` (la entrada solo tiene `client_event_id`, `timestamp_utc`, `status` y `payload`) y `:63-101` (`synchronize` envía todas las entradas); `frontend/src/features/genealogy/GenealogyView.jsx:27, 62-64, 92-93, 100-104` (sincroniza con el token de la sesión activa al recibir el evento `online`, al encolar o con "Sincronizar ahora").
- **Escenario de fallo**: en un dispositivo de campo compartido, un OPERARIO registra sin conexión el padre de una cría y cierra sesión. Luego entra un VETERINARIO, abre Genealogía y vuelve la conexión, o él mismo encola un registro. La cola envía el vínculo del OPERARIO con el token del VETERINARIO. El backend (`service.py:243-244, 308-310`) lo crea como `VALIDADO`, con `author_id` y `author_role` del veterinario. Así se salta la validación veterinaria explícita (FR-019, FR-020) y la auditoría queda con un autor falso. Con usuarios de fincas distintas en el mismo equipo, los registros capturados en la finca A se aplican en la sesión de la finca B. Lo reproduje en `queue.qa.test.mjs` (scratchpad): una segunda instancia de la cola envía la entrada ajena sin ningún filtro.
- **Precedente del proyecto**: `frontend/src/features/offline-sync/queueSelection.js:22-26` (`selectDueEvents`) solo envía los eventos del autor que tiene la sesión iniciada.
- **Recomendación** (TDD): al encolar, guardar dentro de `payload` (respetando el esquema estándar de la constitución §2.2) el `authorEmail` o el id de usuario y el `farmId` de la sesión. `synchronize` debe enviar solo las entradas del usuario y la finca actuales; las demás se dejan en la cola y se muestran como "capturadas por otro usuario". Añadir pruebas: cola de usuario A + sesión B → 0 envíos, y lo mismo con finca distinta.

### H-02 [MEDIA] 401/403 (y 408/429) se tratan como rechazo de negocio: los registros salen de la cola y no se reintentan

- **Archivo**: `frontend/src/features/genealogy/genealogyOfflineQueue.js:19-21, 78-89`; el contrato `contracts/frontend.md:24` habla de "4xx de negocio", pero no excluye las respuestas de autenticación.
- **Escenario**: el token del operario se revoca (cambio de contraseña, `token_iat`) o cambian su rol o su finca mientras estaba sin conexión. Al reconectar, todas las capturas reciben 401/403, pasan a "Rechazados" y la UI no ofrece reintentarlas. Hay que volver a capturarlas, lo que incumple SC-005 ("100 % se consolidan una sola vez"). Lo reproduje en la prueba node `FINDING: 401 ... is moved to rejected`.
- **Precedente**: `offline-sync/batchResult.js:110` y `syncController.js:44, 95` (FR-020 de esa HU): con 401/403 la sincronización se pausa sin consumir intentos y se reanuda con un token nuevo.
- **Recomendación**: con 401/403, detener la corrida y dejar las entradas `pending`; tratar 408 y 429 como transitorios; ajustar `contracts/frontend.md`. Opcional: botón "Reintentar" en la lista de rechazados.

### H-03 [MEDIA] Las cachés locales (animales, árboles, evaluaciones) no se separan por usuario ni por finca y no se borran al cerrar sesión

- **Archivos**: `frontend/src/features/genealogy/GenealogyView.jsx:15-24, 53, 86` (`bovinotech_genealogy_animals_cache`); `frontend/src/features/genealogy/genealogyCache.js:2, 13-20` (clave `tree:<DIN>` / `assessment:<sire>|<dam>` sin finca).
- **Escenario**: un usuario de la finca 2, sin conexión en el mismo dispositivo, ve en los selectores la lista de animales de la finca 1, y si consulta un DIN ya cacheado ve el árbol y la evaluación de la finca 1 como "dato en caché". Eso contradice la constitución §4 ("datos de su finca activa") y el caso de borde "Animal de otra finca … la respuesta no revela su existencia". Los datos son genealógicos y de baja sensibilidad, por eso la severidad es MEDIA.
- **Recomendación**: incluir `farmId` (y el usuario) en las claves de caché, y limpiarlas al cambiar de sesión o de finca.

### H-04 [BAJA] Se acepta una "corrección" que deja el mismo progenitor vigente

- **Archivo**: `backend/app/features/genealogy/service.py:316-357`.
- **Escenario**: un POST `/links/{id}/corrections` con el mismo `parentDin` del vínculo vigente devuelve 201 (prueba QA `test_noop_correction_same_parent`). Se genera un evento CORREGIDO que no cambia nada y ensucia el historial append-only, que ya no se puede limpiar.
- **Recomendación**: responder 422 `CORRECTION_SAME_PARENT` y añadir su prueba.

### H-05 [BAJA] Si la cola en `localStorage` está corrupta, la vista completa falla al renderizar

- **Archivos**: `frontend/src/features/genealogy/genealogyOfflineQueue.js:5-13` (lanza error con JSON inválido o con algo que no es un array); `GenealogyView.jsx:43-44` (`pendingCount()` / `listRejected()` en el inicializador de `useState`, sin try/catch).
- **Escenario**: si `bovinotech_offline_genealogy_queue` contiene JSON truncado (por ejemplo, una escritura interrumpida), el módulo lanza el error durante el render y la vista Genealogía no carga. Eso bloquea también la captura (constitución §5.4, degradación elegante).
- **Recomendación**: capturar el error, apartar el contenido corrupto en una clave `_corrupt` y mostrar un aviso.

### H-06 [INFO] T044 pendiente: la UI no se verificó en un navegador

`tasks.md:143` sigue sin marcar. Tampoco pude ejecutar la verificación visual: el servidor MCP de Playwright no conectó en esta sesión. Quedan sin evidencia visual UI-001 y UI-004 (móvil < 768 px, colores por estado, 48 px reales). Debe completarse antes de integrar.

### H-07 [INFO] Rendimiento de las pruebas

La suite del módulo (137 pruebas) tarda 4,77 s, frente a los 3 s del plan, una desviación declarada. La suite completa de backend tarda 58 s, dentro del límite de CI de 90 s (constitución §5.3).

### H-08 [INFO] `backend/bovinotech.db` con esquema viejo

Lo reproduje sobre una **copia** en el scratchpad (el archivo original no se tocó). `pytest` falla al importar `conftest.py` con `no such column: telemetry_rule_versions.immobility_threshold`. El problema viene del módulo de telemetría, no de HU-07. El archivo está en `.gitignore`. Para correr pytest se usó `-c backend/pytest.ini --rootdir backend` desde un directorio limpio.

### H-09 [INFO] Archivos sin seguimiento ajenos a HU-07

En `git status` aparecen `Historias de Usuario.md` (21-nov), `package-lock.json` raíz (19-nov, vacío), `guia_presentacion.md` y `docs/arquitectura-multiagente*` / `docs/img-hd/` (24-nov, antes de la spec). Sus fechas son anteriores a la implementación, así que no son obra del implementador. No deben entrar en el commit de HU-07.

### H-10 [INFO] El contador de pendientes es local al módulo

`GenealogyView.jsx:111-113` muestra los pendientes de genealogía, pero no se suman al badge global de conectividad (constitución §2.1). Es coherente con el aislamiento modular, pero conviene registrarlo como deuda de integración.

### H-11 [INFO] Las pruebas del módulo no recorren la autenticación JWT real

`genealogy_factory.py:46` sobrescribe `get_current_user`. Verifiqué aparte el 401 sin token sobre la `app` real (`test_unauthenticated_real_app_401`). Se recomienda añadir una prueba de contrato con token real.

### Desviaciones declaradas por el implementador (verificadas)

- `BIRTH_DATE_IN_FUTURE` se valida en el servicio (`service.py:173-177`): con fecha 2999-01-01 responde 422. Aceptable.
- `genealogyCache.js`, `resolveDin` y `AnimalRecordForm` están dentro de `features/genealogy/`, así que no rompen el aislamiento. Sobre la caché, ver H-03.
- La sincronización se detiene ante un error de red o un 5xx (`genealogyOfflineQueue.js:90-95`). Esto conserva el orden FIFO (por ejemplo, una ficha y su vínculo); lo verifiqué en la prueba node.
- Suite del módulo de ~4,8 s: ver H-07.
- Además, como defensa en profundidad: la regla de fecha estrictamente anterior hace imposible un ciclo aunque dos altas concurrentes pasen la verificación anti-ciclos a la vez. Los datos semilla son coherentes en fechas y sexos.

## 4. Resultados de pruebas y build

| Ejecución | Resultado |
|---|---|
| Backend, suite completa (`pytest -c backend/pytest.ini --rootdir backend backend/tests`, desde el scratchpad) | **421 passed**, 1 warning (deprecación de starlette), 58,05 s |
| Backend, solo genealogía (`-k genealogy`) | 137 passed, 4,77 s |
| Pruebas sintéticas QA backend (scratchpad, no versionadas) | 33 + 2 passed |
| Frontend, genealogía (`node --test 'frontend/src/features/genealogy/*.test.js'`, Node v22.23.5) | 19 passed |
| Frontend, todas las `*.test.js` | **199 passed**, 0 failed |
| Pruebas sintéticas QA frontend (node, scratchpad) | 4 passed (2 de ellas documentan H-01 y H-02) |
| `npm run lint` | OK, 0 problemas |
| `npm run build` | OK (110 módulos, JS 392,69 kB / gzip 115,19 kB) |
| `bandit -r backend/app/features/genealogy` | 0 issues |

## 5. Veredicto

**RECHAZADO.** El hallazgo H-01 (ALTA) permite que la sincronización offline salte la validación veterinaria y atribuya registros a un autor incorrecto. Debe volver al Agente Implementador para corregirse con TDD; H-02 y H-03 (MEDIA) se recomienda resolverlos en la misma iteración. Una vez corregido, QA volverá a verificar. El backend no tiene hallazgos bloqueantes.
