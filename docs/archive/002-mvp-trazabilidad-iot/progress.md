# Progreso del MVP

**Fecha de corte**: 2026-11-18

## Estimación funcional

- Línea base revisada: **27%**.
- Primer incremento de trazabilidad: **+10 puntos porcentuales**.
- Segundo incremento de historial auditable: **+13 puntos porcentuales**.
- Estado funcional estimado: **50%**.

El porcentaje es una estimación de valor demostrable, no el cociente directo de tareas. Las tareas tienen pesos distintos y una historia solo se considera completa cuando cumple su checkpoint y aprobación humana.

## Flujo entregado para prueba UX

1. Inicio de sesión con OPERARIO o VETERINARIO.
2. Consulta autenticada de un animal por DIN mediante la integración académica.
3. Identificación visible del entorno mediante la insignia `SIMULACIÓN`.
4. Captura local de vacunación, tratamiento o chequeo mediante IndexedDB.
5. Persistencia local al cerrar y reabrir la aplicación.
6. Cola de eventos pendientes en el navegador.
7. Sincronización autenticada mediante `POST /sync/batches`.
8. Idempotencia por `client_event_id`: un reenvío no duplica el evento.
9. Rechazo controlado de DIN inválido o inexistente.
10. Conservación del registro local después de sincronizar.
11. Consulta del historial sanitario completo por DIN.
12. Corrección exclusiva para el rol VETERINARIO.
13. Creación de una versión nueva sin modificar el registro original.
14. Motivo obligatorio y autor de cada corrección.
15. Rechazo de correcciones sobre una versión desactualizada.

## Evidencia automática

- Backend: **20 pruebas aprobadas**.
- Frontend: `npm run lint` aprobado.
- Frontend: `npm run build` aprobado.
- Flujo verificado: login -> consulta DIN -> guardado sin conexión -> sincronización -> historial -> corrección veterinaria.

## Límites conocidos de este corte

- HU-02 y HU-03 están parcialmente implementadas: faltan simulador formal de cortes, reintentos parciales y prueba E2E automatizada.
- HU-04 ya dispone de historial y correcciones versionadas; faltan paginación y prueba de concurrencia específica.
- El simulador SINIGAN solo expone estado y consulta de animal por DIN; establecimientos, inventario, eventos y custodia pertenecen al siguiente corte.
- Los cuatro roles y el aprovisionamiento administrativo de HU-01 siguen pendientes.

## Próximo incremento recomendado

Completar HU-01 endurecida y ampliar HU-05: usuario activo/finca, roles ADMIN/DIRECTIVO, establecimientos, inventario, eventos externos y custodia DIN.
