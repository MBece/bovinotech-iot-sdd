# Especificación de Funcionalidad: Sincronización por lotes, idempotencia y reintentos controlados (HU-03)

**Rama de Funcionalidad**: `feat/hu-03-offline-sync`

**Módulo**: `offline_sync`

**Fecha de Creación**: 2026-11-24

**Estado**: Draft

**Prioridad**: MUST – Línea base, iteraciones 1 y 2

**Entrada**: Descripción de usuario: "HU-03 — Como sistema quiero transmitir por lotes al servidor los eventos pendientes capturados sin conexión, garantizando idempotencia y reintentos progresivos, para consolidar la información de campo sin pérdidas ni duplicados al restablecerse la red."

## Historia de Usuario (transcripción literal)

**Historia:** Como sistema quiero transmitir por lotes al servidor los eventos pendientes capturados sin conexión, garantizando idempotencia y reintentos progresivos, para consolidar la información de campo sin pérdidas ni duplicados al restablecerse la red.

**Reglas de negocio:**

- Ningún evento local se elimina de la cola del dispositivo hasta recibir confirmación explícita del servidor.
- El procesamiento en el servidor es estrictamente idempotente usando el `client_event_id`: si un evento ya fue procesado, se reconoce como duplicado sin crear un segundo registro.
- Ante fallos temporales de red, los reintentos aplican espera exponencial progresiva (*backoff* con variación aleatoria).

**Criterios de aceptación:**

1. **Dado** un lote de eventos en estado `PENDIENTE_SINCRONIZACION`, **cuando** se restablece la conectividad, **entonces** el sistema los envía en lote y actualiza cada elemento como `SINCRONIZADO`, `DUPLICADO` o `FALLIDO`.
2. **Dado** un corte simulado de 24 horas con múltiples eventos capturados, **cuando** vuelve la conexión, **entonces** el 100 % de los eventos válidos se sincronizan sin pérdida ni duplicación.
3. **Dado** un evento que ya fue sincronizado previamente, **cuando** el cliente lo reenvía por un corte a mitad de respuesta, **entonces** el servidor responde `DUPLICADO` y conserva un único registro.
4. **Dado** un lote donde fallan 2 de 10 eventos por error transitorio, **cuando** finaliza el envío, **entonces** los 8 exitosos quedan confirmados y solo los 2 fallidos permanecen en cola para reintento.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Envío automático por lotes al recuperar la conexión (Prioridad: P1)

Un operario pasa el día en potreros sin señal y captura varios eventos sanitarios (HU-02). Cuando el dispositivo recupera la conexión, el sistema envía por su cuenta los pendientes al servidor, agrupados en lotes. El servidor devuelve un resultado por cada evento y el dispositivo actualiza el estado de cada uno. El operario no tiene que hacer nada, pero ve en el monitor de conectividad cómo baja el contador de pendientes.

**Rol y Dispositivo Objetivo**: Sistema (proceso automático del dispositivo) en nombre del OPERARIO o VETERINARIO que capturó los eventos, en smartphone rural.

**Por qué esta prioridad**: Sin este envío los eventos capturados en campo nunca llegan al servidor. Ni el veterinario puede validarlos (HU-04) ni la finca tiene trazabilidad consolidada. Es el núcleo de la HU.

**Prueba Independiente**: Con 10 eventos `PENDIENTE_SINCRONIZACION` en el dispositivo y el servidor disponible, se simula la vuelta de la conexión. Se verifica que los 10 se envían sin intervención del usuario, que cada uno queda `SINCRONIZADO` y que el servidor tiene exactamente 10 registros nuevos con su hora original de captura.

**Escenarios de Aceptación**:

