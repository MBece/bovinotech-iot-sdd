 > /speckit.plan @especificador Con base en specs/004-sanitary-events/spec.md y .specify/memory/constitution.md, genera specs/004-sanitary-events/plan.md (contratos Pydantic v2, endpoints GET /sanitary-events/animals/{din} y POST /sanitary-events/{event_id}/correct, modelo inmutable en backend/app/features/sanitary_events/ y línea de tiempo en frontend/src/features/sanitary_events/) y specs/004-sanitary-events/tasks.md.# Especificación de Funcionalidad: Historial sanitario y correcciones por anexión

**Rama de Funcionalidad**: `004-sanitary-events`<br>
**Módulo funcional**: `sanitary_events`<br>
**Prioridad**: MUST — Línea base, iteración 2<br>
**Estado**: Borrador

## Resumen

Permitir consultar por DIN el historial sanitario completo de un animal en orden cronológico y corregir un evento únicamente mediante la creación de un nuevo evento enlazado al original. El historial es inmutable: ningún usuario puede sobrescribir o eliminar eventos existentes. Solo el rol `VETERINARIO` puede registrar correcciones y cada una requiere un motivo.

## Perfiles de usuario

- **OPERARIO en móvil**: consulta la información sanitaria disponible de un animal durante el trabajo de campo. No puede corregir eventos.
- **VETERINARIO en escritorio**: consulta el historial y registra correcciones justificadas dentro de su finca activa.
- Los demás roles pueden consultar el historial solo si sus permisos generales lo permiten; no pueden registrar correcciones.

## Historias de Usuario y Criterios de Aceptación

### Historia 1 — Consultar historial por DIN (P1)

Como usuario autorizado quiero consultar los eventos sanitarios asociados al DIN de un animal, para conocer su historial y estado sanitario.

**Criterios Given/When/Then**

1. **Dado** un DIN con eventos sanitarios, **cuando** un usuario autorizado consulta el historial, **entonces** ve todos los eventos asociados a ese DIN en orden cronológico desde el más antiguo hasta el más reciente, incluyendo autor, fecha de captura, fecha de sincronización y estado de validación.
2. **Dado** un DIN sin eventos sanitarios, **cuando** un usuario autorizado consulta el historial, **entonces** el sistema informa que no hay eventos registrados y muestra una lista vacía, sin crear registros.
3. **Dado** un animal cuyo tratamiento mantiene un tiempo de retiro vigente, **cuando** se consulta su historial, **entonces** el tiempo de retiro y su vigencia se muestran de forma claramente destacada para prevenir el despacho o comercialización de productos afectados.
4. **Dado** un usuario autorizado que consulta un historial previamente sincronizado y pierde conectividad, **cuando** vuelve a consultar el mismo historial desde el dispositivo, **entonces** puede ver la información local disponible y recibe una indicación clara de que podría no incluir cambios recientes.

### Historia 2 — Registrar corrección sin alterar el original (P1)

Como veterinario quiero corregir un evento sanitario mediante una nueva anotación vinculada y justificada, para preservar la exactitud del historial sin perder trazabilidad.

**Criterios Given/When/Then**

1. **Dado** un evento existente asociado a un DIN y un usuario con rol `VETERINARIO`, **cuando** registra una corrección con un motivo no vacío, **entonces** se crea un nuevo evento con `corrected_event_id` apuntando al evento objetivo, se registra el autor y la fecha/hora, y el evento original permanece intacto y visible en el historial.
2. **Dado** un evento existente y un usuario con rol distinto de `VETERINARIO`, **cuando** intenta registrar una corrección, **entonces** el sistema rechaza la acción y no crea ni modifica eventos.
3. **Dado** un veterinario que intenta corregir un evento sin proporcionar motivo o con un motivo vacío, **cuando** envía la corrección, **entonces** el sistema la rechaza, informa que el motivo es obligatorio y no altera el historial.
4. **Dado** un veterinario que intenta corregir un evento objetivo inexistente, **cuando** envía la corrección, **entonces** el sistema la rechaza, informa que el evento objetivo no existe y no crea ni modifica eventos.
5. **Dado** un evento histórico, **cuando** cualquier usuario o acción intenta actualizarlo o eliminarlo, **entonces** la operación se rechaza y el contenido original permanece sin cambios.

## Reglas de negocio

