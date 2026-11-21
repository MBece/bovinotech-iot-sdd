# Especificación de Funcionalidad: Identidad, Aprovisionamiento y Control de Acceso por Rol

**Rama de Funcionalidad**: `001-auth-rbac`

**Fecha**: 2026-11-18 (actualizada 2026-11-21: HU-01 ampliada a aprovisionamiento, cuatro roles, finca asignada y operación offline)

**Estado**: Draft

**Entrada**: Implementar la gestión de identidad, el aprovisionamiento administrativo de cuentas y el control de acceso por roles (RBAC) para BovinoTech IoT con cuatro perfiles: ADMINISTRADOR, OPERARIO, VETERINARIO y DIRECTIVO, cada uno asociado a una finca.

## Clarifications

### Session 2026-11-21

- Q: ¿Un usuario puede tener asignada más de una finca? → A: `OPERARIO` tiene exactamente una finca; `VETERINARIO` y `DIRECTIVO` pueden tener una o más. `ADMINISTRADOR` tiene exactamente una finca y solo aprovisiona y gestiona usuarios de esa finca. Quien tiene varias fincas elige la finca activa al iniciar sesión.
- Q: ¿Qué puede hacer `DIRECTIVO` además de consultar costos, y `ADMINISTRADOR` puede ver costos? → A: `DIRECTIVO` tiene solo lectura de costos, inventario e historial sanitario de su finca activa, sin escrituras. `ADMINISTRADOR` no accede a costos directivos.
- Q: ¿Cuánto tiempo puede operar offline una sesión y qué pasa al vencer? → A: 7 días desde el último inicio de sesión con conexión. Al vencer, la captura **no se bloquea** (constitución §5.4, Degradación Elegante): los eventos capturados después del vencimiento quedan marcados como "pendientes de verificación de autor" y se revalidan al sincronizar. Lo capturado antes del vencimiento se sincroniza normalmente. *(Revisada tras /speckit.analyze: la respuesta inicial bloqueaba la captura y contradecía la constitución.)*
- Q: ¿Cómo recibe su contraseña inicial un usuario recién aprovisionado? → A: El `ADMINISTRADOR` define una contraseña temporal; el usuario debe cambiarla obligatoriamente en su primer inicio de sesión y no puede operar hasta hacerlo.
- Q: ¿Qué pasa al sincronizar los eventos offline de un usuario deshabilitado mientras estaba sin conexión? → A: Se aceptan los eventos capturados antes de la fecha/hora de deshabilitación; los posteriores se rechazan y se reportan al `ADMINISTRADOR`.
- Q (revisión de seguridad): ¿Cómo se evita que un `ADMINISTRADOR` enumere o bloquee usuarios de otras fincas? → A: La asignación de finca adicional identifica al usuario por correo; las respuestas administrativas solo muestran la finca del administrador; y un usuario compartido entre fincas no puede ser deshabilitado por el administrador de una sola de ellas (`USER_SHARED_WITH_OTHER_FARMS`).
- Q (post-análisis): ¿Qué entrega esta HU frente a lo que aplican otras historias, y qué puede hacer el `ADMINISTRADOR`? → A: Esta HU entrega el mecanismo (finca activa, sesión offline, verificación de actividad); su aplicación sobre datos de otras historias se marca como FR-013b/FR-017b. `ADMINISTRADOR` solo gestiona cuentas y consulta auditoría (FR-018).

## Escenarios de Usuario y Pruebas

### Historia de Usuario 1 - Identidad, aprovisionamiento y control de acceso por rol (Prioridad: P1)

**Módulo**: `auth` · **Prioridad**: MUST – Línea base, iteración 1.

Como administrador quiero aprovisionar cuentas de usuario asignándoles un rol y una finca, y como usuario quiero iniciar sesión con mis credenciales, para que cada persona acceda únicamente a las operaciones autorizadas según su responsabilidad.

**Por qué esta prioridad**: Es la base de seguridad de todo el sistema BovinoTech IoT. Sin una gestión de identidad robusta no se puede garantizar la autoría ni la integridad del historial append-only, ni la validez de los datos enviados a SINIGÁN V6.

**Prueba Independiente**: Se puede probar aprovisionando un usuario con una cuenta ADMINISTRADOR, iniciando sesión con él, intentando un autorregistro y accediendo a recursos restringidos por rol. Se verifican los códigos de respuesta, el contenido del token (rol y finca) y la autoría registrada en las escrituras.

**Reglas de negocio**:

- No existe autorregistro público; solo un `ADMINISTRADOR` activo crea y habilita usuarios.
- Toda operación de escritura conserva de forma obligatoria el identificador del usuario responsable y la fecha/hora exacta.
- Una sesión autenticada vigente permite continuar operando localmente en campo si se pierde la conectividad.

