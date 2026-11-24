# Tareas: Historial sanitario y correcciones por anexión

**Entrada**: [spec.md](spec.md), [plan.md](plan.md)<br>
**Módulo**: `sanitary_events`<br>
**Cadena SDD/TDD**: `spec -> plan -> tasks -> pruebas (pytest) -> implementación`

## Convenciones de ejecución

- TDD obligatorio: cada prueba se escribe y se observa fallar antes de la implementación que cubre.
- Backend aislado en `backend/app/features/sanitary_events/`; frontend nuevo en `frontend/src/features/sanitary_events/`.
- No se modifica la spec ni otras carpetas. Los únicos puntos compartidos posibles son `backend/app/main.py` y `frontend/src/App.jsx`, al final del bloque.
- No borrar, actualizar ni reemplazar registros sanitarios originales. Toda corrección agrega un evento con `corrected_event_id`, motivo y autor veterinario.
- Para tareas con etiqueta `[P]`, la dependencia indicada debe estar completada antes de iniciar; entre sí pueden ejecutarse en paralelo.

## Fase 1 — Pruebas de contrato y dominio (primero, sin implementación)

- [ ] T001 [P] Añadir `backend/tests/unit/test_sanitary_events_schemas.py`: validar esquemas Pydantic v2, DIN normalizado, UUID `client_event_id`, campos permitidos, fechas y rechazo de motivo vacío/blanco.
- [ ] T002 [P] Añadir `backend/tests/unit/test_sanitary_events_append_only.py`: corrección produce una nueva anotación enlazada por `corrected_event_id`; verifica que el original conserva exactamente sus valores y que duplicar UUID no crea otro evento.
- [ ] T003 [P] Añadir `backend/tests/contract/test_sanitary_events_history_api.py`: GET nuevo por DIN, autorización/alcance de finca, orden cronológico estable, resultado vacío y campos de auditoría/tiempo de retiro.
- [ ] T004 [P] Añadir `backend/tests/contract/test_sanitary_events_correction_api.py`: POST nuevo con 201, motivo requerido, objetivo inexistente, vínculo y resultado idempotente para reintento equivalente; contenido divergente con mismo UUID es rechazado.
- [ ] T005 [P] Añadir `backend/tests/security/test_sanitary_events_access.py`: solo VETERINARIO corrige; OPERARIO y roles restantes reciben 403; usuario sin autorización a la finca no consulta ni corrige eventos fuera de ámbito.
- [ ] T006 Ejecutar las pruebas T001–T005 y registrar que fallan por los contratos/rutas nuevos o por la semántica requerida, antes de implementar. **Depende de** T001, T002, T003, T004 y T005.

## Fase 2 — Contratos y modelo inmutable

- [ ] T007 Definir en `backend/app/features/sanitary_events/schemas.py` los contratos Pydantic v2 para respuesta de historial, evento y corrección; exigir `reason` no blanco y `client_event_id: UUID`; documentar aliases de API según convención existente. **Depende de** T006.
- [ ] T008 Diseñar/ampliar `backend/app/features/sanitary_events/models.py` para que la corrección sea evento sanitario nuevo con `corrected_event_id`, motivo, autor y marcas de tiempo; mantener unicidad de `client_event_id` y DIN como valor sin FK a otros módulos. **Depende de** T006.
- [ ] T009 Crear fixture/seed mínimo propio del módulo para DIN y eventos de prueba, sin depender de SINIGÁN ni de FKs de otras HUs; usarlo en las pruebas unitarias/contrato requeridas. **Depende de** T008.
- [ ] T010 Implementar lógica insert-only y consulta en `backend/app/features/sanitary_events/service.py`: ordenar por fecha de captura/ID, comprobar alcance de finca, rechazar ausencia de motivo/objetivo, aplicar idempotencia y dejar intacto el original ante todo error. **Depende de** T007, T008 y T009.
- [ ] T011 Ejecutar `pytest` para T001–T005; ajustar la implementación hasta que pasen, incluyendo comprobación explícita de inmutabilidad original. **Depende de** T010.

## Fase 3 — API de historial y corrección

