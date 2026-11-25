# Especificación de Funcionalidad: MVP Integral de Trazabilidad Ganadera e IoT

**Rama de Funcionalidad**: `002-mvp-trazabilidad-iot`

**Fecha**: 2026-11-18

**Estado**: Draft para aprobación del Product Owner

**Entrada**: Historias de usuario del MVP v2.0, constitución del proyecto y contrato académico de integración simulada con SINIGAN 6.

## Objetivo y alcance

Completar el MVP de BovinoTech IoT con trazabilidad sanitaria offline-first, historial auditable solo-anexión, consulta simulada de referencias SINIGAN, alertas de telemetría, genealogía, indicadores productivos y observabilidad. La plataforma complementa a SINIGAN; no lo reemplaza ni afirma reproducir una API oficial del ICA.

Esta especificación cubre las HU-02 a HU-10. La HU-01 de identidad y RBAC permanece en `specs/001-auth-rbac/` y se endurece para soportar los roles y controles transversales del MVP.

## Escenarios de Usuario y Pruebas

### Historia de Usuario 2 - Captura offline de evento sanitario (Prioridad: P1)

Como operario quiero registrar vacunaciones, tratamientos o chequeos sin conexión para no perder información sanitaria en campo.

**Por qué esta prioridad**: Es el flujo principal de captura y habilita la sincronización, auditoría y validación veterinaria.

**Prueba independiente**: Con la red deshabilitada, registrar un evento, cerrar y reabrir la aplicación, y comprobar que el evento sigue visible como pendiente y conserva su identificador, autor y hora de campo.

**Escenarios de aceptación**:

1. **Dado** un operario autenticado y sin red, **cuando** guarda un evento válido, **entonces** queda almacenado localmente en menos de 2 segundos con estado `PENDING_SYNC`.
2. **Dado** un evento local pendiente, **cuando** la aplicación se cierra y vuelve a abrirse sin red, **entonces** el evento permanece intacto.
3. **Dado** un animal inexistente o una dosis fuera del rango configurado, **cuando** se intenta guardar, **entonces** se rechaza localmente con un mensaje verificable.
4. **Dado** cualquier evento capturado, **cuando** se consulta, **entonces** muestra autor, fecha de campo, dispositivo, `clientEventId` y estado de validación.

---

### Historia de Usuario 3 - Sincronización idempotente por lotes (Prioridad: P1)

Como sistema quiero sincronizar los eventos pendientes por lotes, con reintentos y sin duplicados, para conservar la integridad ante cortes prolongados.

**Por qué esta prioridad**: Mitiga la pérdida y duplicación de datos, principal riesgo del entorno rural intermitente.

**Prueba independiente**: Simular 24 horas sin conexión, crear eventos, restablecer la red, reenviar el mismo lote y verificar que cada `clientEventId` existe una sola vez.

**Escenarios de aceptación**:

1. **Dado** un lote pendiente, **cuando** vuelve la conectividad, **entonces** los eventos válidos se confirman sin pérdida ni duplicación.
2. **Dado** un lote ya procesado, **cuando** se reenvía, **entonces** el sistema devuelve el mismo resultado idempotente y no crea registros nuevos.
3. **Dado** un lote con resultados parciales, **cuando** termina el intento, **entonces** solo los fallidos permanecen pendientes.
4. **Dado** un corte durante el envío, **cuando** se reintenta, **entonces** se conserva la copia local hasta recibir confirmación individual.

---

### Historia de Usuario 4 - Historial sanitario solo-anexión (Prioridad: P1)

Como veterinario quiero consultar y corregir un historial sanitario que nunca reescriba el pasado para disponer de evidencia auditable.

**Por qué esta prioridad**: Es la base de integridad y trazabilidad del producto.

**Prueba independiente**: Crear un evento, corregirlo y comprobar que existe una nueva versión enlazada, mientras el original permanece sin cambios.

**Escenarios de aceptación**:

1. **Dado** un evento con error, **cuando** un veterinario registra una corrección con motivo, **entonces** se crea una nueva versión con `correctedEventId`.
2. **Dado** un usuario no veterinario, **cuando** intenta corregir, **entonces** recibe una denegación por rol.
3. **Dado** cualquier intento de actualización o borrado destructivo, **cuando** se procesa, **entonces** se rechaza y se registra el intento.
4. **Dado** un animal con varias versiones, **cuando** se consulta el historial, **entonces** se presenta la cadena completa y el estado vigente derivado.