**Escenarios de Aceptación**:

1. **Dado** un usuario activo con credenciales válidas, **cuando** inicia sesión, **entonces** obtiene acceso con su rol (`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO` o `DIRECTIVO`) y su finca activa (la única asignada, o la que elija si tiene varias).
2. **Dado** un usuario sin cuenta, **cuando** intenta registrarse por su cuenta, **entonces** el sistema rechaza la solicitud e indica que requiere aprovisionamiento administrativo.
3. **Dado** un usuario con rol `OPERARIO`, **cuando** intenta ejecutar una validación clínica o consultar costos directivos, **entonces** el sistema deniega la operación (403).
4. **Dado** un usuario con sesión iniciada que pierde conexión a internet, **cuando** captura un evento permitido en su finca, **entonces** el sistema conserva su identidad como autor para la sincronización posterior. *(requiere FR-013b)*
5. **Dado** un usuario sin conexión cuya sesión superó los 7 días de vigencia offline, **cuando** captura un evento, **entonces** el sistema permite la captura, la marca como "pendiente de verificación de autor" e indica que debe iniciar sesión con conexión para verificarla; al sincronizar, el evento se acepta solo si el autor lo sincroniza con una sesión nueva y estaba activo en la fecha/hora de captura. *(requiere FR-013b)*
6. **Dado** un `ADMINISTRADOR` activo, **cuando** crea un usuario indicando nombre, credenciales, rol y finca, **entonces** la cuenta queda habilitada y el nuevo usuario puede iniciar sesión.
7. **Dado** un usuario autenticado que no tiene rol `ADMINISTRADOR`, **cuando** intenta crear, habilitar o deshabilitar una cuenta, **entonces** el sistema deniega la operación (403).
8. **Dado** un `VETERINARIO` o `DIRECTIVO` con varias fincas asignadas, **cuando** inicia sesión, **entonces** elige la finca activa y todas sus operaciones de esa sesión quedan limitadas a esa finca.
9. **Dado** un `ADMINISTRADOR` activo, **cuando** intenta crear o gestionar un usuario de una finca distinta a la suya, **entonces** el sistema deniega la operación (403).
10. **Dado** un usuario con rol `DIRECTIVO`, **cuando** consulta costos, inventario o historial sanitario de su finca activa, **entonces** obtiene la información; **cuando** intenta registrar o modificar cualquier dato, **entonces** el sistema deniega la operación (403).
11. **Dado** un usuario con rol `ADMINISTRADOR`, **cuando** intenta consultar costos directivos, **entonces** el sistema deniega la operación (403).
12. **Dado** un usuario recién aprovisionado con contraseña temporal, **cuando** inicia sesión por primera vez, **entonces** el sistema le exige definir una contraseña nueva y le deniega cualquier otra operación hasta que lo haga.
13. **Dado** un usuario deshabilitado mientras operaba sin conexión, **cuando** su dispositivo sincroniza los eventos pendientes, **entonces** el sistema acepta los capturados antes de la fecha/hora de deshabilitación, rechaza los posteriores y los reporta al `ADMINISTRADOR` de la finca. *(requiere FR-017b)*

---

### Casos de Borde

- Un usuario deshabilitado intenta iniciar sesión: el sistema rechaza el acceso sin revelar si la cuenta existe (mismo mensaje que con credenciales inválidas).
- Se deshabilita a un usuario mientras tiene una sesión vigente: sus solicitudes posteriores al servidor se rechazan. Si estaba sin conexión, al sincronizar se aplica FR-017.
- La sesión offline vence (7 días) mientras el operario está en campo sin conexión: el sistema sigue permitiendo capturar, marca esos eventos como "pendientes de verificación de autor" e indica que debe iniciar sesión con conexión. Los eventos capturados antes del vencimiento se sincronizan normalmente con su autor original.
- Un evento "pendiente de verificación de autor" lo sincroniza otro usuario, o un usuario que fue deshabilitado antes de la fecha/hora de captura: el sistema lo rechaza y lo reporta al `ADMINISTRADOR` de la finca.
- Un usuario intenta acceder sin enviar ningún token de autenticación: el sistema responde 401.
- Un `ADMINISTRADOR` intenta crear un usuario con un correo ya registrado: el sistema rechaza la creación indicando el conflicto.
- Un `ADMINISTRADOR` intenta deshabilitarse a sí mismo y es el único administrador activo: el sistema lo impide para no dejar el sistema sin administradores.
- Un usuario intenta operar sobre datos de una finca distinta a su finca activa: el sistema deniega la operación.
- Un usuario con varias fincas quiere operar en otra finca: debe cerrar sesión e iniciarla de nuevo eligiendo la otra finca.
- Un `VETERINARIO` o `DIRECTIVO` ya existente debe atender una finca adicional: el `ADMINISTRADOR` de esa finca le añade su finca identificándolo por su correo (no por un identificador interno), sin poder modificar las asignaciones a otras fincas. Las respuestas que recibe el `ADMINISTRADOR` solo muestran su propia finca, nunca las demás fincas del usuario. El estado (habilitado/deshabilitado) de un usuario compartido entre fincas no lo puede cambiar el `ADMINISTRADOR` de una sola de ellas.
- Un `ADMINISTRADOR` intenta asignar más de una finca a un `OPERARIO`: el sistema rechaza la asignación.
- Un usuario con contraseña temporal intenta definir como contraseña nueva la misma contraseña temporal: el sistema la rechaza.
- Un usuario con contraseña temporal intenta su primer inicio de sesión sin conexión: el sistema lo impide, porque el primer inicio de sesión y el cambio de contraseña requieren conexión.