- [ ] T012 Implementar en `backend/app/features/sanitary_events/router.py` `GET /animals/{din}` bajo prefijo `/sanitary-events`, con dependencia de usuario autenticado, contrato tipado y delegación al servicio. **Depende de** T011.
- [ ] T013 Implementar `POST /{event_id}/correct` bajo el mismo prefijo, restringido a `require_veterinario`, validación de finca activa, respuesta 201 y reintento idempotente; no exponer ninguna ruta de actualización/eliminación. **Depende de** T011.
- [ ] T014 Volver a ejecutar las pruebas unitarias, de contrato y seguridad del módulo; verificar que todas pasan y que no hay UPDATE/DELETE destructivo en la ruta de corrección. **Depende de** T012 y T013.
- [ ] T015 Ejecutar pruebas backend existentes de sincronización/eventos y comprobar compatibilidad de inicialización/modelos. Identificar y documentar, sin migración destructiva, la compatibilidad pendiente de `GET /by-din/{din}/history`, `POST /{event_id}/corrections` y `SanitaryEventCorrection`. **Depende de** T014.

## Fase 4 — Línea de tiempo y experiencia por rol

- [ ] T016 Crear `frontend/src/features/sanitary_events/services/sanitaryEventsService.js` para los endpoints nuevos, token de autorización, validación de respuestas y errores legibles; mantener idempotencia al reintentar el mismo payload. **Depende de** T014.
- [ ] T017 Crear `frontend/src/features/sanitary_events/SanitaryTimeline.jsx`: eventos en orden ascendente, autor/fechas/estado/motivo, estado vacío y aviso de datos posiblemente desactualizados si se presenta caché offline. **Depende de** T016.
- [ ] T018 Crear `frontend/src/features/sanitary_events/SanitaryCorrectionForm.jsx`: visible solo para VETERINARIO, motivo obligatorio, creación de evento nuevo y refresco de timeline sin eliminar/ocultar el original. **Depende de** T017.
- [ ] T019 Exponer `navItem` (`id`, `label`, `icon`, `requiredRole`) y exportaciones del módulo desde `frontend/src/features/sanitary_events/index.js`; respetar consulta de OPERARIO y restricción de corrección veterinaria. **Depende de** T017.
- [ ] T020 Aplicar presentación mobile-first (<768 px), acciones táctiles ≥48×48 px, contraste AA, indicador de conexión/frescura y señal visual destacada para tiempo de retiro vigente. **Depende de** T017 y T018.
- [ ] T021 Añadir pruebas frontend del servicio y timeline (incluidas autorización de UI, motivo requerido, estado vacío, aviso de retiro y error offline) dentro de las rutas compatibles con la configuración existente. **Depende de** T016, T017, T018 y T020.
- [ ] T022 Resolver con responsable de navegación la integración del `navItem`: el código inspeccionado no contiene Sidebar/App Shell. Si se confirma el punto de integración, modificar únicamente `frontend/src/App.jsx` y solo al final del bloque, registrar la vista y aplicar RBAC; si no se confirma, dejar la integración como bloqueo documentado sin crear Sidebar paralelo ni tocar otros módulos. **Depende de** T019 y T021.

## Fase 5 — Integración final y validación

- [ ] T023 Verificar si el router/modelos actuales ya están montados por `backend/app/main.py`; solo si falta algo indispensable, agregar import/registro al final del bloque existente, sin reorganizar otras rutas. **Depende de** T014 y de la decisión sobre compatibilidad documentada en T015.
- [ ] T024 Ejecutar `pytest` completo del backend, incluyendo pruebas nuevas y regresiones de SINIGÁN/sincronización; verificar que todas pasan. **Depende de** T015 y T023.
- [ ] T025 Ejecutar pruebas de frontend disponibles y `npm run build`; corregir fallos dentro de los archivos del módulo o integración permitida. **Depende de** T021 y T022.
- [ ] T026 Ejecutar `npm run lint` y resolver cualquier error atribuible a la rebanada o integración permitida. **Depende de** T025.
- [ ] T027 Revisión final de compuertas: confirmar append-only (`corrected_event_id`, motivo, sin UPDATE/DELETE del original), rol VETERINARIO, finca activa, DIN/SINIGÁN sin sobreescritura, UUID idempotente, consulta offline con aviso de frescura, retiro visible, targets ≥48 px y consistencia con SLO <10 s/99,9 %. No marcar listo si una compuerta falla. **Depende de** T024 y T026.

## Dependencias explícitas

```text
T001,T002,T003,T004,T005 -> T006 -> T007,T008 -> T009 -> T010 -> T011
T007,T008,T009,T010,T011 -> T012,T013 -> T014 -> T015
T014 -> T016 -> T017 -> T018 -> T020 -> T021 -> T022
T017 -> T019 -> T022
T014,T015 -> T023 -> T024
T021,T022 -> T025 -> T026
T024,T026 -> T027
```

T001–T005 son independientes y paralelizables. T012 y T013 pueden implementarse en paralelo después de T011. Ninguna integración compartida precede a la finalización de las pruebas de la rebanada.
