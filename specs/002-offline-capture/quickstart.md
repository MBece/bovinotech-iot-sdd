# Guía de Validación: Captura offline de eventos sanitarios (HU-02)

Cómo comprobar de punta a punta que la HU-02 funciona. Contratos en [contracts/captured-event.md](contracts/captured-event.md); datos en [data-model.md](data-model.md).

## 1. Requisitos previos

- La HU-01 fusionada en `main` y esta rama rebasada sobre ella (research R1).
- Backend con `backend/requirements.txt` instalado; frontend con `npm install`.
- Usuarios del seed de la HU-01: `operario@bovinotech.co`, `vet@bovinotech.co`, `directivo@bovinotech.co`.

## 2. Pruebas automatizadas

```bash
cd backend && python -m pytest tests -q          # incluye las de offline_capture
cd frontend && node --test 'src/features/offline-capture/*.test.js' && npm run lint && npm run build
```

| Archivo | Cubre |
|---|---|
| `backend/tests/contract/test_offline_capture_catalog_api.py` | `GET /offline-capture/catalog`: finca activa, roles, 401/403 |
| `backend/tests/unit/test_offline_capture_contract.py` | Esquema `CapturedEvent` contra `captured-event.cases.json` |
| `frontend/src/features/offline-capture/*.test.js` (`node --test`) | Validador contra los mismos casos, búsqueda (5.000 animales), armado del evento, copia de eventos preliminares, repositorio con almacenamiento en memoria |

## 3. Validación manual

Backend (`uvicorn app.main:app --reload`) y frontend (`npm run dev`) en marcha. Abrir DevTools.

1. **Descarga del catálogo**: entrar como `operario@`. Resultado esperado: el panel de captura indica la cantidad de animales disponibles sin conexión.
2. **Guardar sin conexión (US1-1, SC-001)**: DevTools → Network → "Offline". Registrar una vacunación con producto, dosis y unidad. Resultado esperado: confirmación en menos de 2 s; aparece en la bandeja con "Pendiente de sincronización".
3. **Rechazos (US1-2, US1-7)**: escribir `DIN-DEMO-999999` → "El animal no existe en el catálogo de esta finca." Vacunación sin producto → "Indique el producto aplicado." Dosis 0 → "La dosis debe ser mayor que cero."
4. **Fecha futura (US1-3)**: solo con pruebas automatizadas; la interfaz no permite editar la hora (FR-006).
5. **Persistencia (US2-1, SC-002)**: con la red aún desactivada, cerrar la pestaña y volver a abrirla. Resultado esperado: los eventos siguen en la bandeja con su hora original. Repetir hasta completar 20 ciclos de cierre y reapertura, incluido un reinicio del navegador (SC-002).
6. **Inmutabilidad (US2-4)**: en la bandeja y en el detalle no hay botones de editar ni de borrar.
7. **Detalle (US3-1, US3-2)**: abrir un evento. Resultado esperado: dos indicaciones de texto separadas: "Pendiente de sincronización" y "Pendiente de validación veterinaria".
8. **Roles (US1-6)**: entrar como `directivo@`. Resultado esperado: no aparece la captura.
9. **Sesión vencida (US3-3)**: adelantar el reloj del sistema más de 7 días y capturar sin conexión. Resultado esperado: se guarda y el detalle indica "Pendiente de verificación de autor".
10. **Eventos preliminares (FR-019)**: con la captura preliminar, guardar un evento sin conexión; abrir luego la nueva captura. Resultado esperado: el evento aparece en la nueva bandeja con su hora original, marcado como capturado con la versión anterior.
11. **Volumen (SC-001, SC-007)**: en la consola, ejecutar el generador de datos de prueba que el módulo expone solo en modo desarrollo (5.000 animales y 1.000 eventos). Resultado esperado: medido con el panel Performance de DevTools, guardar sigue tardando menos de 2 s (SC-001) y la bandeja abre en menos de 3 s (SC-007).

## 4. Limitaciones conocidas

- Hasta que se apruebe la solicitud de coordinación, la captura preliminar sigue visible junto a la nueva (plan, Seguimiento de Complejidad).
- El envío al servidor es de la HU-03; `/sync` aún no acepta `DEWORMING`, `product`, `doseUnit`, `reason` ni `finding`.
- Las pruebas del frontend no corren en CI hasta que se añadan el script `test` y su paso al workflow (coordinación).