1. **Given** un lote de eventos en estado `PENDIENTE_SINCRONIZACION`, **When** se restablece la conectividad, **Then** el sistema los envía en lote y actualiza cada elemento como `SINCRONIZADO`, `DUPLICADO` o `FALLIDO`. *(Criterio 1 de la HU)*
2. **Given** un corte simulado de 24 horas con múltiples eventos capturados, **When** vuelve la conexión, **Then** el 100 % de los eventos válidos se sincronizan sin pérdida ni duplicación. *(Criterio 2 de la HU)*
3. **Given** más eventos pendientes de los que caben en un solo lote, **When** se sincroniza, **Then** el sistema los envía en lotes sucesivos, del más antiguo al más reciente según su hora de captura, hasta vaciar la cola o perder la conexión.
4. **Given** un evento sincronizado, **When** se consulta en el servidor, **Then** conserva su `client_event_id`, su hora original de captura en campo, su autor, su finca y el resto de sus datos tal como se capturaron, y además registra el momento de recepción en el servidor.
5. **Given** que el dispositivo tiene conexión y hay eventos pendientes, **When** el usuario pulsa "Sincronizar ahora", **Then** el sistema inicia el envío de inmediato, sin esperar al siguiente intento programado.

---

### Historia de Usuario 2 - Idempotencia ante reenvíos y respuestas perdidas (Prioridad: P1)

La conexión rural se corta justo después de que el servidor guardó un lote, pero antes de que el dispositivo reciba la respuesta. El dispositivo no sabe si el envío funcionó, así que reenvía los mismos eventos. El servidor los reconoce por su `client_event_id`, no crea registros nuevos y responde `DUPLICADO`. El dispositivo los da por confirmados.

**Rol y Dispositivo Objetivo**: Sistema (dispositivo del OPERARIO/VETERINARIO y servidor central).

**Por qué esta prioridad**: Un historial sanitario con eventos duplicados falsea tratamientos, dosis y tiempos de retiro, lo que pone en riesgo la inocuidad de leche y carne (constitución §3). Sin idempotencia, el reintento seguro de la Historia 1 es imposible.

**Prueba Independiente**: Se envía un evento, el servidor lo guarda y se descarta la respuesta (corte simulado). Se reenvía el mismo evento. Se verifica que el servidor responde `DUPLICADO`, que existe un único registro y que el dispositivo marca el evento como confirmado.

**Escenarios de Aceptación**:

1. **Given** un evento que ya fue sincronizado previamente, **When** el cliente lo reenvía por un corte a mitad de respuesta, **Then** el servidor responde `DUPLICADO` y conserva un único registro. *(Criterio 3 de la HU)*
2. **Given** un lote que contiene dos veces el mismo `client_event_id`, **When** el servidor lo procesa, **Then** guarda un único registro y responde `SINCRONIZADO` para una aparición y `DUPLICADO` para la otra.
3. **Given** dos envíos simultáneos con el mismo `client_event_id` (por ejemplo, un envío automático y uno manual a la vez), **When** el servidor los procesa, **Then** guarda un único registro, sin importar el orden de llegada.
4. **Given** un evento ya registrado en el servidor, **When** llega otro evento con el mismo `client_event_id` pero con contenido distinto, **Then** el servidor conserva el registro original sin modificarlo, rechaza el segundo como `FALLIDO` definitivo con el motivo "identificador ya usado con datos distintos" y deja constancia del intento para auditoría.

---

### Historia de Usuario 3 - Resultados parciales y reintentos progresivos (Prioridad: P2)

En un lote de 10 eventos, 2 fallan por un error transitorio (por ejemplo, el servidor no responde a tiempo). El dispositivo confirma los 8 que salieron bien y deja solo los 2 fallidos en cola. Luego los reintenta con esperas cada vez más largas y con una variación aleatoria, para no saturar el servidor cuando muchos dispositivos se reconectan a la vez.

**Rol y Dispositivo Objetivo**: Sistema (dispositivo del OPERARIO/VETERINARIO).

**Por qué esta prioridad**: Un fallo parcial no debe obligar a reenviar el lote completo ni dejar eventos en el olvido. Es necesario para operar con conectividad rural inestable, aunque la Historia 1 ya entrega valor con conexión estable.

