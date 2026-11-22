# Especificación de Funcionalidad: Captura offline de eventos sanitarios en campo (HU-02)

**Rama**: `feat/hu-02-offline-capture`
**Módulo**: `offline_capture`
**Creada**: 2026-11-21
**Estado**: Borrador
**Prioridad**: MUST – Línea base, iteración 1
**Entrada**: HU-02 — "Como operario quiero registrar una vacunación, tratamiento, chequeo clínico o desparasitación en el potrero aunque no tenga conexión a internet, para evitar la pérdida de registros operativos en campo."

## Clarifications

### Session 2026-11-21

- Q: ¿El operario puede indicar una hora anterior a la de guardado o la marca es siempre el instante en que guarda? → A: Siempre el instante de guardado en el dispositivo; el operario no puede editarla. La regla "no futura" se mantiene como validación defensiva del registro (protege contra datos alterados), aunque la interfaz no permita introducir una hora.
- Q: ¿Qué datos son obligatorios por tipo de evento? → A: Según el tipo. Vacunación y desparasitación: producto y dosis. Tratamiento: producto, dosis y motivo. Chequeo clínico: hallazgo u observación. Animal, tipo y hora son obligatorios en todos.
- Q: ¿El operario puede editar o descartar un evento mientras sigue `PENDIENTE_SINCRONIZACION`? → A: No. Todo evento es inmutable desde que se guarda (constitución §3, append-only). Las correcciones se hacen después con un evento nuevo vinculado (HU-04).
- Q: ¿Qué pasa con la captura offline preliminar que ya existe en el módulo de eventos sanitarios? → A: La captura de la HU-02 la reemplaza y la preliminar se retira de la interfaz. Los eventos pendientes guardados con la preliminar se conservan y se muestran en la nueva bandeja. El retiro se coordina con el responsable del módulo de eventos sanitarios.
- Q: ¿Cómo se registra la dosis en vacunaciones, desparasitaciones y tratamientos? → A: Un número mayor que cero más una unidad elegida de una lista cerrada: ml, mg, g o unidades.
- Q: ¿Con qué volumen de datos en el dispositivo debe seguir cumpliéndose el guardado en menos de 2 segundos? → A: Hasta 5.000 animales en el catálogo local y 1.000 eventos pendientes.
- Q: ¿Cómo indica el operario a qué animal le aplica el evento? → A: Busca por identificador (DIN/arete) o nombre y el sistema sugiere coincidencias del catálogo local de la finca activa; si lo indicado no coincide con ningún animal, se rechaza e informa el motivo.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Registrar un evento sanitario sin conexión (Prioridad: P1)

Un operario en el potrero, sin señal, registra una vacunación, un tratamiento, un chequeo clínico o una desparasitación sobre un animal de su finca. El registro queda guardado en el dispositivo al instante, sin esperar al servidor, y el sistema impide guardar datos inválidos (animal desconocido o fecha futura).

**Por qué esta prioridad**: Es el núcleo de la HU. Sin captura offline confiable se pierden registros operativos en campo, que es exactamente el problema que la historia resuelve (constitución §3 Offline-First y §5.4 Degradación Elegante).

**Prueba independiente**: Con el dispositivo sin conexión y el catálogo local de la finca cargado, se guarda un evento válido de cada uno de los 4 tipos y se intenta guardar uno con un animal inexistente y otro con fecha futura. Entrega valor por sí sola: los registros quedan a salvo en el dispositivo aunque la sincronización (HU-03) aún no exista.

**Escenarios de aceptación**:

1. **Dado** que el dispositivo se encuentra sin conectividad, **cuando** el operario guarda un evento sanitario válido, **entonces** queda almacenado localmente en menos de 2 segundos y se muestra con estado `PENDIENTE_SINCRONIZACION`. *(Criterio 1 de la HU)*
2. **Dado** un identificador de animal inexistente en el catálogo local de la finca activa, **cuando** se intenta guardar el evento, **entonces** el sistema rechaza la captura e informa que el animal no existe en el catálogo de la finca. *(Criterio 3 de la HU)*
3. **Dado** un registro cuya fecha/hora de captura es posterior a la hora actual del dispositivo (por ejemplo, un dato alterado), **cuando** se intenta guardar, **entonces** el sistema rechaza la captura e informa que la fecha no puede ser futura. *(Criterio 3 de la HU)*
4. **Dado** un evento recién guardado, **cuando** se consulta, **entonces** tiene un identificador único generado en el dispositivo (`client_event_id`), estado de sincronización `PENDIENTE_SINCRONIZACION` y estado de validación `PENDIENTE_VALIDACION`.
5. **Dado** que el dispositivo **sí** tiene conexión, **cuando** el operario guarda un evento, **entonces** el comportamiento es idéntico al offline: se guarda primero en el dispositivo y queda `PENDIENTE_SINCRONIZACION`.
6. **Dado** un usuario con rol `DIRECTIVO` o `ADMINISTRADOR`, **cuando** intenta registrar un evento, **entonces** la captura no está disponible para él (HU-01, FR-009 y FR-018).
7. **Dado** un evento de vacunación, desparasitación o tratamiento sin producto o sin dosis (o un tratamiento sin motivo, o un chequeo sin hallazgo u observación), o con una dosis en cero, negativa o sin unidad, **cuando** se intenta guardar, **entonces** el sistema rechaza la captura e indica qué dato falta o es inválido.

