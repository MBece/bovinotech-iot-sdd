# Investigación: Captura offline de eventos sanitarios (HU-02)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Cada decisión tiene el formato Decisión / Justificación / Alternativas.

## R1. Dependencia de la HU-01 (rama base)

- **Decisión**: la implementación de la HU-02 empieza cuando el PR #3 (HU-01) esté fusionado en `main`. Entonces `feat/hu-02-offline-capture` se rebasa sobre `main`. La spec, el plan y las tareas se pueden hacer antes.
- **Justificación**: la HU-02 usa la finca activa, los roles con permiso de escritura (`require_write_access`) y el indicador de sesión vencida (`captureNeedsAuthorVerification`), que solo existen en la HU-01. CONTRIBUTING exige que las ramas salgan de `main`, y la constitución fija WIP = 1.
- **Alternativas**: apilar la rama sobre `feat/hu-01-auth-rbac` (arrastra cambios de la HU-01 al PR de la HU-02 si la HU-01 cambia en revisión); duplicar la lógica de roles en el módulo (viola el aislamiento y crea dos fuentes de verdad).

## R2. Almacenamiento local

- **Decisión**: base IndexedDB propia del módulo, `bovinotech_offline_capture`, con dos almacenes: `events` (clave `clientEventId`; índice `byAuthorFarm` sobre `[authorEmail, farmId]`) y `catalog` (clave `[farmId, din]`; índice `byFarm`). Cada guardado es una única transacción `add` (no `put`), así que un evento no se puede sobrescribir.
- **Justificación**: IndexedDB persiste entre cierres y reinicios (FR-010), la escritura es transaccional (todo o nada ante un cierre abrupto) y aguanta 5.000 animales y 1.000 eventos con holgura. Usar `add` hace cumplir la inmutabilidad (FR-016) en el propio almacenamiento. Una base propia evita tocar `frontend/src/core/offline/`, que pertenece a la captura preliminar.
- **Alternativas**: `localStorage` (síncrono, límite de unos 5 MB, sin transacciones); reutilizar la base `bovinotech_offline` (obliga a subir su versión y modificar código de otro módulo).

## R3. Eventos de la captura preliminar (FR-019)

- **Decisión**: al abrir la captura, el módulo lee **en modo solo lectura** la base `bovinotech_offline`, almacén `sanitary_events`, y **copia** a `events` los registros con estado `PENDING_SYNC` o `REJECTED` que todavía no existan (misma `clientEventId`). La copia conserva `clientEventId`, `din`, `eventType`, `fieldOccurredAt`, `dose` y `notes`; se marca `origin: "LEGACY"` y los estados nacen `PENDIENTE_SINCRONIZACION` y `PENDIENTE_VALIDACION`. La base antigua no se modifica ni se borra. Si la base no existe, no se crea: se abre sin versión y se aborta en `onupgradeneeded`.
- **Justificación**: no se pierde ningún pendiente (constitución §5.4) y la HU-03 solo tiene que leer un almacén. Es idempotente: repetir la copia no duplica nada. Si el flujo antiguo llegara a enviar el mismo evento, el servidor lo reconoce como duplicado por `client_event_id`.
- **Alternativas**: mostrar ambos almacenes sin copiar (la HU-03 tendría que leer dos fuentes); mover y borrar del almacén antiguo (modifica datos de otro módulo y arriesga pérdidas).

## R4. Códigos de tipo de evento y de estado

- **Decisión**: tipos `VACCINATION`, `TREATMENT`, `CHECKUP` (chequeo clínico) y `DEWORMING`. Estados con los nombres de la HU: `syncStatus = PENDIENTE_SINCRONIZACION` y `validationStatus = PENDIENTE_VALIDACION`. Unidades de dosis: `ml`, `mg`, `g`, `unidades`.
- **Justificación**: los tres primeros tipos coinciden con los que ya acepta `/sync` (`sanitary_events`), así los eventos preliminares no requieren traducción. Los estados son términos de negocio fijados en la HU. Los textos de interfaz se traducen al español.
- **Alternativas**: códigos en español para los tipos (rompe la compatibilidad con `/sync` y con los eventos preliminares).

## R5. Validación en el dispositivo y contrato congelado para la HU-03

- **Decisión**: un validador JavaScript puro (`eventValidation.js`) aplica FR-007, FR-008 y FR-015 antes de guardar. El backend define el mismo contrato como esquema Pydantic `CapturedEvent` en `offline_capture/schemas.py`. Ambos lados se prueban contra **el mismo archivo de casos** `contracts/captured-event.cases.json`, así no se desalinean.
- **Justificación**: la captura no puede depender del servidor (FR-003), así que la validación vive en el cliente; el esquema backend congela el contrato `client_event_id` que la HU-03 va a recibir (tabla de independencia del backlog) y da las pruebas `pytest` que exige la constitución.
- **Alternativas**: validar solo en el cliente (el contrato no tendría guardián en el servidor); validar solo en el servidor (imposible sin conexión).