**Prueba Independiente**: Se envía un lote de 10 eventos con el servidor configurado para fallar transitoriamente en 2. Se verifica que 8 quedan confirmados, que solo 2 permanecen en cola como `FALLIDO`, que se reintentan con esperas crecientes y que acaban `SINCRONIZADO` cuando el servidor se recupera.

**Escenarios de Aceptación**:

1. **Given** un lote donde fallan 2 de 10 eventos por error transitorio, **When** finaliza el envío, **Then** los 8 exitosos quedan confirmados y solo los 2 fallidos permanecen en cola para reintento. *(Criterio 4 de la HU)*
2. **Given** un evento `FALLIDO` por error transitorio, **When** se programan sus reintentos, **Then** cada espera es mayor que la anterior (crecimiento exponencial), tiene un tope máximo y lleva una variación aleatoria.
3. **Given** varios dispositivos de la misma finca que recuperan la conexión al mismo tiempo, **When** reintentan, **Then** sus reintentos no coinciden en el mismo instante gracias a la variación aleatoria.
4. **Given** un evento `FALLIDO` por error transitorio que se envía con éxito en un reintento posterior, **When** el servidor responde, **Then** el evento pasa a `SINCRONIZADO` (o `DUPLICADO` si el intento anterior sí había llegado) y su espera de reintento se reinicia.
5. **Given** un evento rechazado por el servidor por un motivo definitivo (por ejemplo, el usuario ya no tiene acceso a esa finca), **When** finaliza el envío, **Then** el evento queda `FALLIDO` con el motivo visible, no se reintenta automáticamente y **no** se elimina del dispositivo.

---

### Historia de Usuario 4 - Visibilidad del estado de sincronización (Prioridad: P3)

El operario ve en todo momento cuántos eventos quedan pendientes, si hay una sincronización en curso y qué eventos fallaron y por qué, para saber si la información de campo ya llegó al servidor.

**Rol y Dispositivo Objetivo**: OPERARIO en smartphone rural; VETERINARIO en escritorio.

**Por qué esta prioridad**: Da confianza y permite actuar ante fallos definitivos, pero la sincronización funciona igual sin esta vista detallada.

**Prueba Independiente**: Con eventos en los estados pendiente, en envío, fallido y sincronizado, se abre la bandeja de HU-02 y el monitor de conectividad. Se verifica que el contador y los estados por evento coinciden con la realidad.

**Escenarios de Aceptación**:

1. **Given** eventos pendientes o fallidos en el dispositivo, **When** el usuario mira el monitor de conectividad, **Then** ve el número de eventos aún no confirmados por el servidor, y ese número baja a medida que llegan confirmaciones.
2. **Given** un evento `FALLIDO`, **When** el usuario abre su detalle, **Then** ve el motivo en lenguaje claro, si se reintentará automáticamente y cuándo será el próximo intento.
3. **Given** una sincronización en curso, **When** el usuario mira el monitor de conectividad, **Then** ve que hay un envío en progreso.

---

### Casos de Borde y Condiciones Rurales