---

### Historia de Usuario 2 - Bandeja de pendientes que sobrevive al cierre de la aplicación (Prioridad: P1)

El operario cierra la aplicación, apaga el teléfono o se le agota la batería. Al volver a abrirla, todavía sin red, encuentra sus eventos en la bandeja de pendientes con la hora original en que los capturó.

**Por qué esta prioridad**: Un registro que se pierde al cerrar la aplicación equivale a no haberlo capturado. Es condición para que la captura offline tenga valor.

**Prueba independiente**: Se guardan varios eventos sin conexión, se cierra por completo la aplicación, se vuelve a abrir sin red y se verifica que todos siguen en la bandeja con su hora original de captura.

**Escenarios de aceptación**:

1. **Dado** un evento guardado sin conexión, **cuando** el operario cierra y vuelve a abrir la aplicación aún sin red, **entonces** el registro continúa visible en su bandeja de pendientes con su hora original de captura. *(Criterio 2 de la HU)*
2. **Dado** varios eventos pendientes, **cuando** el operario abre la bandeja, **entonces** los ve ordenados del más reciente al más antiguo según la hora de captura, con animal, tipo de evento, hora de captura y estados.
3. **Dado** un evento guardado, **cuando** pasa el tiempo o se reinicia el dispositivo, **entonces** su hora de captura no cambia.
4. **Dado** un evento en la bandeja de pendientes, **cuando** el operario lo consulta, **entonces** no hay opción de editarlo ni de borrarlo.

---

### Historia de Usuario 3 - Distinguir los estados de sincronización y de validación (Prioridad: P2)

Al consultar el detalle de un evento recién capturado, el operario entiende sin ambigüedad que el registro todavía no ha llegado al servidor y que aún no ha sido validado por un veterinario: son dos condiciones distintas.

**Por qué esta prioridad**: Evita que el operario crea que un evento ya está "oficial" o que repita la captura. Depende de que existan eventos guardados (US1).

**Prueba independiente**: Se captura un evento y se abre su detalle; se verifica que muestra los dos estados por separado, cada uno con texto explícito.

**Escenarios de aceptación**:

1. **Dado** un evento recién capturado, **cuando** el operario consulta su detalle, **entonces** distingue claramente que está pendiente de sincronización y pendiente de validación veterinaria. *(Criterio 4 de la HU)*
2. **Dado** el detalle de un evento, **cuando** se muestra, **entonces** cada estado se indica con texto (no solo con color o icono) y por separado del otro.
3. **Dado** un evento capturado con la sesión offline vencida (HU-01, FR-013), **cuando** se consulta su detalle, **entonces** también indica que está pendiente de verificación de autor.

---

### Casos Límite