---

### Historia de Usuario 5 - Consulta SINIGAN simulada y reconciliación (Prioridad: P1)

Como veterinario o Product Owner quiero consultar referencias simuladas de SINIGAN y resolver divergencias sin sobrescribir fuentes para distinguir la verdad legal de los datos operativos.

**Por qué esta prioridad**: Establece la jerarquía de fuentes y evita afirmar una integración real no autorizada.

**Prueba independiente**: Consultar un DIN simulado, provocar una divergencia y comprobar que se crea un ticket con ambas versiones, fuente, responsable y decisión humana.

**Escenarios de aceptación**:

1. **Dado** un DIN o SIT existente en fixtures, **cuando** se consulta, **entonces** la respuesta incluye metadatos inequívocos de simulación.
2. **Dado** un DIN o SIT inexistente, **cuando** se consulta, **entonces** se devuelve 404 y no se crea un animal local.
3. **Dada** una divergencia entre referencia externa y captura de campo, **cuando** se detecta, **entonces** se crea un ticket sin sobrescribir ninguna fuente.
4. **Dado** un ticket abierto, **cuando** un veterinario decide y aporta un motivo, **entonces** queda registrada la decisión, el responsable y la fecha.
5. **Dada** la integración simulada, **cuando** se inspecciona su operación, **entonces** no existe tráfico hacia dominios del ICA o SINIGAN ni operaciones externas de escritura.

---

### Historia de Usuario 6 - Alertas de inmovilidad y geocerca (Prioridad: P2)

Como operario quiero recibir alertas tempranas de inmovilidad y salida de potrero para actuar oportunamente.

**Prueba independiente**: Inyectar telemetría sintética con inmovilidad, cruce de geocerca y huecos GPS; comprobar alertas correctas y ausencia de falsos positivos por datos insuficientes.

**Escenarios de aceptación**:

1. **Dado** un periodo de inmovilidad superior al umbral, **cuando** se procesa la telemetría, **entonces** se genera una alerta abierta.
2. **Dado** un cruce del polígono configurado, **cuando** se procesa, **entonces** se genera una alerta de salida con última posición conocida.
3. **Dado** un hueco de GPS, **cuando** no hay evidencia suficiente, **entonces** se marca `INSUFFICIENT_DATA` y no se genera una alerta falsa.
4. **Dado** el flujo bajo carga simulada, **cuando** se mide, **entonces** la latencia p95 evento-alerta es menor a 2 minutos.

---

### Historia de Usuario 7 - Genealogía y consanguinidad (Prioridad: P2)

Como veterinario quiero registrar el linaje y recibir advertencias de consanguinidad para apoyar decisiones reproductivas.

**Prueba independiente**: Crear un hato sintético con parentescos conocidos y verificar el árbol de tres generaciones, las inconsistencias temporales y el grado esperado.

**Escenarios de aceptación**:

1. **Dado** un animal con padres registrados, **cuando** se consulta, **entonces** se presenta el linaje hasta tres generaciones.
2. **Dado** un cruce con parentesco superior a la política, **cuando** se propone, **entonces** se advierte o bloquea según la configuración vigente.
3. **Dadas** fechas incompatibles entre progenitor y descendiente, **cuando** se registra la relación, **entonces** se rechaza con explicación.
4. **Dado** un linaje de referencia sintético, **cuando** se calcula, **entonces** el resultado coincide con los casos validados por el veterinario.

---

### Historia de Usuario 8 - Peso, consumo y ganancia diaria (Prioridad: P2)

Como directivo quiero consultar peso, consumo, GDP, eficiencia alimenticia y costo por kilogramo para apoyar decisiones productivas.

**Prueba independiente**: Cargar pesajes y consumos sintéticos conocidos, consultar una ventana y comparar los indicadores con cálculos de referencia.

**Escenarios de aceptación**:

1. **Dado** un conjunto suficiente de pesajes válidos, **cuando** se consulta una ventana, **entonces** la GDP coincide con el resultado esperado.
2. **Dado** un pesaje atípico, **cuando** ingresa, **entonces** se marca para revisión sin borrarlo ni incorporarlo silenciosamente.
3. **Dado** un animal sin muestras suficientes, **cuando** se consulta, **entonces** se informa dato insuficiente, nunca cero por defecto.
4. **Dado** un lote con consumo y costos, **cuando** se consulta, **entonces** muestra eficiencia y costo por kilogramo trazables a registros fuente.

---

### Historia de Usuario 9 - Panel auditable (Prioridad: P3)

Como veterinario o directivo quiero indicadores sanitarios y productivos auditables para certificar y decidir.

**Prueba independiente**: Filtrar por finca, lote y fecha; comparar cada agregado con el historial fuente y verificar restricciones por rol.

**Escenarios de aceptación**:

1. **Dado** un filtro válido, **cuando** se consulta el panel, **entonces** los indicadores coinciden con el historial auditable.
2. **Dado** un operario, **cuando** consulta el panel, **entonces** solo ve su finca y no ve costos restringidos.
3. **Dada** una lista extensa, **cuando** se consulta, **entonces** está paginada y responde en menos de 3 segundos con la carga piloto.
4. **Dada** una solicitud de auditoría, **cuando** se exporta, **entonces** incluye autores, fechas, fuentes y versiones.

---

### Historia de Usuario 10 - Observabilidad y puertas DevSecOps (Prioridad: P1 transversal)

Como equipo quiero logs, métricas, trazas y validaciones automáticas para liberar únicamente flujos verificables y seguros.

**Prueba independiente**: Ejecutar el pipeline sobre un cambio controlado y comprobar compilación, pruebas unitarias, contrato, integración, E2E, análisis de seguridad y correlación extremo a extremo.

**Escenarios de aceptación**:

1. **Dado** un cambio, **cuando** abre una solicitud de integración, **entonces** se ejecutan todas las puertas automáticas y un fallo bloquea la liberación.
2. **Dado** un evento, **cuando** atraviesa captura, sincronización, persistencia y alerta, **entonces** conserva un identificador de correlación consultable.
3. **Dada** una escritura, **cuando** se audita, **entonces** siempre existe autor, fecha y motivo cuando corresponda.
4. **Dado** el cierre del MVP, **cuando** se reporta, **entonces** se presentan SLI-1 a SLI-4, cobertura de historias, defectos y resultados de seguridad.

## Casos de Borde Transversales

- Token expirado durante operación offline y posterior sincronización.
- Dos dispositivos capturan el mismo hecho con identificadores distintos.
- Eventos fuera de orden cronológico por reconexión tardía.
- Corrección de un evento que ya tiene una corrección posterior.
- Fixture externo válido pero animal local inexistente, y situación inversa.
- DIN duplicado o asociado a más de un animal local.
- Diferencia de zona horaria o reloj del dispositivo desajustado.
- Lote parcialmente inválido, demasiado grande o repetido.
- Telemetría atrasada, fuera de rango o con posiciones imposibles.
- Animal sin información suficiente para genealogía o indicadores.
- Usuario desactivado mientras mantiene datos locales pendientes.
- Caída de la base de datos o del adaptador mock durante un flujo.

## Requisitos Funcionales