- **Corte de red a mitad del envío de un lote**: los eventos sin respuesta del servidor vuelven a quedar en cola y se reintentan. Ninguno se da por confirmado sin respuesta explícita. Si el servidor ya los había guardado, responderá `DUPLICADO` (Historia 2).
- **Aplicación cerrada, dispositivo reiniciado o batería agotada durante el envío**: al volver a abrir la aplicación, los eventos que estaban "en envío" sin confirmación vuelven a `PENDIENTE_SINCRONIZACION` y se reenvían. Ninguno se pierde.
- **Lote completo rechazado por error transitorio del servidor** (servidor caído o saturado): todos los eventos del lote quedan `FALLIDO` transitorio y se reintentan con espera progresiva. No se pierde ninguno.
- **Sesión del usuario vencida o inválida al sincronizar**: el envío se pausa sin marcar los eventos como fallidos definitivos y se reanuda cuando el usuario vuelve a iniciar sesión (HU-01). Los eventos se conservan.
- **Eventos capturados con sesión offline vencida** (pendientes de verificación de autor, HU-02 FR-013): se sincronizan conservando esa marca. El servidor no la elimina.
- **Eventos de otro usuario en el mismo dispositivo**: solo se envían con la sesión de su autor. Mientras tanto permanecen intactos en el dispositivo.
- **Eventos de la captura preliminar** (HU-02 FR-019): se sincronizan como cualquier otro pendiente, con su `client_event_id` y hora de captura originales, aunque les falten datos que hoy son obligatorios.
- **Envío automático y manual simultáneos**: el dispositivo ejecuta una sola sincronización a la vez. Si aun así llegara un reenvío, la idempotencia del servidor impide duplicados.
- **Conexión intermitente** (la señal va y viene): cada vuelta de la conexión puede disparar un envío, pero respetando la espera programada de los eventos fallidos y sin ejecutar dos sincronizaciones en paralelo.
- **Evento con fecha de captura futura** según la hora del servidor (más allá de la tolerancia): el servidor lo registra igualmente, lo marca "hora pendiente de revisión" y responde `SINCRONIZADO`. Un reloj adelantado no debe causar pérdida de registros (contrato HU-02, constitución §5.4).
- **Evento con datos inválidos o alterados** (faltan datos obligatorios, tipo desconocido): el servidor lo rechaza como `FALLIDO` definitivo con motivo. No lo guarda y no se reintenta automáticamente.
- **Historial append-only**: la sincronización nunca modifica ni borra eventos ya registrados en el servidor. Un reenvío con datos distintos se rechaza (Historia 2, escenario 4) y una corrección real se hace con un evento nuevo vinculado (HU-04).
- **Animal que diverge de SINIGÁN V6**: esta HU no compara con SINIGÁN. El evento se sincroniza tal como se capturó y las divergencias se tratan en HU-05.
- **Tiempo de retiro**: esta HU no calcula ni muestra tiempos de retiro. Solo garantiza que los eventos que los originan lleguen al servidor completos y una sola vez.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Envío por lotes (cliente)**

- **FR-001**: El sistema DEBE iniciar automáticamente la sincronización de los eventos pendientes cuando el dispositivo recupera la conectividad con el servidor, sin intervención del usuario.
- **FR-002**: El sistema DEBE ofrecer la acción manual "Sincronizar ahora" cuando hay conexión y eventos pendientes o fallidos transitorios. Esta acción inicia el envío de inmediato, saltándose la espera programada.
- **FR-003**: El sistema DEBE enviar los eventos agrupados en lotes de hasta 50 eventos, del más antiguo al más reciente según su hora de captura en campo, y continuar con lotes sucesivos hasta vaciar la cola o perder la conexión.
- **FR-004**: El dispositivo DEBE ejecutar como máximo una sincronización a la vez.
- **FR-005**: Mientras un evento se está enviando, el sistema DEBE mostrarlo en un estado intermedio "en envío". Si no se recibe respuesta del servidor para ese evento, por cualquier causa (corte de red, cierre de la aplicación, reinicio), DEBE volver a quedar pendiente de envío.
- **FR-006**: El sistema DEBE actualizar el estado de sincronización de cada evento según la respuesta individual del servidor: `SINCRONIZADO`, `DUPLICADO` o `FALLIDO`. Un lote puede contener resultados distintos para cada evento.

**Conservación en el dispositivo**

- **FR-007**: El sistema NO DEBE eliminar ningún evento de la cola del dispositivo hasta recibir del servidor una confirmación explícita de ese evento (`SINCRONIZADO` o `DUPLICADO`).
- **FR-008**: Los eventos `FALLIDO`, sean transitorios o definitivos, DEBEN permanecer en el dispositivo y no pueden eliminarse sin confirmación del servidor.
- **FR-009**: Los eventos confirmados (`SINCRONIZADO` o `DUPLICADO`) DEBEN salir de la cola de envío y dejar de contar como pendientes. Deben seguir siendo consultables en la bandeja del usuario con su estado de sincronización final (HU-02 FR-011).
- **FR-010**: La sincronización NO DEBE alterar ningún dato capturado del evento (incluidos `client_event_id`, hora original de captura, autor, finca, estado de validación e indicador de verificación de autor). Solo cambia su estado de sincronización.

