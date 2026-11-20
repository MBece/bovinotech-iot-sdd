# Tareas: Detección Automática de Fiebre Bovina y Alertas Sanitarias (HU-06)

**Entrada**: Documentos de diseño en `specs/006-alerta-fiebre/` (`spec.md` y `plan.md`)

**Prerrequisitos**: `plan.md`, `spec.md`, entorno de backend y frontend activos

---

## Fase 1: Pruebas Automatizadas TDD (Prerrequisito Obligatorio) ⚠️

> **NOTA CRÍTICA**: Estas pruebas deben crearse PRIMERO en `backend/tests/test_alerta_fiebre.py` y deben FALLAR (fase roja) antes de implementar el código de negocio.

- [x] T001 [TDD] Crear suite de pruebas `backend/tests/test_alerta_fiebre.py` con caso para temperatura febril (`> 39.5 °C`), verificando la generación automática de la alerta crítica con `sinigan_code`.
- [x] T002 [TDD] Implementar prueba de caso de borde para temperatura normal (`<= 39.5 °C`, ej. 38.5 °C y exactamente 39.5 °C) verificando que NO se genera alerta.
- [x] T003 [TDD] Implementar prueba de verificación del **SLO de Latencia (< 10 segundos)**: medir el tiempo de respuesta del endpoint de ingesta telemétrica y generación de alerta, asegurando `elapsed < 10.0` segundos.
- [x] T004 [TDD] Implementar prueba de idempotencia en `test_alerta_fiebre.py`: reenvío del mismo `client_event_id` no debe duplicar alertas sanitarias.
- [x] T005 [TDD] Implementar prueba de verificación **Append-Only**: verificar que al atender una alerta, se crea un registro en `fever_alert_attentions` y el registro original en `fever_alerts` permanece intacto sin mutación destructiva.
- [x] T006 [TDD] Implementar prueba de control de acceso (RBAC): verificar que un usuario con rol `OPERARIO` recibe `403 Forbidden` al intentar invocar el endpoint de atención veterinaria.

---

## Fase 2: Configuración y Modelado Aislado (Backend)

- [x] T007 [P] Crear estructura de directorios en `backend/app/features/alerta_fiebre/`.
- [x] T008 [P] Implementar modelos SQLAlchemy en `backend/app/features/alerta_fiebre/models.py` (`FeverAlert` y `FeverAlertAttention`), indexando `sinigan_code` como `String` sin llaves foráneas bloqueantes.
- [x] T009 [P] Implementar esquemas Pydantic v2 en `backend/app/features/alerta_fiebre/schemas.py` (`TelemetryIngestRequest`, `TelemetryIngestResponse`, `FeverAlertResponse`, `AttendAlertRequest`, `FeverAlertAttentionResponse`).

---

## Fase 3: Lógica de Detección y Endpoints REST (Backend)

- [x] T010 Implementar servicio de evaluación telemétrica en `backend/app/features/alerta_fiebre/router.py`:
  - Regla de negocio de umbral: `temperature > 39.5`.
  - Generación de alerta con severidad `CRITICAL` y tipo `FIEBRE_BOVINA`.
  - Manejo de idempotencia vía `client_event_id`.
- [x] T011 Implementar endpoints en `backend/app/features/alerta_fiebre/router.py`:
  - `POST /api/v1/alerta-fiebre/telemetry` (ingesta y evaluación con medición de latencia).
  - `GET /api/v1/alerta-fiebre/alerts` (listado para panel veterinario).
  - `GET /api/v1/alerta-fiebre/alerts/{alert_id}` (detalle y eventos de atención enlazados).
  - `POST /api/v1/alerta-fiebre/alerts/{alert_id}/attend` (registro append-only con validación de rol `VETERINARIO`).
- [x] T012 Registrar el router en `backend/app/main.py` e inicializar las tablas del módulo.
- [x] T013 **Verificación TDD**: Ejecutar `pytest backend/tests/test_alerta_fiebre.py` y asegurar que todas las pruebas pasen al 100% en verde.

---

## Fase 4: Implementación de Interfaz de Usuario (Frontend)

- [x] T014 [P] Crear servicio cliente en `frontend/src/features/alerta_fiebre/services/alertaFiebreService.js` para consumo de los endpoints REST de telemetría y alertas.
- [x] T015 [P] Implementar servicio de cola fuera de línea en `frontend/src/features/alerta_fiebre/services/offlineQueueService.js` con almacenamiento local (`localStorage`) y reintento de sincronización por `client_event_id`.
- [x] T016 Crear componente `frontend/src/features/alerta_fiebre/components/FeverAlertCard.jsx` con semaforización en rojo para fiebre (`> 39.5 °C`) y detalles del código SINIGÁN.
- [x] T017 Crear componente modal `frontend/src/features/alerta_fiebre/components/AttendAlertModal.jsx` para ingreso de notas clínicas y tratamiento veterinario.
- [x] T018 Crear vista principal `frontend/src/features/alerta_fiebre/FeverAlertsDashboard.jsx` integrando listado de alertas, modal de atención y monitor de cola offline.
- [x] T019 Integrar la vista en `frontend/src/App.jsx` condicionada al rol de `VETERINARIO` para atención médica.

---

## Fase 5: Calidad, DevSecOps y Verificación Final

- [x] T020 Ejecutar suite completa de backend (`pytest`) asegurando cero regresiones en módulos existentes.
- [x] T021 Ejecutar análisis estático de seguridad (`bandit -r app -ll`) asegurando cero vulnerabilidades.
- [x] T022 Ejecutar verificación de frontend (`npm run lint` y `npm run build`) validando compilación limpia.
- [x] T023 Generar guía de pruebas en `specs/006-alerta-fiebre/quickstart.md` con ejemplos de payload para simulación de collar IoT febril.
