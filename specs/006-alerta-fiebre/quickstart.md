# Guía de Inicio Rápido: Detección de Fiebre Bovina y Alertas (HU-06)

Esta guía documenta la ejecución de pruebas y el funcionamiento del módulo de detección telemétrica de fiebre bovina.

## 1. Verificación del Backend

### Ejecutar Pruebas Automatizadas TDD
```bash
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_alerta_fiebre.py -v
```

Cubre:
1. Generación de alerta crítica con `temperature > 39.5 °C` vinculada al `sinigan_code`.
2. Supresión de alertas para lecturas normales o en el límite exacto (39.5 °C).
3. Cumplimiento del **SLO de Latencia (< 10 segundos)** en el procesamiento de telemetría.
4. Idempotencia en la ingesta mediante `client_event_id`.
5. Registro de atención médica bajo el principio **Append-Only** (sin mutación destructiva).
6. Control de acceso (RBAC): denegación de atención para rol `OPERARIO` (403).

### Simulación de Telemetría Febril con cURL o HTTP
```bash
curl -X POST http://127.0.0.1:8000/api/v1/alerta-fiebre/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "client_event_id": "fe1024-test-uuid",
    "collar_id": "COL-09",
    "sinigan_code": "CO-BOV-9988",
    "body_temperature": 40.1,
    "measured_at": "2026-11-19T20:00:00Z"
  }'
```

## 2. Verificación del Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Funcionalidad en la Interfaz Web
1. **Simulador de Collar IoT**: Permite ingresar un código SINIGÁN, collar y temperatura. Si la temperatura es > 39.5 °C, el botón se ilumina en rojo y genera la alerta inmediata.
2. **Soporte Offline**: El botón "Simular Captura Offline" guarda lecturas en la cola local de `localStorage` y permite sincronizarlas en lote con idempotencia garantizada.
3. **Panel de Alertas Sanitarias**: Visible para usuarios con rol `VETERINARIO`. Permite revisar el historial append-only y registrar atenciones clínicas con notas diagnósticas y tratamiento.
