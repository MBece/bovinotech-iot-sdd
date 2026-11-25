# Especificación de Funcionalidad: Registro genealógico y advertencia preventiva de consanguinidad

**Rama de Funcionalidad**: `feat/hu-07-genealogy`

**Fecha de Creación**: 2026-11-24

**Estado**: Draft

**Entrada**: Descripción de usuario: "HU-07 — Como veterinario quiero registrar los progenitores de cada bovino y evaluar el grado de parentesco ante un posible cruce, para prevenir riesgos de consanguinidad en el hato. Reglas: un animal no puede ser su propio ancestro y la fecha de nacimiento de padre y madre debe ser anterior a la de la cría; el árbol se despliega hasta 3 generaciones cuando existan registros; si faltan ancestros se indica `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` y nunca se asume consanguinidad cero como certeza."

## Clarifications

### Session 2026-11-24

- Q: ¿El OPERARIO puede proponer vínculos de progenitores en campo o el registro es exclusivo del VETERINARIO? → A: El OPERARIO puede proponer vínculos en campo; quedan `PENDIENTE_VALIDACION` hasta que un VETERINARIO los valida. Los vínculos registrados por un VETERINARIO quedan `VALIDADO` (FR-019, FR-020).
- Q: ¿"Hasta 3 generaciones" para el cálculo de consanguinidad se cuenta desde cada candidato al cruce o desde la cría hipotética? → A: Desde cada candidato al cruce: se consideran padres, abuelos y bisabuelos de cada uno, de modo que se detectan primos segundos (Supuestos, Ventana de cálculo; FR-012).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Registrar progenitores con validación genealógica (Prioridad: P1)

Como veterinario quiero registrar quién es el padre y quién es la madre de cada bovino de mi finca, de modo que el sistema rechace vínculos biológicamente imposibles (progenitor más joven que la cría, sexo incompatible o ciclos genealógicos), para construir un registro genealógico confiable.

**Rol y Dispositivo Objetivo**: VETERINARIO en escritorio o en smartphone de campo (por ejemplo, al momento de un parto en potrero). OPERARIO como capturador de propuestas en campo, pendientes de validación veterinaria (ver Clarifications).

**Por qué esta prioridad**: Sin vínculos de parentesco válidos no existe árbol genealógico ni es posible evaluar la consanguinidad; es la base de las demás historias.

**Prueba Independiente**: Con las fichas genealógicas semilla de la finca, registrar padre y madre de una cría; luego intentar registrar un progenitor nacido después de la cría, un progenitor de sexo incompatible y un vínculo que forme un ciclo, y comprobar que los tres intentos son rechazados con un motivo comprensible y que el vínculo válido queda registrado con su autor y fecha.

**Escenarios de Aceptación**:

1. **Given** una cría con ficha genealógica y un macho y una hembra nacidos antes que ella en la misma finca, **When** el veterinario registra al macho como padre y a la hembra como madre, **Then** ambos vínculos quedan registrados con autor, fecha de registro y estado de validación.
2. **Given** un animal nacido después de la cría (o el mismo día), **When** se intenta registrar como su padre o su madre, **Then** el sistema rechaza el registro indicando que la fecha de nacimiento del progenitor debe ser anterior a la de la cría. *(Criterio de aceptación 4 de la HU)*
3. **Given** un animal que es descendiente de la cría (hijo, nieto o cualquier generación posterior) o la propia cría, **When** se intenta registrar como su progenitor, **Then** el sistema rechaza el registro por formar un ciclo genealógico. *(Criterio de aceptación 4 de la HU)*
4. **Given** una hembra, **When** se intenta registrar como padre de una cría (o un macho como madre), **Then** el sistema rechaza el registro por sexo incompatible con el rol de progenitor.
5. **Given** que el dispositivo no tiene conectividad, **When** el usuario registra un vínculo de progenitor, **Then** el registro queda guardado localmente como pendiente de sincronización y, al reconectar, se consolida una sola vez aunque se reintente varias veces.
6. **Given** una cría con padre ya registrado, **When** el veterinario necesita cambiar el padre (por ejemplo, tras una prueba de parentesco), **Then** registra una corrección con motivo obligatorio que reemplaza al vínculo vigente, y el vínculo anterior permanece visible en el historial como corregido, sin borrarse ni modificarse.

---

