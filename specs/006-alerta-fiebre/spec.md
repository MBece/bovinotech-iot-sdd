# Especificación Funcional: Detección Automática de Fiebre Bovina y Alertas Sanitarias (HU-06)

**Rama de Funcionalidad**: `006-alerta-fiebre`

**Fecha**: 2026-11-19

**Estado**: Borrador (Draft)

**Entrada**: Cuando un collar IoT envíe una lectura de temperatura corporal mayor a 39.5 °C asociada a un código SINIGÁN (`sinigan_code`), el sistema debe generar automáticamente una alerta sanitaria crítica de fiebre bovina, mostrarla en el panel del Veterinario y permitir marcarla como atendida mediante un evento nuevo (append-only, sin borrar ni editar la alerta original).

---

## Escenarios de Usuario y Pruebas

### Historia de Usuario 1 - Detección y Generación Automática de Alerta Crítica (Prioridad: P1) 🎯 MVP

Como sistema de monitoreo ganadero, quiero evaluar continuamente las lecturas telemétricas de temperatura corporal de los collares IoT para detectar oportunamente cuadros febriles que pongan en riesgo la salud del hato.

**Por qué esta prioridad**: La fiebre es el principal indicador temprano de enfermedades infecciosas bovinas (como anaplasmosis, babesiosis o fiebre aftosa). Detectarla a tiempo evita la propagación y pérdidas económicas.

**Prueba Independiente**: Se puede probar enviando lecturas telemétricas simuladas (por encima y por debajo de 39.5 °C) y verificando que únicamente las lecturas que superen dicho umbral originen una alerta sanitaria crítica asociada al código SINIGÁN del bovino.

**Escenarios de Aceptación**:

1. **Given** un collar IoT asignado a un bovino con código SINIGÁN válido, **When** el collar emite una lectura con temperatura corporal de 39.8 °C (> 39.5 °C), **Then** el sistema genera de forma automática una alerta sanitaria con nivel de severidad CRÍTICA, tipo "FIEBRE_BOVINA" y estado "ACTIVA", vinculada al código SINIGÁN correspondiente y con la marca de tiempo de la medición.
2. **Given** un collar IoT asignado a un bovino con código SINIGÁN válido, **When** el collar emite una lectura con temperatura corporal de 38.6 °C (≤ 39.5 °C), **Then** el sistema registra la telemetría rutinaria y NO genera ninguna alerta sanitaria.
3. **Given** un collar IoT en el umbral límite, **When** emite una lectura de exactamente 39.5 °C, **Then** el sistema no genera alerta de fiebre (el umbral estricto es > 39.5 °C).

---

### Historia de Usuario 2 - Visualización y Atención Veterinaria Append-Only (Prioridad: P1)

Como Veterinario de la finca, quiero visualizar las alertas críticas de fiebre en mi panel de control y registrar la atención médica sin alterar ni eliminar la alerta original, para garantizar una auditoría inmutable de las intervenciones sanitarias.

**Por qué esta prioridad**: Cumple la regla innegociable de historial solo-anexión (append-only) y asegura que el personal clínico calificado dé trámite a las anomalías detectadas en campo.

**Prueba Independiente**: Se puede probar simulando el flujo de inicio de sesión de un Veterinario, listando las alertas activas, emitiendo una acción de atención médica y comprobando que el registro original de la alerta permanece idéntico en el historial mientras que se añade un nuevo evento de atención enlazado.

**Escenarios de Aceptación**:

1. **Given** una alerta crítica de fiebre en estado "ACTIVA", **When** el Veterinario autenticado consulta su panel sanitario, **Then** el sistema lista la alerta destacando el código SINIGÁN, la temperatura registrada, la hora de detección y el estado activo.
2. **Given** una alerta crítica de fiebre visible en el panel, **When** el Veterinario ingresa un diagnóstico/tratamiento y confirma la atención, **Then** el sistema registra un nuevo evento de "ATENCIÓN_SANITARIA" que referencia el identificador de la alerta original, dejando la alerta en estado atendido sin sobreescribir ni eliminar el evento inicial.
3. **Given** un usuario con rol de Operario autenticado, **When** intenta marcar como atendida una alerta sanitaria crítica, **Then** el sistema rechaza la operación por falta de permisos clínicos (acceso restringido a Veterinarios).