- **Doble toque en "Guardar"**: se guarda un único evento, no dos.
- **Cierre abrupto durante el guardado** (batería, cierre forzado): el evento queda guardado completo o no queda; nunca un registro a medias. Si no quedó, el operario no recibe confirmación de guardado.
- **Almacenamiento del dispositivo lleno**: el sistema informa que no pudo guardar y no muestra confirmación; los eventos anteriores no se pierden.
- **Dos eventos idénticos** (mismo animal, tipo y minuto): ambos se guardan como registros distintos, cada uno con su propio `client_event_id`; la detección de duplicados reales corresponde a HU-03.
- **Búsqueda con varias coincidencias** (por ejemplo, dos animales con nombres parecidos): el sistema muestra todas las sugerencias con identificador y nombre, y el operario elige una; nunca se asigna un animal automáticamente.
- **Catálogo local vacío o no descargado**: el sistema informa que no hay animales disponibles para la finca y no permite guardar.
- **Animal retirado del catálogo después de capturar**: los eventos ya guardados se conservan sin cambios; la regla de catálogo solo se aplica al momento de guardar.
- **Reloj del dispositivo adelantado o atrasado**: la hora del evento es la del dispositivo al guardar; la conciliación con la hora del servidor queda fuera de alcance (ver Supuestos).
- **Error de digitación** (animal, producto o dosis equivocados): el evento no se puede editar ni borrar; se corrige con un evento nuevo vinculado (HU-04).
- **Evento registrado tiempo después de la intervención**: queda con la hora de guardado; si la diferencia importa, el operario la anota en observaciones.
- **Sesión offline vencida** (más de 7 días sin conexión, HU-01): la captura no se bloquea; el evento se marca como pendiente de verificación de autor.
- **Varios usuarios en el mismo dispositivo**: cada usuario ve en su bandeja solo los eventos que él capturó en la finca activa; los eventos de otros usuarios se conservan intactos.
- **Eventos de la captura preliminar**: aparecen en la nueva bandeja aunque les falten datos que hoy son obligatorios (FR-015) o sean de un tipo con otra denominación (por ejemplo "chequeo"); no se rechazan ni se modifican.
- **Cambio de finca activa** (usuario con varias fincas): la bandeja y el catálogo corresponden a la finca activa; los eventos de otras fincas se conservan.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir registrar eventos sanitarios de 4 tipos: vacunación, tratamiento, chequeo clínico y desparasitación.
- **FR-002**: El sistema DEBE asignar a cada evento, en el momento de guardarlo y en el propio dispositivo, un identificador único universal (`client_event_id`) que no cambia durante toda la vida del evento.
- **FR-003**: El sistema DEBE guardar el evento en el almacenamiento local del dispositivo sin requerir conexión ni respuesta del servidor, y confirmar el guardado en menos de 2 segundos.
- **FR-004**: El sistema DEBE guardar primero en el dispositivo también cuando hay conexión (comportamiento offline-first idéntico con y sin red).
- **FR-005**: Cada evento DEBE nacer con dos estados independientes: estado de sincronización `PENDIENTE_SINCRONIZACION` y estado de validación `PENDIENTE_VALIDACION`. Esta HU no cambia esos estados; las transiciones corresponden a HU-03 (sincronización) y HU-04 (validación veterinaria).
- **FR-006**: El sistema DEBE registrar como marca de tiempo válida del evento el instante en que el operario lo guarda en el dispositivo, sin que pueda editarla. Esa marca nunca se reemplaza por la hora de llegada al servidor.
- **FR-007**: El sistema DEBE rechazar todo registro cuya fecha/hora sea posterior a la hora actual del dispositivo, informando el motivo (validación defensiva, aunque la interfaz no permita introducir la hora).
- **FR-008**: El sistema DEBE rechazar la captura cuando el animal no existe en el catálogo local de la finca activa, informando el motivo.
- **FR-009**: El catálogo de animales de la finca activa DEBE estar disponible en el dispositivo sin conexión.
- **FR-009b**: El operario DEBE poder indicar el animal escribiendo su identificador (DIN/arete) o su nombre; el sistema DEBE sugerir, sin conexión, los animales del catálogo de la finca activa que coinciden. Si lo indicado no coincide con ningún animal del catálogo, se aplica FR-008.
- **FR-010**: Los eventos guardados DEBEN conservarse íntegros tras cerrar la aplicación, reiniciar el dispositivo o perder la batería.
- **FR-011**: El sistema DEBE mostrar una bandeja de pendientes con los eventos del usuario en la finca activa, del más reciente al más antiguo, indicando animal, tipo, hora original de captura y ambos estados.
- **FR-012**: El detalle de un evento DEBE mostrar por separado y con texto explícito el estado de sincronización y el estado de validación, más la indicación de verificación de autor cuando aplique.
- **FR-013**: Cada evento DEBE registrar su autor (el usuario con sesión activa al capturar, HU-01) y la finca activa. Si la sesión offline está vencida, la captura NO se bloquea y el evento se marca como pendiente de verificación de autor (HU-01, FR-013 y FR-013b).
- **FR-014**: Solo los roles `OPERARIO` y `VETERINARIO` DEBEN poder capturar eventos (HU-01, FR-009); `DIRECTIVO` y `ADMINISTRADOR` no.
- **FR-015**: El sistema DEBE exigir antes de guardar, además de animal, tipo y hora: producto y dosis en vacunación y desparasitación; producto, dosis y motivo en tratamiento; hallazgo u observación en chequeo clínico. Las observaciones son opcionales en los demás tipos. Si falta un dato, DEBE indicar cuál. La dosis se compone de una cantidad numérica mayor que cero y una unidad elegida de la lista cerrada `ml`, `mg`, `g` o `unidades`; DEBE rechazarse una cantidad vacía, cero o negativa, o una dosis sin unidad.
- **FR-016**: Todo evento DEBE ser inmutable desde que se guarda, incluso mientras está `PENDIENTE_SINCRONIZACION`: no se puede editar ni borrar. Las correcciones se hacen con un evento nuevo vinculado (constitución §3; HU-04).
- **FR-017**: Esta HU NO DEBE enviar eventos al servidor; el envío, la idempotencia y los reintentos corresponden a HU-03.
- **FR-018**: La captura de esta HU DEBE ser la única captura sanitaria offline disponible en la interfaz; la captura preliminar se retira.
- **FR-019**: Los eventos pendientes guardados con la captura preliminar DEBEN conservarse sin cambios y mostrarse en la bandeja de pendientes de esta HU, con su `client_event_id` y hora de captura originales. Como nacieron sin los datos obligatorios de FR-015 ni el estado de validación separado, se muestran tal como se capturaron y con estado de validación `PENDIENTE_VALIDACION`.