### Historia de Usuario 2 - Consultar el árbol genealógico de tres generaciones (Prioridad: P1)

Como veterinario quiero ver el árbol genealógico de un bovino con sus padres, abuelos y bisabuelos, indicando el estado de validación de cada vínculo y los ancestros que no están registrados, para conocer su ascendencia antes de tomar decisiones reproductivas.

**Rol y Dispositivo Objetivo**: VETERINARIO en escritorio; OPERARIO, ADMINISTRADOR y DIRECTIVO en consulta de solo lectura dentro de su finca activa.

**Por qué esta prioridad**: Es la visualización que hace verificable el registro genealógico y la que el veterinario usa para comprender una advertencia de consanguinidad.

**Prueba Independiente**: Consultar un animal del árbol semilla de tres generaciones completas y otro con ancestros faltantes; comprobar que el primero muestra los 14 ancestros con su estado de vínculo y que el segundo muestra explícitamente cada posición faltante como "No registrado".

**Escenarios de Aceptación**:

1. **Given** un bovino con padre y madre registrados, **When** se consulta su genealogía, **Then** se visualiza su árbol genealógico de hasta tres generaciones (padres, abuelos y bisabuelos) con el estado de validación de cada vínculo. *(Criterio de aceptación 1 de la HU)*
2. **Given** un bovino al que le faltan ancestros dentro de las tres generaciones, **When** se consulta su genealogía, **Then** cada posición faltante se muestra explícitamente como "No registrado" y el árbol se identifica como incompleto, sin ocultar ni inventar ancestros.
3. **Given** un bovino con ancestros registrados más allá de la tercera generación, **When** se consulta su genealogía, **Then** el árbol se limita a tres generaciones.
4. **Given** un vínculo que fue corregido, **When** se consulta el árbol, **Then** se muestra únicamente el progenitor vigente y el historial de vínculos del animal permite ver el vínculo anterior, su autor y el motivo de la corrección.

---

### Historia de Usuario 3 - Evaluar un cruce y el indicador de consanguinidad (Prioridad: P2)

Como veterinario quiero evaluar un cruce propuesto entre un macho y una hembra, y consultar el indicador de consanguinidad de un animal, para recibir una advertencia preventiva con el ancestro común y el coeficiente estimado, y nunca interpretar la falta de datos como ausencia de riesgo.

**Rol y Dispositivo Objetivo**: VETERINARIO en escritorio o smartphone; DIRECTIVO en consulta.

**Por qué esta prioridad**: Es el valor preventivo de la historia, pero depende de que existan vínculos registrados (Historias 1 y 2).

**Prueba Independiente**: Evaluar con los datos semilla un cruce entre medios hermanos, un cruce entre animales sin ancestros comunes con árbol completo y un cruce con un animal sin ancestros registrados; comprobar respectivamente la advertencia con ancestro común y coeficiente, el resultado sin advertencia con cálculo completo y el aviso de datos insuficientes sin mostrar `0 %` como dato confirmado.

**Escenarios de Aceptación**:

1. **Given** una propuesta de cruce entre dos animales que comparten ancestros dentro de las generaciones registradas, **When** se evalúa el cruce, **Then** el sistema emite una advertencia de consanguinidad que detalla cada ancestro común, el parentesco por el que se comparte y el coeficiente estimado de la cría resultante. *(Criterio de aceptación 2 de la HU)*
2. **Given** un animal sin ancestros registrados en el sistema, **When** se solicita su indicador de consanguinidad, **Then** el sistema informa `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` y que los datos son insuficientes, en lugar de mostrar `0 %` como dato confirmado. *(Criterio de aceptación 3 de la HU)*
3. **Given** una propuesta de cruce en la que alguno de los dos animales tiene ancestros faltantes dentro de las tres generaciones y no se detectan ancestros comunes, **When** se evalúa el cruce, **Then** el resultado se marca `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`, indica qué ancestros faltan y no presenta el coeficiente como cero confirmado.
4. **Given** una propuesta de cruce con ancestros comunes detectados pero con ancestros faltantes, **When** se evalúa el cruce, **Then** se emite la advertencia con el coeficiente calculado presentado como valor mínimo estimado y el estado `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`.
5. **Given** una propuesta de cruce entre dos animales con árboles completos de tres generaciones y sin ancestros comunes, **When** se evalúa el cruce, **Then** el sistema informa que no se detectan ancestros comunes dentro de las generaciones evaluadas, con cálculo completo.
6. **Given** una propuesta de cruce en la que un candidato es ancestro del otro (por ejemplo, padre e hija), **When** se evalúa el cruce, **Then** el sistema emite la advertencia identificando al candidato ancestro como ancestro común.