## Requisitos

### Requisitos Funcionales

**Autenticación**

- **FR-001**: El sistema DEBE permitir el inicio de sesión mediante credenciales únicas (correo y contraseña) solo a usuarios activos.
- **FR-002**: El sistema DEBE incluir de forma explícita el rol y la finca activa del usuario en el token de acceso generado tras una autenticación exitosa. Si el usuario tiene una sola finca, esa es la finca activa; si tiene varias, DEBE elegirla al iniciar sesión.
- **FR-003**: El sistema DEBE rechazar con 401 cualquier solicitud protegida sin token, con token inválido o con token de un usuario deshabilitado.

**Aprovisionamiento**

- **FR-004**: El sistema NO DEBE ofrecer autorregistro público. Cualquier intento de registro sin autenticación como `ADMINISTRADOR` DEBE rechazarse con un mensaje que indique que la cuenta requiere aprovisionamiento administrativo.
- **FR-005**: Solo un usuario con rol `ADMINISTRADOR` y estado activo DEBE poder crear usuarios, asignarles rol y finca, y habilitarlos o deshabilitarlos, y únicamente para la finca a la que está asignado.
- **FR-016**: El `ADMINISTRADOR` DEBE asignar una contraseña temporal al aprovisionar una cuenta. El sistema DEBE exigir al usuario cambiarla en su primer inicio de sesión (con conexión) y DEBE denegar cualquier otra operación hasta que lo haga. La contraseña nueva DEBE ser distinta de la temporal.
- **FR-006**: El sistema DEBE impedir que se deshabilite al último `ADMINISTRADOR` activo de una finca.

**Roles y permisos**

- **FR-007**: El sistema DEBE soportar exactamente cuatro roles: `ADMINISTRADOR`, `OPERARIO`, `VETERINARIO` y `DIRECTIVO`.
- **FR-008**: El sistema DEBE restringir la validación clínica (aprobación de correcciones y resolución de conflictos SINIGÁN V6) exclusivamente al rol `VETERINARIO`.
- **FR-009**: El sistema DEBE permitir al rol `OPERARIO` realizar capturas en campo, registrar eventos sanitarios y consultar el inventario de su finca, y DEBE denegarle (403) la validación clínica y la consulta de costos directivos.
- **FR-010**: El sistema DEBE permitir al rol `DIRECTIVO` la consulta de solo lectura de costos directivos, inventario e historial sanitario de su finca activa, y DEBE denegarle (403) cualquier operación de escritura.
- **FR-015**: El sistema DEBE denegar (403) al rol `ADMINISTRADOR` la consulta de costos directivos.
- **FR-018**: El rol `ADMINISTRADOR` DEBE limitarse a la gestión de cuentas y a la consulta de auditoría de su finca. El sistema DEBE denegarle (403) la captura y el registro de eventos, la validación clínica y la consulta de inventario, historial sanitario y costos.
- **FR-011**: El sistema DEBE identificar la finca activa de cada usuario autenticado y ponerla a disposición de las demás funcionalidades, y DEBE limitar la gestión de usuarios y la consulta de auditoría a la finca activa. La restricción por finca sobre animales, eventos sanitarios e inventario la aplica cada historia dueña de esos datos usando esta finca activa.
- **FR-014**: El sistema DEBE asignar exactamente una finca a los roles `OPERARIO` y `ADMINISTRADOR`, y una o más fincas a los roles `VETERINARIO` y `DIRECTIVO`.

**Trazabilidad y operación offline**