**Idempotencia y registro en el servidor**

- **FR-011**: El servidor DEBE identificar cada evento exclusivamente por su `client_event_id` y garantizar que exista como máximo un registro por `client_event_id`, incluso ante reenvíos, lotes con repetidos o envíos simultáneos.
- **FR-012**: Si un evento recibido ya existe en el servidor con el mismo `client_event_id` y el mismo contenido, el servidor DEBE responder `DUPLICADO`, sin crear un segundo registro ni modificar el existente.
- **FR-013**: Si un evento recibido usa un `client_event_id` ya registrado pero con contenido distinto, el servidor DEBE conservar el registro original sin cambios, responder `FALLIDO` definitivo con el motivo "identificador ya usado con datos distintos" y registrar el intento para auditoría.
- **FR-014**: El servidor DEBE procesar cada evento de un lote de forma independiente: el fallo de un evento no impide registrar los demás del mismo lote.
- **FR-015**: El servidor DEBE conservar para cada evento sincronizado su hora original de captura en campo (nunca reemplazada por la hora de llegada) y además registrar el momento de recepción en el servidor.
- **FR-016**: El servidor DEBE registrar los eventos sincronizados de forma append-only: nunca actualiza ni borra un evento ya registrado como efecto de una sincronización (constitución §3).
- **FR-017**: El servidor DEBE validar cada evento recibido: datos obligatorios por tipo según HU-02 FR-015, y finca y autor válidos. Los eventos inválidos se responden `FALLIDO` definitivo con un motivo concreto, sin guardarse. Se exceptúan los eventos de la captura preliminar (HU-02 FR-019), que se aceptan aunque les falten datos que hoy son obligatorios.
- **FR-017b**: Si la fecha de captura de un evento es posterior a la hora del servidor en más de 5 minutos, el servidor DEBE registrarlo igualmente, marcarlo como "hora pendiente de revisión" y responder `SINCRONIZADO`. Un reloj de dispositivo adelantado no debe causar pérdida de registros.
- **FR-018**: El servidor DEBE conservar en el registro sincronizado el estado de validación `PENDIENTE_VALIDACION` y el indicador de verificación de autor pendiente con los que llega el evento. Las transiciones de validación corresponden a HU-04.

**Seguridad y acceso**

- **FR-019**: Solo un usuario autenticado DEBE poder sincronizar, y solo eventos de los que es autor y que pertenecen a una finca a la que tiene acceso (HU-01, mínimo privilegio). Los eventos que no cumplan esto se responden `FALLIDO` definitivo con motivo.
- **FR-020**: Si la sesión es inválida o ha vencido al sincronizar, el sistema DEBE pausar el envío sin marcar eventos como fallidos definitivos y reanudarlo automáticamente tras un nuevo inicio de sesión válido.

**Reintentos progresivos**

- **FR-021**: El sistema DEBE clasificar cada fallo como **transitorio** (sin conexión, sin respuesta a tiempo, servidor no disponible o saturado) o **definitivo** (el servidor rechaza el evento por datos inválidos, falta de permiso o identificador usado con otro contenido), e informar el motivo.
- **FR-022**: Los eventos `FALLIDO` transitorios DEBEN reintentarse automáticamente con espera exponencial progresiva: el primer reintento a los 2 segundos aproximadamente, duplicando la espera en cada intento fallido consecutivo hasta un tope de 15 minutos, con una variación aleatoria de hasta ±50 % sobre cada espera.
- **FR-023**: El sistema NO DEBE abandonar automáticamente un evento `FALLIDO` transitorio: los reintentos continúan, con la espera topada en 15 minutos, mientras el evento no reciba confirmación.
- **FR-024**: Cuando un reintento obtiene confirmación del servidor, la espera progresiva DEBE reiniciarse para los siguientes fallos.
- **FR-025**: Los eventos `FALLIDO` definitivos NO DEBEN reintentarse automáticamente. Permanecen en el dispositivo con su motivo visible. Su resolución (corrección mediante evento nuevo vinculado o revisión) corresponde a HU-04 o a soporte, y queda fuera de esta HU.
- **FR-026**: Cuando el dispositivo pierde la conexión, el sistema DEBE suspender los reintentos sin consumir intentos, y retomarlos al recuperarla (FR-001).