---

### Casos de Borde y Condiciones Rurales

- **Sin conectividad**: el registro de vínculos de progenitores debe poder capturarse sin internet y sincronizarse después sin duplicados; un mismo registro reenviado varias veces produce un único vínculo. Si al sincronizar el vínculo resulta inválido (por ejemplo, otro usuario registró antes un progenitor que lo hace inconsistente), el registro local se marca como rechazado con su motivo visible y no se pierde de la bandeja local.
- **Consulta y evaluación sin conectividad**: la consulta del árbol y la evaluación de cruces requieren datos del servidor; sin conexión, el sistema muestra el último resultado consultado identificado como "dato en caché" con su fecha, o informa que la evaluación no está disponible, sin bloquear la captura de vínculos.
- **Jerarquía de la fuente oficial (SINIGÁN V6)**: el animal se identifica siempre por su identificador oficial (DIN). El registro genealógico no crea, modifica ni sustituye la identificación oficial del animal; si una ficha genealógica difiere de la fuente oficial, no se sobrescribe ninguna de las dos de forma automática.
- **Historial append-only**: los vínculos de progenitores nunca se borran ni se modifican; un cambio de progenitor se registra como un nuevo vínculo enlazado al anterior mediante `corrected_event_id` con motivo obligatorio.
- **Mismo día de nacimiento**: un progenitor nacido el mismo día que la cría se rechaza (la fecha debe ser estrictamente anterior).
- **Progenitor igual a la cría**: un animal no puede ser registrado como su propio padre o madre.
- **Mismo animal como padre y madre**: imposible por la regla de sexo; se rechaza.
- **Ciclos profundos**: la validación anti-ciclos considera toda la descendencia registrada de la cría, no solo tres generaciones.
- **Cruce de un animal consigo mismo o entre dos animales del mismo sexo**: la evaluación se rechaza por solicitud inválida.
- **Animal de otra finca**: un usuario no puede consultar, evaluar ni vincular animales que no pertenezcan a su finca activa; la respuesta no revela su existencia.
- **Reproductores externos** (por ejemplo, toros de inseminación): se registran como ficha genealógica en la finca para poder vincularlos como padre.
- **Tiempo de retiro**: esta funcionalidad no registra tratamientos ni comercializa animales; la vista genealógica no requiere semáforo de tiempo de retiro mientras no muestre información sanitaria (ver Supuestos).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE mantener una ficha genealógica por animal de la finca, identificada por su DIN, con nombre, sexo (macho o hembra) y fecha de nacimiento obligatoria.
- **FR-002**: El sistema DEBE permitir registrar, para cada animal, como máximo un padre vigente y una madre vigente, cada uno como un vínculo independiente con autor, fecha de registro y estado de validación.
- **FR-003**: El sistema DEBE rechazar un vínculo de progenitor cuya fecha de nacimiento no sea estrictamente anterior a la fecha de nacimiento de la cría.
- **FR-004**: El sistema DEBE rechazar un vínculo de progenitor que convierta a un animal en su propio ancestro, considerando toda la genealogía registrada (validación anti-ciclos sin límite de generaciones).
- **FR-005**: El sistema DEBE rechazar como padre a un animal que no sea macho y como madre a un animal que no sea hembra.
- **FR-006**: El sistema DEBE rechazar vínculos donde la cría o el progenitor no tengan ficha genealógica en la finca activa del usuario.
- **FR-007**: Todo rechazo DEBE informar al usuario un motivo específico y comprensible (fecha, ciclo, sexo, animal inexistente o progenitor ya registrado).
- **FR-008**: Los vínculos registrados DEBEN ser inmutables (append-only). Un cambio de progenitor DEBE registrarse como un nuevo vínculo enlazado al vigente mediante `corrected_event_id`, con motivo obligatorio, y el nuevo vínculo DEBE superar las mismas validaciones. El vínculo anterior DEBE permanecer consultable en el historial.
- **FR-009**: Todo registro de vínculo capturado sin conexión DEBE sincronizarse de forma idempotente mediante un identificador único de cliente (`client_event_id`); reenviar el mismo registro NO DEBE crear vínculos duplicados.
- **FR-010**: El sistema DEBE presentar el árbol genealógico de un animal hasta tres generaciones de ancestros (padres, abuelos y bisabuelos), mostrando para cada posición el animal, su sexo, su fecha de nacimiento y el estado de validación del vínculo, o la indicación explícita "No registrado".
- **FR-011**: El sistema DEBE indicar si el árbol de tres generaciones de un animal está completo o incompleto, y cuántas posiciones faltan.
- **FR-012**: El sistema DEBE permitir evaluar un cruce propuesto entre un macho y una hembra de la finca activa, identificando todos los ancestros comunes presentes en los árboles de tres generaciones de ambos candidatos, incluido el caso en que un candidato sea ancestro del otro.
- **FR-013**: El sistema DEBE estimar el coeficiente de consanguinidad de la cría resultante del cruce propuesto a partir de los ancestros comunes y del número de generaciones que separan a cada candidato de cada ancestro común, y presentarlo como porcentaje.
- **FR-014**: El sistema DEBE emitir una advertencia de consanguinidad siempre que se detecte al menos un ancestro común, detallando cada ancestro común, su relación con cada candidato y el coeficiente estimado, junto con un nivel de riesgo (BAJO, MODERADO o ALTO).
- **FR-015**: Si falta cualquier ancestro dentro de las tres generaciones evaluadas de alguno de los candidatos, el sistema DEBE marcar el resultado como `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`, listar las posiciones faltantes y NO DEBE presentar un coeficiente de `0 %` como dato confirmado; si se detectaron ancestros comunes, el coeficiente DEBE presentarse como valor mínimo estimado.
- **FR-016**: El sistema DEBE ofrecer el indicador de consanguinidad de un animal existente, calculado como el coeficiente correspondiente al cruce de su padre y su madre; si el animal no tiene padre o madre registrados, DEBE informar `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` sin valor numérico.
- **FR-017**: La advertencia de consanguinidad DEBE ser preventiva e informativa: NO DEBE impedir que el veterinario tome su decisión reproductiva.
- **FR-018**: El sistema DEBE restringir el registro y la corrección de vínculos a los roles autorizados y a la finca activa del usuario; la consulta del árbol y la evaluación de cruces DEBEN limitarse a animales de la finca activa.
- **FR-019**: Los vínculos registrados por un rol distinto de VETERINARIO DEBEN quedar en estado `PENDIENTE_VALIDACION` hasta que un VETERINARIO los valide o los corrija; los registrados por un VETERINARIO quedan `VALIDADO`. El OPERARIO puede proponer vínculos de progenitores en campo.
- **FR-020**: La validación de un vínculo pendiente DEBE registrarse como un nuevo evento auditable (autor, fecha y decisión), sin modificar el vínculo original.
- **FR-021**: El sistema NO DEBE crear, modificar ni sobrescribir la identificación oficial del animal (DIN) proveniente de la fuente oficial.