- El historial sanitario es estrictamente de solo anexión. Está prohibido actualizar o eliminar destructivamente cualquier evento original.
- Cada corrección es un evento nuevo enlazado al objetivo mediante `corrected_event_id`; debe conservar motivo, autor veterinario y fecha/hora.
- El motivo de una corrección es obligatorio y no puede consistir únicamente en espacios en blanco.
- Solo `VETERINARIO` puede crear correcciones. La consulta respeta el rol y la finca activa del usuario.
- Una corrección no reemplaza ni oculta el evento original: ambos deben permanecer consultables y trazables.
- El historial se ordena por fecha y hora de captura en orden cronológico ascendente.
- La identidad oficial del animal corresponde al DIN de SINIGÁN V6. Una discrepancia no autoriza a sobrescribir automáticamente la identidad ni los registros oficiales.
- Las operaciones de registro realizadas sin conexión deben conservarse para sincronización posterior sin generar duplicados mediante `client_event_id`; la falta de conectividad no debe borrar ni alterar el historial ya registrado.
- Cuando se consulte un animal con tiempo de retiro vigente, la advertencia sanitaria debe permanecer visible.

## Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir a un usuario autorizado consultar por DIN todos los eventos sanitarios asociados al animal dentro de su finca activa.
- **FR-002**: El sistema DEBE presentar el historial completo en orden cronológico ascendente según la fecha y hora de captura, mostrando autor, fecha de captura, fecha de sincronización y estado de validación.
- **FR-003**: Si el DIN consultado no tiene eventos, el sistema DEBE presentar un resultado vacío con un mensaje informativo y NO DEBE crear eventos.
- **FR-004**: El sistema DEBE permitir registrar una corrección únicamente a un usuario autenticado con rol `VETERINARIO`.
- **FR-005**: Toda corrección DEBE crear un evento nuevo vinculado al evento corregido mediante `corrected_event_id`, e incluir un motivo no vacío, el autor y la fecha/hora.
- **FR-006**: El sistema NO DEBE actualizar ni eliminar un evento sanitario original como consecuencia de una corrección ni de ninguna otra acción.
- **FR-007**: El sistema DEBE rechazar una corrección sin motivo o con un evento objetivo inexistente, sin modificar ni crear eventos.
- **FR-008**: El sistema DEBE denegar los intentos de corrección de cualquier usuario que no tenga rol `VETERINARIO`.
- **FR-009**: Si hay un tiempo de retiro vigente, toda consulta del historial DEBE mostrarlo claramente junto con su vigencia.
- **FR-010**: La consulta de información previamente sincronizada DEBE seguir disponible sin conexión, indicando que la vista puede estar desactualizada. Los registros capturados sin conexión DEBEN conservar su `client_event_id` y sincronizarse de forma idempotente.

## Entidades y datos relevantes

- **Evento sanitario**: DIN del animal, tipo de evento, datos sanitarios, autor, fecha/hora de captura, fecha/hora de sincronización, estado de validación y, cuando corresponda, vínculo `corrected_event_id` y motivo de corrección.
- **Tiempo de retiro**: periodo vigente asociado al tratamiento que determina la advertencia sanitaria visible en la consulta.
- **Corrección**: nuevo evento sanitario que referencia el evento objetivo y conserva el motivo y la autoría veterinaria; no sustituye al original.

## Criterios de Éxito

- **SC-001**: El 100 % de los historiales consultados se presenta en orden cronológico ascendente y asociado al DIN solicitado.
- **SC-002**: El 100 % de las consultas de DIN sin eventos presenta un resultado vacío informativo y no crea registros.
- **SC-003**: El 100 % de los intentos de corrección por usuarios que no sean `VETERINARIO` se rechaza sin cambios en el historial.
- **SC-004**: El 100 % de las correcciones válidas crea un nuevo evento enlazado y deja el evento original íntegro y consultable.
- **SC-005**: El 100 % de las correcciones sin motivo o dirigidas a un evento inexistente se rechaza sin crear ni modificar eventos.
- **SC-006**: La integridad del historial original se mantiene al menos en el 99,9 % de las operaciones evaluadas; cualquier intento de alteración destructiva debe ser rechazado.
- **SC-007**: En toda consulta de un animal con tiempo de retiro vigente, la advertencia aparece de forma visible.

## Alcance y supuestos

- Esta funcionalidad cubre la consulta del historial sanitario por DIN y la corrección por anexión. No define la captura general de eventos, la sincronización con SINIGÁN V6 ni la emisión de alertas.
- La visualización offline se limita a la información previamente sincronizada disponible en el dispositivo; se identifica como potencialmente desactualizada.
- Las alertas críticas gestionadas por otras funcionalidades mantienen el objetivo del proyecto de latencia inferior a 10 segundos; esta funcionalidad no genera dichas alertas.