---

### Historia de Usuario 3 - Encolamiento Fuera de Línea y Sincronización Diferida (Prioridad: P2)

Como operario de campo y dispositivo IoT en potreros sin cobertura celular, quiero que las lecturas telemétricas se conserven en una cola local y se sincronicen al recuperar conexión, para que ninguna alerta de fiebre se pierda por problemas de conectividad rural.

**Por qué esta prioridad**: El entorno ganadero rural tiene conectividad intermitente. Sin capacidad de cola offline, los episodios de fiebre ocurridos en zonas remotas de la finca pasarían desapercibidos.

**Prueba Independiente**: Se puede probar desconectando la red del nodo/dispositivo recolector, generando lecturas de fiebre (> 39.5 °C) en la cola local, restableciendo la conexión y verificando que las alertas se sincronicen e ingresen al sistema respetando la marca de tiempo de captura original.

**Escenarios de Aceptación**:

1. **Given** un receptor o dispositivo colector sin conexión a la red central, **When** recibe lecturas del collar con temperatura de 40.1 °C, **Then** la lectura se guarda de forma segura en la cola local con un identificador único de captura (`client_event_id`).
2. **Given** lecturas febriles acumuladas en la cola local, **When** se restablece el enlace de comunicaciones, **Then** el sistema transmite los datos encolados, procesa las alertas con la marca de tiempo original y descarta duplicados si la misma lectura ya había sido recibida previamente (idempotencia).

---

### Casos de Borde (Edge Cases)

- **Lecturas consecutivas repetitivas**: Si un collar continúa transmitiendo lecturas > 39.5 °C cada minuto para el mismo animal, ¿cómo se evita saturar el panel? El sistema debe asociar las lecturas continuas a la alerta activa existente dentro de una ventana de tiempo configurable (por ejemplo, 6 horas) o consolidar el episodio febril, evitando generar una nueva alerta duplicada por cada paquete recibido mientras la anterior siga abierta.
- **Identificador SINIGÁN no reconocido**: Si el collar transmite una temperatura > 39.5 °C pero el código SINIGÁN no existe o no está registrado en el inventario oficial, el sistema debe registrar una alerta de telemetría no conciliada y dirigirla a la cola de resolución de conflictos para verificación humana.
- **Lectura fuera de rango biológico creíble**: Si el collar transmite un valor anómalo extremo (por ejemplo, 65.0 °C o 15.0 °C por falla del sensor), el sistema debe registrar una alerta de fallo instrumental de hardware sin clasificarla como fiebre biológica.
- **Llegada tardía de eventos fuera de línea**: Si una lectura de fiebre capturada hace 12 horas llega tras un restablecimiento de red prolongado, el sistema debe generar la alerta señalando de forma explícita que corresponde a un "Evento Histórico Retrasado" con la marca temporal real de campo.

---

## Requisitos

### Requisitos Funcionales

- **FR-001**: El sistema DEBE recibir paquetes de telemetría IoT que incluyan: identificador del dispositivo/collar, código SINIGÁN (`sinigan_code`), temperatura corporal registrada (°C), marca de tiempo de captura y un identificador único de evento de cliente (`client_event_id`).
- **FR-002**: El sistema DEBE evaluar de forma automática la temperatura corporal recibida; si el valor es estrictamente superior a 39.5 °C, DEBE emitir inmediatamente una alerta sanitaria crítica de tipo `FIEBRE_BOVINA`.
- **FR-003**: El sistema DEBE vincular de forma inequívoca la alerta sanitaria al código oficial `sinigan_code` del animal correspondiente.
- **FR-004**: El sistema DEBE publicar las alertas críticas de fiebre en el panel de control accesible por usuarios con rol de `VETERINARIO`.
- **FR-005**: El sistema DEBE permitir exclusivamente a usuarios con rol `VETERINARIO` marcar una alerta de fiebre como "Atendida", requiriendo ingresar notas clínicas, tratamiento prescrito o diagnóstico preliminar.
- **FR-006**: El sistema DEBE implementar la atención de alertas bajo el principio de **historial append-only**: la alerta inicial permanece inmutable; la atención se materializa mediante la creación de un nuevo evento de atención sanitaria que referencia el identificador de la alerta original (`referenced_alert_id`).
- **FR-007**: Queda TERMINANTEMENTE PROHIBIDO ejecutar operaciones de eliminación física (DELETE) o sobreescritura destructiva (UPDATE) sobre las alertas sanitarias y sus eventos de resolución.
- **FR-008**: El sistema DEBE garantizar idempotencia en la ingesta: dos lecturas con el mismo `client_event_id` no deben generar alertas duplicadas.