### Entidades Clave

- **Evento sanitario capturado**: registro de una intervención sanitaria hecha en campo. Atributos: `client_event_id`, tipo de evento, animal, fecha/hora de captura en campo, producto, dosis (cantidad y unidad), motivo, hallazgo (según el tipo, FR-015), observaciones, autor, finca, estado de sincronización, estado de validación, indicador de verificación de autor pendiente, momento de guardado en el dispositivo.
- **Animal (catálogo local)**: animal de la finca activa disponible sin conexión, contra el que se valida la captura. Atributos: identificador estándar del animal: DIN (`sinigan_code`), nombre o señas visibles, finca.
- **Usuario** y **Finca**: definidos en HU-01 (`specs/001-auth-rbac`). Determinan autor, rol habilitado y finca activa.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100 % de los eventos válidos guardados sin conexión quedan confirmados en menos de 2 segundos en un dispositivo de gama media, con hasta 5.000 animales en el catálogo local y 1.000 eventos pendientes ya guardados.
- **SC-002**: Tras 20 ciclos de cierre y reapertura de la aplicación sin red, se conservan el 100 % de los eventos con su hora original de captura (cero pérdidas).
- **SC-003**: El 100 % de los intentos con animal inexistente, fecha futura o datos obligatorios faltantes se rechazan, y el mensaje indica el motivo concreto.
- **SC-004**: Un operario registra un evento completo en menos de 60 segundos desde que abre el formulario.
- **SC-005**: Al menos el 90 % de los operarios en una prueba de uso identifican, sin ayuda, que un evento recién capturado está pendiente de sincronización y pendiente de validación.
- **SC-006**: Ningún evento comparte `client_event_id` con otro, incluso con capturas simultáneas en varios dispositivos.
- **SC-007**: Con 1.000 eventos pendientes, la bandeja se muestra completa al abrir la aplicación sin conexión en menos de 3 segundos.

## Supuestos

- **Catálogo local**: para esta HU se usa un catálogo semilla por finca (backlog: "Sí, usando catálogo local semilla"). El dispositivo lo descarga del servidor cuando hay conexión y lo conserva para operar sin red. La sincronización del catálogo con SINIGÁN queda fuera de alcance (HU-05).
- **Identificación del animal**: el animal se identifica con su DIN, sin dependencias bloqueantes contra tablas de otras HU (constitución §2).
- **Reloj del dispositivo**: la validación de fecha futura usa la hora del dispositivo. Detectar relojes manipulados o desfasados queda fuera de alcance.
- **Autenticación y roles**: provienen de HU-01 (sesión offline de 7 días, finca activa, roles con permiso de escritura). Esta HU no redefine esas reglas.
- **Fuera de alcance**: envío al servidor, idempotencia y reintentos (HU-03); validación veterinaria y correcciones del historial (HU-04); conflictos con SINIGÁN (HU-05).
- **Captura preliminar existente**: el repositorio ya tiene una captura offline preliminar dentro del módulo de eventos sanitarios (tipos vacunación, tratamiento y chequeo; un solo estado). Esta HU la reemplaza (FR-018, FR-019). Retirarla de la interfaz toca el módulo de otro integrante, así que se hace mediante una solicitud de coordinación con su responsable (constitución §2, aislamiento modular).
- **Volumen**: el diseño se dimensiona para hasta 5.000 animales por finca en el catálogo local y 1.000 eventos pendientes en el dispositivo (aproximadamente una semana sin conexión en una finca grande). Superar esos valores no debe perder datos, pero no se garantizan los tiempos de SC-001 y SC-007.
- **Dispositivo**: un teléfono o tableta con navegador moderno y almacenamiento local disponible; no se exige hardware especial.