**Visibilidad**

- **FR-027**: El monitor de conectividad del App Shell DEBE mostrar en todo momento el número de eventos aún no confirmados por el servidor (pendientes, en envío y fallidos) e indicar cuándo hay una sincronización en curso.
- **FR-028**: El detalle de un evento `FALLIDO` DEBE mostrar en lenguaje claro el motivo, si es transitorio o definitivo y, si es transitorio, el momento aproximado del próximo intento.
- **FR-029**: El sistema DEBE dejar constancia de cada ejecución de sincronización (inicio, fin, eventos enviados y resultado por estado) para diagnóstico y para medir los SLO de esta HU.

### Requisitos de Experiencia y Entorno (UI, Responsive y Campo)

- **UI-001**: La acción "Sincronizar ahora" y el acceso al detalle de eventos fallidos DEBEN tener un área táctil mínima de 48x48 px y alto contraste legible bajo luz solar en móvil (< 768 px).
- **UI-002**: Esta HU no agrega una nueva entrada al Menú Lateral. El estado de sincronización se integra en el monitor de conectividad del App Shell y en la bandeja de pendientes de HU-02, visible para los roles que capturan (`OPERARIO`, `VETERINARIO`).
- **UI-003**: Los estados de sincronización DEBEN mostrarse con texto explícito y no solo con color: "Pendiente de sincronización", "Enviando", "Sincronizado", "Duplicado (ya estaba en el servidor)" y "Fallido".
- **UI-004**: La sincronización NUNCA DEBE bloquear la captura de nuevos eventos (constitución §5.4, degradación elegante). El operario puede seguir capturando mientras se envía.

### Entidades Clave

- **Evento sanitario capturado** (definido en HU-02): registro de una intervención sanitaria hecha en campo, identificado por su `client_event_id`. Esta HU solo cambia su estado de sincronización.
- **Estado de sincronización del evento**: `PENDIENTE_SINCRONIZACION` → "en envío" → `SINCRONIZADO` | `DUPLICADO` | `FALLIDO` (transitorio o definitivo). Un `FALLIDO` transitorio vuelve a envío en su próximo reintento. Lleva asociados el número de intentos, el momento del próximo intento y el motivo del último fallo.
- **Lote de sincronización**: conjunto de hasta 50 eventos enviados juntos en un mismo intento. Tiene un resultado individual por evento.
- **Resultado por evento**: respuesta del servidor para un `client_event_id`: `SINCRONIZADO`, `DUPLICADO` o `FALLIDO` (con motivo y su clasificación transitorio/definitivo).
- **Evento sincronizado (registro del servidor)**: copia única e inmutable del evento en el servidor, con todos sus datos de captura, el momento de recepción y su estado de validación.
- **Registro de ejecución de sincronización**: constancia de cada ejecución (inicio, fin, número de eventos y resultados por estado) y de los intentos con identificador repetido y contenido distinto.

## Criterios de Éxito y Metas de Servicio (SLO) *(obligatorio)*

### Resultados Medibles