## R6. Pruebas del frontend sin dependencias nuevas

- **Decisión**: los módulos puros (validador, búsqueda de animales, mapeo de eventos preliminares, armado del evento) se prueban con el runner nativo de Node, ejecutando `node --test 'src/features/offline-capture/*.test.js'` desde `frontend/`, **sin modificar `package.json`** (constitución §2: los únicos archivos compartidos son `main.py` y `App.jsx`). Añadir un script `test` y el paso en CI se pide por coordinación. Los repositorios IndexedDB reciben su almacenamiento por inyección; las pruebas usan un doble en memoria. La persistencia real entre reinicios se valida a mano (quickstart).
- **Justificación**: cumple TDD sin añadir paquetes (`vitest`, `fake-indexeddb`) ni tocar `package.json`/`package-lock.json`, y sin alargar el CI (< 90 s).
- **Alternativas**: `vitest` + `fake-indexeddb` (más cobertura de IndexedDB, pero dos dependencias nuevas y más tiempo de CI); no probar el frontend (incumple TDD).

## R7. Catálogo local de animales

- **Decisión**: el módulo backend tiene su propio seed `offline_capture/fixtures/catalog.json` (animales con `din` en formato `DIN-DEMO-NNNNNN`, nombre y `farm_id`) y expone `GET /offline-capture/catalog`, limitado a la finca activa del token y a roles con permiso de escritura. El cliente lo descarga cuando hay conexión y lo guarda en el almacén `catalog`; sin conexión usa la última copia. Si no hay copia, informa que no hay animales (caso límite).
- **Justificación**: la constitución pide un seed propio por módulo y prohíbe llaves foráneas bloqueantes contra otras HU; el backlog fija "catálogo local semilla". Usar el formato DIN de SINIGÁN mantiene coherencia con la consulta existente sin depender de su código.
- **Alternativas**: leer el catálogo del adaptador SINIGÁN (acopla a otro módulo y no tiene finca); catálogo embebido en el frontend (no varía por finca).

## R8. Búsqueda con sugerencias (FR-009b)

- **Decisión**: búsqueda en memoria sobre el catálogo de la finca activa, sin distinguir mayúsculas ni tildes, por coincidencia en `din` o en nombre; máximo 10 sugerencias, priorizando coincidencias al inicio. El animal solo queda elegido cuando el operario toca una sugerencia; si escribe un identificador completo que no está en el catálogo, se rechaza con el motivo (FR-008).
- **Justificación**: 5.000 registros se filtran en milisegundos en memoria; nunca se autoasigna un animal (caso límite de varias coincidencias).
- **Alternativas**: índice de IndexedDB por prefijo (más complejo y sin búsqueda por nombre parcial).

## R9. Autor, finca y verificación de autor

- **Decisión**: el evento guarda `authorEmail` (el `sub` del token de la HU-01) y `farmId` del `AuthContext`, más `authorVerificationPending = captureNeedsAuthorVerification`. La captura se muestra solo si `canCapture` es verdadero (roles `OPERARIO` y `VETERINARIO`). La bandeja filtra por `authorEmail` y `farmId` activos.
- **Justificación**: reutiliza el mecanismo entregado por la HU-01 (FR-013) sin redefinirlo. La sesión de la HU-01 no tiene el id del usuario y sin conexión no se puede consultar; el email es único (HU-01) y no existe la función de cambiarlo.
- **Alternativas**: añadir el id del usuario a la sesión de la HU-01 (cambia un PR que ya está en revisión).

## R10. Retiro de la captura preliminar (FR-018)

- **Decisión**: la nueva captura se registra en `frontend/src/App.jsx` añadiendo líneas al final, como permite la constitución. Quitar `OfflineSanitaryCapture` de `App.jsx` altera líneas existentes de otro módulo, así que se pide en `coordination-sanitary-events.md`. Hasta que se apruebe, conviven ambas vistas (registrado en Seguimiento de Complejidad).
- **Justificación**: respeta el aislamiento modular (constitución §2) y la regla de solo añadir en archivos compartidos.
- **Alternativas**: retirar la vista preliminar directamente (viola §2).

## R11. Datos locales en dispositivos compartidos

- **Decisión**: sin cifrado adicional de IndexedDB en esta HU. Los eventos no contienen credenciales ni datos personales sensibles (identificador del animal, producto, dosis, autor). La protección es la del dispositivo (bloqueo de pantalla) y el aislamiento por origen del navegador. La bandeja solo muestra los eventos del usuario en sesión.
- **Justificación**: cifrar en el cliente exige guardar la clave en el mismo dispositivo, lo que no aporta protección real y añade riesgo de pérdida de datos si la clave se pierde (contra §5.4).
- **Alternativas**: cifrado con clave derivada de la contraseña (se pierde el acceso a los pendientes si la sesión vence sin conexión).
