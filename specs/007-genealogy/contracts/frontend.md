# Contrato de interfaz cliente: módulo `genealogy` (HU-07)

## Navegación (App Shell)

`frontend/src/features/genealogy/index.js` exporta:

```js
export { GenealogyView } from './GenealogyView.jsx';
export const navItem = {
  id: 'genealogy',
  label: 'Genealogía y consanguinidad',
  icon: '🧬',
  requiredRole: ['OPERARIO', 'VETERINARIO', 'ADMINISTRADOR', 'DIRECTIVO'],
};
```

`GenealogyView` recibe `{ token, role }` y filtra internamente: registrar fichas, corregir y validar solo `VETERINARIO`; proponer vínculos `OPERARIO` y `VETERINARIO`; evaluar cruces `VETERINARIO`, `ADMINISTRADOR`, `DIRECTIVO`.

## Cola offline (Offline Hub)

- Clave: `bovinotech_offline_genealogy_queue`.
- Elemento: `{ client_event_id: UUID, timestamp_utc: ISOString, status: 'pending'|'syncing'|'failed', payload }`.
- `payload`: `{ kind: 'ANIMAL' | 'LINK' | 'LINK_CORRECTION', linkId?: string, body: <cuerpo del endpoint correspondiente, incluido clientEventId>, owner: { userId, farmId } }`. `owner` es la sesión que capturó el elemento (usuario `sub` y finca `farm_id` del token, leídos en `genealogySession.js`); no se envía al servidor.
- **Propiedad (QA H-01)**: cada sesión solo envía, cuenta y ve como rechazados los elementos de su mismo usuario **y** finca. Los demás (incluidos elementos antiguos sin `owner`) permanecen intactos en la cola y se informan como "capturados por otro usuario o en otra finca"; solo se envían cuando esa misma sesión vuelve a iniciar. Sin usuario o finca activa no se puede encolar.
- Sincronización FIFO sobre los elementos propios:
  - 201 o 200 (`DUPLICADO`) → se elimina el elemento.
  - 401 o 403 (QA H-02) → la corrida se **pausa** (`paused: 'AUTH'`), el elemento conserva su estado y no pasa a rechazados; se reanuda con una sesión válida.
  - Error de red, 5xx, 408 o 429 → `failed` (reintentable) y la corrida se detiene para no romper el orden.
  - Otros 4xx (rechazo de negocio) → se elimina de la cola y se agrega a `bovinotech_offline_genealogy_rejected` como `{ client_event_id, timestamp_utc, payload, error: { code, message } }`.
- **Lectura tolerante (QA H-05)**: JSON corrupto o valor que no es un arreglo se aparta íntegro en `<clave>_corrupt` y la lista se trata como vacía; entradas mal formadas se omiten; un almacenamiento no disponible se lee como vacío. La vista avisa sin dejar de funcionar.
- API del módulo: `createGenealogyOfflineQueue({ owner })` con `enqueue(payload, clientEventId?)`, `list()`, `pendingCount()`, `foreignCount()`, `listRejected()`, `hasCorruptData()`, `synchronize(send)` → `{ synced, rejected, remaining, paused }`.

## Caché local de consulta (QA H-03)

- Clave única `bovinotech_genealogy_cache` con `{ scope: '<usuario>|<finca>', entries }` (`genealogyCache.js`): fichas para la prevalidación, último árbol e historial y última evaluación consultados, rotulados "dato en caché" sin conexión.
- Una sesión nunca lee entradas de otro `scope`. Al abrir la vista, la sesión reclama la caché (`claim()`): se borran las entradas de otra sesión y las claves antiguas sin partición (`bovinotech_genealogy_animals_cache`, `bovinotech_genealogy_view_cache`). Sin usuario o finca activa no se guarda nada. JSON corrupto o almacenamiento no disponible se tratan como caché vacía.

## Presentación (reglas puras en `genealogyPresentation.js`)

- `formatCoefficient(assessment)`: `null` → "Datos insuficientes"; parcial con valor → "≥ 12,5 % (mínimo estimado)"; completo → "12,5 %" o "0 % (sin ancestros comunes en 3 generaciones)". **Nunca** produce "0 %" si `calculationStatus` es parcial.
- `riskTone(riskLevel)`: `ALTO` → rojo, `MODERADO` → ámbar, `BAJO` → amarillo, `null` → neutro; contraste WCAG AA.
- `linkStatusLabel(status)`: `VALIDADO` → "Validado", `PENDIENTE_VALIDACION` → "Pendiente de validación", `NO_REGISTRADO` → "No registrado", `CORREGIDO` → "Corregido", `RECHAZADO` → "Rechazado".

## Validación local previa (`genealogyValidation.js`)

Antes de encolar un vínculo, con las fichas en caché: progenitor distinto de la cría, sexo acorde al rol y fecha de nacimiento estrictamente anterior. Es una ayuda de UX; la autoridad es el servidor (anti-ciclos incluida).
