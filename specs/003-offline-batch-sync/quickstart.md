# Quickstart de validación: HU-03 `offline_sync`

Guía para comprobar de extremo a extremo que la sincronización cumple la spec. Contratos: [contracts/offline-sync-api.md](contracts/offline-sync-api.md). Estados: [data-model.md](data-model.md).

## Requisitos previos

- HU-01 y HU-02 fusionadas en la rama (R1): deben existir `backend/app/features/offline_capture/` y `frontend/src/features/offline-capture/`.
- Python 3.11 con `backend/requirements.txt` instalado; Node 20.
- Usuario semilla `OPERARIO` de la HU-01 con al menos una finca asignada.
- **Base local creada antes de la corrección QA-01**: ya no hace falta borrarla. La tabla `offline_sync_events` ganó la columna `requires_data_review` y `create_all` no añade columnas a una tabla existente, pero al arrancar el backend `ensure_offline_sync_schema` (`backend/app/features/offline_sync/schema_migration.py`, invocada desde `main.py`) la añade en sitio con `ALTER TABLE ... ADD COLUMN requires_data_review BOOLEAN NOT NULL DEFAULT 0` (QA-13). Es una migración de esquema: las filas existentes toman el valor por defecto y no se modifican. Para comprobarlo:

  ```bash
  sqlite3 backend/bovinotech.db "PRAGMA table_info(offline_sync_events);" | grep requires_data_review
  ```

## 1. Pruebas automatizadas

```bash
# Backend (desde backend/)
pytest tests/unit -k offline_sync
pytest tests/contract -k offline_sync
pytest tests/security -k offline_sync
pytest                      # suite completa: sin regresiones y en menos de 90 s
bandit -r app -ll           # sin hallazgos nuevos

# Frontend (desde frontend/)
node --test 'src/features/offline-sync/*.test.js' 'src/features/offline-capture/*.test.js'
npm run lint
npm run build
```

Resultados esperados:

| Prueba | Demuestra |
|---|---|
| Contrato `AC1_batch_mixed_states` | Criterio 1: resultados `SINCRONIZADO`, `DUPLICADO` y `FALLIDO` en un mismo lote |
| Simulación de corte de 24 h con 200 eventos (frontend, transporte en memoria contra el servicio simulado) | Criterio 2 / SC-001: 200 confirmados, 0 perdidos, 0 duplicados |
| Contrato `AC3_resend_after_lost_response` + reenvío 100 veces | Criterio 3 / SC-002: siempre `DUPLICADO`, un único registro |
| Contrato `AC4_two_of_ten_transient` | Criterio 4 / SC-003: 8 confirmados, solo 2 en cola |
| `computeRetryDelay` + simulación de 100 dispositivos | SC-007: esperas crecientes hasta 15 min; ningún segundo con más del 10 % de los reintentos |
| Prueba de rendimiento con 1.000 eventos (servicio, base en memoria) | Base de SC-005: 20 lotes procesados con holgura |

## 2. Validación manual en navegador

1. Arrancar el backend (`uvicorn app.main:app --reload` desde `backend/`) y el frontend (`npm run dev`).
2. Iniciar sesión como `OPERARIO`.
3. **Sin conexión**: en DevTools → Network, activar **Offline**. Capturar 10 eventos (HU-02).
   - El badge muestra 🔴 **Offline (Modo Campo)** y **10 pendientes**.
   - No se hace ninguna petición a `/offline-sync/batches`.
4. **Reconexión**: desactivar Offline.
   - En menos de 30 s comienza un envío y el badge muestra "Enviando" (SC-004).
   - El contador baja a 0 y cada evento aparece como "Sincronizado" en la bandeja.
5. **Corte a mitad de respuesta**: capturar 5 eventos más, poner *throttling* "Slow 3G", pulsar "Sincronizar ahora" y activar Offline en cuanto la petición salga.
   - Los eventos vuelven a "Pendiente".
   - Al reconectar terminan como "Sincronizado" o "Duplicado (ya estaba en el servidor)".
   - En el servidor hay exactamente un registro por evento (paso 7).
6. **Cierre durante el envío**: repetir el paso 5 cerrando la pestaña en lugar de desconectar. Al reabrir, nada queda en "Enviando" y todo termina confirmado.
7. **Comprobar el servidor**:

   ```bash
   sqlite3 backend/bovinotech.db \
     "SELECT client_event_id, COUNT(*) FROM offline_sync_events GROUP BY 1 HAVING COUNT(*) > 1;"
   # Esperado: sin filas (cero duplicados)

   sqlite3 backend/bovinotech.db \
     "SELECT items_total, synced_count, duplicate_count, failed_retryable_count, failed_final_count
        FROM offline_sync_batch_log ORDER BY id DESC LIMIT 5;"
   ```

8. **Servidor inalcanzable**: detener el backend con eventos pendientes y pulsar "Sincronizar ahora".
   - Los eventos siguen "Pendiente": perder la conexión no cuenta como intento ni programa espera (R9, FR-026, QA-07).
   - Al relanzar el backend se confirman solos, sin pulsar nada.
   - El estado "Fallido" transitorio con motivo y hora del próximo intento (FR-028) aparece ante 429/5xx o `STORAGE_BUSY`; lo cubren las pruebas automatizadas (`batchResult.test.js`, `syncEngine.test.js` AC4).
9. **Sesión vencida**: borrar el token del almacenamiento y reconectar con eventos pendientes.
   - El envío se pausa y los eventos siguen "Pendiente", no "Fallido".
   - Tras iniciar sesión se envían solos (FR-020).
9b. **Cambio de usuario durante el envío** (QA-02): con más de 50 eventos pendientes del `OPERARIO` y *throttling* "Slow 3G", pulsar "Sincronizar ahora", cerrar sesión e iniciarla como `VETERINARIO` mientras sale el primer lote.
   - En DevTools ninguna petición con eventos del operario lleva el token del veterinario.
   - Los eventos del operario no enviados siguen "Pendiente" (ninguno "Fallido") y se envían cuando el operario vuelve a iniciar sesión.
10. **Captura sin bloqueo**: con 1.000 eventos generados por `devSeed` (HU-02) y la sincronización en curso, guardar un evento nuevo tarda menos de 2 s (SC-008).
11. **Móvil**: con la vista a 375 px, el botón "Sincronizar ahora" y el acceso al detalle de fallidos miden al menos 48×48 px y los estados se leen como texto, no solo por color.

## 3. Criterio de aceptación de la validación

- Todas las pruebas automatizadas en verde y `npm run build` sin errores.
- Pasos manuales 3 a 9 conformes.
- Consulta de duplicados del paso 7 sin filas.