- **SC-001**: En una prueba de corte simulado de 24 horas con al menos 200 eventos capturados, el 100 % de los eventos válidos quedan registrados en el servidor al volver la conexión, con cero pérdidas y cero duplicados.
- **SC-002 (Idempotencia)**: En 100 reenvíos forzados de eventos ya sincronizados (cortes a mitad de respuesta), el 100 % obtienen `DUPLICADO` y el servidor conserva exactamente un registro por `client_event_id`.
- **SC-003 (Resultados parciales)**: En un lote con 2 de 10 eventos con fallo transitorio, exactamente 8 quedan confirmados y exactamente 2 permanecen en cola. Ningún evento confirmado se reenvía.
- **SC-004 (SLO Latencia de arranque)**: La sincronización automática empieza en menos de 30 segundos después de que el dispositivo recupera la conexión.
- **SC-005 (SLO Volumen)**: Con 1.000 eventos pendientes (volumen máximo de HU-02) y una conexión móvil rural estable, el 100 % queda confirmado en menos de 5 minutos.
- **SC-006 (SLO Integridad)**: El 99,9 % de las ejecuciones de sincronización terminan con todos los eventos válidos confirmados o en cola para reintento. El 0 % de los eventos se pierde (constitución §5.4).
- **SC-007 (Reintentos)**: Ante fallos transitorios consecutivos, cada espera es mayor que la anterior hasta el tope de 15 minutos, y en una simulación de 100 dispositivos reconectados a la vez, ningún segundo concentra más del 10 % de los reintentos.
- **SC-008 (Captura sin bloqueo)**: Durante una sincronización en curso, guardar un nuevo evento sigue confirmándose en menos de 2 segundos (HU-02 SC-001).
- **SC-009 (Visibilidad)**: Al menos el 90 % de los operarios en una prueba de uso identifican, sin ayuda, si sus eventos ya llegaron al servidor y cuáles fallaron.

## Supuestos y Restricciones de Dominio

- **Dependencia de HU-02**: los eventos a sincronizar son los capturados por HU-02 (`offline_capture`), con su `client_event_id`, su hora de captura inmutable y sus dos estados independientes. Esta HU solo gestiona el estado de sincronización. El estado de validación lo gestiona HU-04.
- **Dependencia de HU-01**: la autenticación, la sesión offline, la finca activa y los roles provienen de HU-01. La sincronización usa la sesión del autor de los eventos.
- **Conectividad**: operación rural intermitente. "Recuperar la conectividad" significa que el dispositivo puede alcanzar al servidor, no solo que tiene señal.
- **Tamaño de lote**: 50 eventos por lote es un valor por defecto razonable para conexiones rurales lentas. El plan puede ajustarlo sin cambiar el comportamiento observable.
- **Parámetros de reintento**: espera inicial de unos 2 segundos, duplicación por intento, tope de 15 minutos y variación aleatoria de ±50 %. Son valores por defecto de la industria para clientes móviles y el plan puede ajustarlos con justificación.
- **Fallos definitivos**: se adopta que la HU nombra un único estado `FALLIDO` y que se distingue internamente entre transitorio (se reintenta) y definitivo (no se reintenta y queda visible). Un evento definitivo nunca se borra del dispositivo. Su resolución queda fuera de alcance.
- **Identificador repetido con contenido distinto**: se trata como rechazo definitivo y no como `DUPLICADO`, para no confirmar al dispositivo datos que el servidor no guardó (append-only, constitución §3).
- **Reloj**: el control de fecha futura en el servidor usa la hora del servidor con 5 minutos de tolerancia. Fuera de esa tolerancia el evento se registra con la marca "hora pendiente de revisión", en lugar de rechazarse (FR-017b, alineado con el contrato de HU-02). Detectar relojes manipulados queda fuera de alcance.
- **SINIGÁN V6**: esta HU no consulta ni compara con SINIGÁN. Las divergencias de identidad se gestionan en HU-05.
- **Aislamiento modular**: la HU vive en `features/offline_sync` (constitución §2). Lo que necesite de la cola local de HU-02 o del registro de eventos del servidor se coordina con sus responsables, sin modificar sus módulos.
- **Fuera de alcance**: sincronización del servidor hacia el dispositivo (descarga de cambios), resolución de eventos `FALLIDO` definitivos, validación veterinaria y correcciones (HU-04), conflictos con SINIGÁN (HU-05) y telemetría de collares IoT.