- **FR-012**: Toda operación de escritura DEBE registrar de forma obligatoria el identificador del usuario responsable y la fecha/hora exacta de la operación.
- **FR-013**: Una sesión autenticada DEBE tener una vigencia de 7 días desde el último inicio de sesión con conexión y DEBE poder validarse sin conexión, exponiendo la identidad del autor, si el rol permite capturar y si la sesión está vigente o vencida. El vencimiento NO DEBE impedir la captura (constitución §5.4). El sistema DEBE ofrecer a las demás funcionalidades la verificación de un evento pendiente: válido solo si quien sincroniza es su autor, con una sesión iniciada con conexión, y estaba activo en la fecha/hora de captura (FR-017).
- **FR-013b**: Las funcionalidades de captura DEBEN usar esa sesión para conservar el autor y la fecha/hora de captura, marcar como "pendiente de verificación de autor" lo capturado con la sesión vencida, aplicar la verificación de FR-013 al sincronizar esos eventos y no descartar lo capturado con la sesión vigente. *(Aplicación en la historia de eventos sanitarios.)*
- **FR-017**: El sistema DEBE registrar la fecha/hora de deshabilitación de cada usuario y DEBE ofrecer a las demás funcionalidades: (a) la verificación de si un usuario estaba activo en una fecha/hora dada, acotada por el momento de su último inicio de sesión, y (b) el registro de eventos rechazados para que el `ADMINISTRADOR` de la finca los consulte.
- **FR-017b**: Al sincronizar eventos capturados offline, el sistema DEBE aceptar los de un usuario deshabilitado capturados antes de su deshabilitación y rechazar y reportar los posteriores, usando FR-017. *(Aplicación en la historia de eventos sanitarios.)*

### Entidades Clave

- **Usuario**: Representa al personal de la finca. Atributos: identificador único, correo (único), credenciales cifradas, nombre completo, rol asignado, fincas asignadas (una o varias según el rol, ver FR-014), estado (activo/inactivo), fecha/hora de deshabilitación, indicador de contraseña temporal pendiente de cambio, fecha de creación y usuario que lo aprovisionó.
- **Rol**: Define el conjunto de permisos en el sistema. Valores: `ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`.
- **Finca**: Unidad productiva a la que pertenece cada usuario y sobre cuyos datos opera. Atributos: identificador único y nombre. Relación muchos a muchos con Usuario, restringida por rol (FR-014).
- **Token de Acceso**: Objeto digital que certifica la identidad, el rol y la finca activa del usuario en las solicitudes al servidor y que respalda la sesión local en modo offline.

## Criterios de Éxito

### Resultados Medibles

- **SC-001**: El 100% de los intentos de un `OPERARIO` de ejecutar validación clínica o consultar costos directivos se rechazan con código 403.
- **SC-002**: El 100% de los intentos de autorregistro y de aprovisionamiento por usuarios no administradores se rechazan.
- **SC-003**: El token de acceso se genera en menos de 500 ms tras la validación de credenciales.
- **SC-004**: El 100% de las operaciones de escritura persistidas incluyen el identificador del usuario responsable y la fecha/hora.
- **SC-005**: La sesión offline expone al autor correcto en el 100% de los casos probados, y se puede validar sin conexión durante 7 días.
- **SC-006**: Un administrador puede aprovisionar un usuario nuevo y ese usuario puede iniciar sesión en menos de 2 minutos.
- **SC-007**: El 100% de los intentos de escritura de un `DIRECTIVO` y de consulta de costos de un `ADMINISTRADOR` se rechazan con código 403.
- **SC-008**: El 0% de los intentos de captura de un rol permitido se bloquean por pérdida de conectividad o vencimiento de la sesión; el 100% de los eventos capturados con la sesión vencida quedan marcados como pendientes, y la verificación de autor los clasifica correctamente en el 100% de los casos probados.
- **SC-009**: La verificación de actividad en una fecha/hora clasifica correctamente el 100% de los casos probados (antes y después de la deshabilitación, y antes del último inicio de sesión).

## Supuestos

- Los roles existentes `OPERARIO` y `VETERINARIO` conservan su nombre y comportamiento, para no romper a los módulos que ya dependen de `auth` (`sanitary_events`, `sinigan`).
- La gestión completa de fincas (crear, editar, eliminar) queda fuera del alcance de esta HU. El módulo `auth` incluye un seed mínimo de fincas y un `ADMINISTRADOR` inicial para funcionar de forma autónoma.
- La recuperación de contraseña y el autoservicio de cambio de credenciales quedan fuera del alcance de esta HU, salvo el cambio obligatorio de la contraseña temporal en el primer inicio de sesión (FR-016).
- La consulta de costos directivos se implementa en otra HU; esta HU solo define y aplica el permiso de acceso.
- Los requisitos marcados como "Aplicación en la historia de eventos sanitarios" (FR-013b, FR-017b) y la restricción por finca de FR-011 sobre datos de otras historias quedan fuera del criterio de terminado de esta HU. Esta HU se considera terminada cuando entrega el mecanismo (FR-011, FR-013, FR-017) con sus pruebas. La aplicación se coordina con los responsables de esas historias.
- El sistema de autenticación es la base de la trazabilidad de quién registró cada evento en el historial append-only.
