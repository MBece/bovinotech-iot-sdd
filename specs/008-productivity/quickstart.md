# Validación rápida: Productividad por lote

Guía de comprobación tras implementar HU-08. Los datos se generan con los fixtures propios del módulo; no se usan animales ni lotes productivos reales.

## Requisitos

- Acceso a la raíz del repositorio en Windows.
- Entorno Python del backend en `backend\.venv`.
- Dependencias frontend instaladas desde `frontend\`.
- Usuario de prueba con finca activa y rol definido por el escenario.

## Pruebas automatizadas

Desde la raíz:

```powershell
$env:PYTHONPATH='backend'
.\backend\.venv\Scripts\python.exe -m pytest backend\tests\test_productivity.py
```

Desde `frontend\`:

```powershell
npm run lint
npm run build
```

Resultado esperado: las pruebas de fórmulas, umbral, estados de suficiencia, append-only, idempotencia y permisos pasan; lint y build terminan sin errores.

## Verificación de API

Con el servidor local iniciado y sesión de prueba autenticada:

1. Enviar `POST /pesajes` para `DIN-DEMO-0001`, primero `400 kg` y luego `420 kg` con diferencia de 23 horas. El segundo registro debe devolver `isAtypical: true`, conservar ambos eventos y quedar fuera de los indicadores hasta revisión.
2. Enviar `POST /consumos` para el mismo lote con periodo válido y cantidad en kg.
3. Consultar `GET /lotes/LOTE-01/gdp?fecha_inicio=...&fecha_fin=...`. Con todos los datos aprobados, comprobar GDP con la fórmula `(peso final - peso inicial) / días` y eficiencia con `consumo total / kg ganados`.
4. Anexar `POST /pesajes/{pesaje_id}/revision` con rol VETERINARIO y decisión `APPROVED`. Confirmar que el evento original no cambia y la proyección posterior considera la decisión.
5. Corregir un pesaje o consumo desde su historial. Confirmar que la nueva versión incluye `correctedEventId` y motivo, y que el original permanece visible sin cambios.
6. Repetir la consulta sin la muestra final o sin consumo. El indicador afectado debe ser `null`, su estado `DATOS_INSUFICIENTES` y la lista de faltantes debe explicar la causa.
7. Probar límites: exactamente 15 kg en 23 horas y más de 15 kg exactamente a 24 horas no activan la regla estricta.
8. Repetir el envío con el mismo `clientEventId`. Debe reportarse como duplicado idempotente y no añadir otro evento.
9. Intentar revisar con rol OPERARIO o consultar un lote de otra finca. Debe rechazarse sin revelar datos fuera del ámbito autorizado.

## Verificación de interfaz offline

1. Iniciar la PWA y abrir Productividad desde el menú lateral.
2. Desconectar la red desde las herramientas del navegador/dispositivo.
3. Registrar un pesaje y un consumo: deben quedar visibles como pendientes en la cola local y el contador de sincronización debe incrementarse.
4. Reconectar y verificar que cada `clientEventId` se confirma una sola vez.
5. Reducir la ventana por debajo de 768 px: controles táctiles >= 48x48 px, alto contraste y formularios utilizables sin desplazamiento horizontal.

Los contratos completos y los campos canónicos están en [contracts/api.md](contracts/api.md) y [data-model.md](data-model.md).

## Resultados de validación HU-08

- TDD rojo confirmado antes de implementar: la prueba focalizada falló por ausencia inicial de `app.features.productivity`.
- Backend focalizado: `10 passed` con `pytest --noconftest backend/tests/test_productivity.py -q`.
- Frontend focalizado: `5 passed` con `node --test src/features/productivity/productivityOfflineQueue.test.js src/features/productivity/productivitySummary.test.js`.
- `npm run lint` y `npm run build`: correctos.
- La suite general `pytest backend/tests -q` no llega a recolectar HU-08: el `SyntaxError` preexistente en `backend/app/features/sanitary_events/service.py:84` es importado desde `app.main`. No se modificó el archivo ajeno.
- Bandit no está instalado en el entorno virtual backend; el análisis SAST queda pendiente.