### Requisitos de Experiencia y Entorno (UI, Responsive y Campo)

- **UI-001**: La interfaz móvil (< 768 px) DEBE permitir registrar progenitores con áreas táctiles mínimas de 48x48 px y alto contraste legible bajo luz solar; la búsqueda por número de arete/DIN DEBE facilitar entrada numérica.
- **UI-002**: La funcionalidad DEBE registrar su entrada en el Menú Lateral, mostrando las acciones de registro, validación y evaluación solo a los roles autorizados.
- **UI-003**: La captura de vínculos DEBE persistir localmente sin internet y reflejar los registros pendientes de sincronización y los rechazados con su motivo.
- **UI-004**: El árbol genealógico DEBE ser legible en móvil (por ejemplo, desplegable por generación) y en escritorio, distinguiendo visualmente vínculos validados, pendientes, corregidos y posiciones "No registrado".
- **UI-005**: La advertencia de consanguinidad DEBE destacarse visualmente según el nivel de riesgo, mostrar el texto del estado de cálculo (completo o `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`) y nunca mostrar "0 %" cuando el cálculo es parcial.

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **Ficha genealógica**: Representa a un bovino (o reproductor externo) de la finca para fines genealógicos: DIN oficial, nombre, sexo y fecha de nacimiento. No reemplaza la identificación oficial.
- **Vínculo de progenitor**: Hecho inmutable que declara que un animal es el padre o la madre de una cría; incluye autor, fecha de registro, identificador de cliente para sincronización, motivo y referencia al vínculo que corrige cuando aplica.
- **Validación de vínculo**: Decisión auditable de un veterinario sobre un vínculo pendiente, sin alterar el vínculo original.
- **Árbol genealógico**: Vista derivada de los vínculos vigentes de un animal hasta tres generaciones, con posiciones faltantes explícitas.
- **Evaluación de consanguinidad**: Resultado derivado (no almacenado como verdad) de un cruce propuesto o de un animal: ancestros comunes, coeficiente estimado, nivel de riesgo, estado de cálculo y ancestros faltantes.