- **FR-001**: Cada escritura DEBE identificar autor, finca, fecha de campo, fecha de recepción y correlation ID.
- **FR-002**: Cada evento capturado offline DEBE poseer un `clientEventId` UUID único y persistir hasta confirmación.
- **FR-003**: La sincronización DEBE ser idempotente y reportar resultado por evento.
- **FR-004**: Los eventos sanitarios DEBEN conservarse como historial solo-anexión.
- **FR-005**: Una corrección DEBE crear un nuevo evento, enlazar el anterior y exigir autor veterinario y motivo.
- **FR-006**: El sistema DEBE rechazar mutaciones destructivas del historial.
- **FR-007**: La integración SINIGAN DEBE ser de solo lectura, simulada, intercambiable y explícitamente identificada.
- **FR-008**: El mock DEBE consultar establecimientos, inventario, animal por DIN, eventos y cadena de custodia mediante datos simulados deterministas.
- **FR-009**: El sistema DEBE separar referencias externas, datos operativos y telemetría propia.
- **FR-010**: Las divergencias DEBEN generar tickets con ambas fuentes y resolución humana auditable.
- **FR-011**: El motor de alertas DEBE manejar inmovilidad, geocerca y datos insuficientes.
- **FR-012**: El sistema DEBE conservar telemetría y alertas sin autocierre automático.
- **FR-013**: La genealogía DEBE validar relaciones y calcular consanguinidad con política versionada.
- **FR-014**: Los indicadores productivos DEBEN distinguir dato insuficiente, valor atípico y valor válido.
- **FR-015**: El panel DEBE aplicar filtros, paginación y autorización por rol y finca.
- **FR-016**: Todos los indicadores DEBEN ser trazables a registros fuente.
- **FR-017**: Los contratos inválidos DEBEN producir errores consistentes y no persistir datos parciales no confirmados.
- **FR-018**: Las pruebas automatizadas DEBEN cubrir reglas, contratos, integración, flujos E2E, seguridad e idempotencia.
- **FR-019**: Ninguna respuesta simulada DEBE presentarse como oficial o legalmente válida.
- **FR-020**: La liberación del MVP DEBE requerir validación técnica, funcional y aprobación humana.

## Entidades Clave

- **Animal**: Registro local del bovino o bufalino y su estado operativo.
- **AnimalExternalReference**: Relación única con DIN y modo de fuente externa.
- **EstablishmentExternalReference**: Referencia de predio mediante SIT/RSPP simulados.
- **SanitaryEvent**: Evento sanitario inmutable con autoría, tiempo de campo y estado.
- **EventCorrection**: Nuevo evento que corrige otro sin reemplazarlo.
- **SyncBatch / SyncResult**: Lote y resultado individual de sincronización idempotente.
- **ReconciliationTicket**: Divergencia de fuentes y decisión humana.
- **TelemetryReading**: Lectura propia de ubicación, actividad o sensor.
- **Alert**: Alerta versionada y cerrada por un usuario.
- **GenealogyRelation**: Vínculo padre/madre con fuente y validación.
- **WeightReading / ConsumptionRecord**: Datos productivos trazables.
- **AuditRecord**: Evidencia de acciones, decisiones y accesos relevantes.

## Criterios de Éxito

- **SC-001**: 100% de eventos de una desconexión simulada de 24 horas sincronizan sin pérdida ni duplicados.
- **SC-002**: 0 actualizaciones o eliminaciones destructivas sobre el historial sanitario.
- **SC-003**: 100% de correcciones contienen autor veterinario, motivo y vínculo al evento anterior.
- **SC-004**: 100% de respuestas SINIGAN mock indican fuente, modo, simulación, versión y fecha de consulta.
- **SC-005**: 0 solicitudes salientes desde el mock hacia servicios del ICA o SINIGAN.
- **SC-006**: Latencia p95 evento-alerta menor a 2 minutos bajo carga simulada del piloto.
- **SC-007**: 100% de indicadores del panel se pueden rastrear a sus registros fuente.
- **SC-008**: Todos los flujos críticos tienen pruebas unitarias, de contrato, integración y E2E en verde.
- **SC-009**: 0 hallazgos críticos de seguridad abiertos al liberar la demo.
- **SC-010**: Las diez historias quedan aceptadas por el Product Owner conforme al DoD global.

## Fuera de Alcance

- Integración real, scraping, credenciales o endpoints privados de SINIGAN/ICA.
- Escritura, emisión o pago de DIN, GSMI, bonos o certificados oficiales.
- Dispositivos IoT físicos, actuación remota crítica o control mecánico.
- BI avanzado, contabilidad integral, genómica avanzada o aplicación pública.
- SLA externo de producción; el MVP opera como piloto académico con datos simulados.

## Supuestos

- La autenticación existente se reutiliza y se completa antes de flujos protegidos.
- Todos los identificadores externos y datos personales de prueba son simulados.
- La verdad legal de identidad, movimiento y propiedad corresponde a SINIGAN; el mock solo representa referencias académicas.
- El campo conserva el detalle sanitario, sujeto a validación veterinaria.
- Las metas de rendimiento corresponden a carga simulada del piloto y se revisarán con una línea base real.