### Requisitos No Funcionales

- **NFR-001 (SLO de Latencia de Procesamiento)**: El tiempo transcurrido desde que el sistema central recibe el paquete de telemetría con temperatura > 39.5 °C hasta que la alerta crítica está disponible en el panel del Veterinario DEBE ser inferior a **10 segundos** en condiciones normales de conectividad.
- **NFR-002 (Soporte Offline y Encolamiento)**: Los componentes de recolección en campo DEBEN disponer de un mecanismo de cola local capaz de almacenar lecturas telemétricas cuando no haya conexión y enviarlas en lote de manera confiable al reanudarse el enlace.
- **NFR-003 (Integridad y Trazabilidad)**: Cada registro de alerta y atención debe incluir sello de tiempo (timestamp) en formato UTC estandarizado y registro del usuario o servicio emisor.
- **NFR-004 (Control de Acceso)**: Todo intento de marcar alertas sanitarias como atendidas por parte de roles no autorizados (como Operario o visitantes) debe ser rechazado con denegación de acceso.

---

### Entidades Clave

- **LecturaTelemetriaIoT**: Registro puntual de mediciones emitidas por el collar. Atributos: identificador de evento único (`client_event_id`), identificador de collar, código SINIGÁN, temperatura corporal (°C), fecha y hora de medición.
- **AlertaSanitariaFiebre**: Evento de anomalía biológica detectada. Atributos: identificador único de alerta, código SINIGÁN, temperatura detonante, nivel de severidad (CRÍTICA), tipo (`FIEBRE_BOVINA`), fecha y hora de emisión, estado (ACTIVA, ATENDIDA).
- **EventoAtencionAlerta**: Evento sanitario append-only que resuelve o atiende una alerta previa. Atributos: identificador del evento de atención, identificador de la alerta referenciada (`referenced_alert_id`), identificación del Veterinario responsable, fecha y hora de atención, notas clínicas y acciones terapéuticas aplicadas.

---

## Criterios de Éxito

### Resultados Medibles

- **SC-001**: El 100% de las lecturas telemétricas válidas con temperatura superior a 39.5 °C generan una alerta crítica asociada al código SINIGÁN.
- **SC-002**: Cumplimiento del SLO: Al menos el 99% de las alertas generadas en línea se ponen a disposición del panel veterinario en un tiempo inferior a 10 segundos tras la ingesta.
- **SC-003**: Cero (0%) registros de alertas o atenciones eliminados o sobreescritos en el historial de eventos sanitarios (100% append-only verificado).
- **SC-004**: Cero (0%) alertas duplicadas generadas ante reenvíos de telemetría desde la cola offline para el mismo `client_event_id`.
- **SC-005**: El 100% de los intentos de atención de alertas por parte de usuarios con rol distinto a Veterinario son rechazados por el control de acceso.

---

## Supuestos

- Los sensores de los collares IoT transmiten valores calibrados de temperatura corporal en grados Celsius (°C).
- Cada collar IoT en operación está previamente asociado a un código SINIGÁN válido del hato.
- La interfaz del Veterinario consulta periódicamente o recibe en tiempo real las alertas sanitarias generadas.
- En caso de cortes de energía o conectividad en campo, los nodos de recolección cuentan con almacenamiento local no volátil para preservar la cola de eventos.