## Criterios de Éxito y Metas de Servicio (SLO) *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100 % de los intentos de registrar un progenitor nacido el mismo día o después de la cría, de sexo incompatible o que forme un ciclo son rechazados con un motivo específico.
- **SC-002**: El 100 % de los árboles consultados muestran hasta tres generaciones con el estado de cada vínculo y marcan explícitamente cada posición faltante.
- **SC-003**: El 100 % de las evaluaciones de cruces con ancestros comunes dentro de las tres generaciones emiten advertencia con el ancestro común y el coeficiente estimado; los casos de referencia (hermanos completos 25 %, padre-hija 25 %, medios hermanos 12,5 %, primos hermanos 6,25 %) se reproducen exactamente.
- **SC-004**: El 0 % de las evaluaciones con ancestros faltantes muestra "0 %" como consanguinidad confirmada.
- **SC-005 (SLO Disponibilidad/Offline)**: El 100 % de los vínculos capturados sin conexión se conservan localmente y se consolidan una sola vez al reconectar, sin duplicados.
- **SC-006**: Ningún vínculo histórico desaparece ni cambia tras una corrección; el 100 % de las correcciones conserva el vínculo anterior, su autor y el motivo.
- **SC-007**: El veterinario obtiene el árbol de un animal o la evaluación de un cruce en menos de 2 segundos con conexión, y registra un progenitor en campo en menos de 30 segundos.

## Supuestos y Restricciones de Dominio

- **Conectividad**: la operación rural es intermitente; la captura de vínculos es offline-first y la consulta/evaluación usa el último dato disponible cuando no hay conexión.
- **Roles**: VETERINARIO registra, corrige y valida vínculos y evalúa cruces; OPERARIO consulta el árbol y propone vínculos en campo (pendientes de validación); ADMINISTRADOR y DIRECTIVO consultan árbol y evaluaciones en solo lectura. Todos limitados a su finca activa.
- **Fuente de verdad**: SINIGÁN V6 es la autoridad del identificador oficial (DIN). La fuente oficial simulada no expone parentesco ni fecha de nacimiento, por lo que la ficha genealógica es un registro de campo propio de esta funcionalidad; la conciliación de divergencias con la fuente oficial queda fuera del alcance de esta historia.
- **Fecha de nacimiento obligatoria**: un animal sin fecha de nacimiento conocida no puede vincularse como cría ni como progenitor, porque la regla de fechas no sería verificable.
- **Ventana de cálculo**: la evaluación de un cruce considera los padres, abuelos y bisabuelos de cada candidato (tres generaciones de cada uno). Las tres generaciones se cuentan desde cada candidato al cruce, por lo que se detectan ancestros comunes hasta el nivel de primos segundos.
- **Coeficiente estimado**: el coeficiente se considera "estimado" porque se limita a la ventana de generaciones registradas y no corrige por la consanguinidad propia de los ancestros comunes; por eso es un valor mínimo.
- **Niveles de riesgo** (referencia ganadera habitual): ALTO desde 12,5 %; MODERADO desde 6,25 % y por debajo de 12,5 %; BAJO por encima de 0 % y por debajo de 6,25 %.
- **Fichas genealógicas**: el alta de fichas proviene del conjunto semilla propio de la funcionalidad (incluido un árbol de tres generaciones para demostración) y del registro por el veterinario; la corrección de sexo o fecha de nacimiento de una ficha queda fuera de alcance.
- **Tiempo de retiro**: la vista genealógica no muestra ni decide sobre estado sanitario ni comercialización; el semáforo de tiempo de retiro corresponde a las vistas sanitarias de otras historias.
