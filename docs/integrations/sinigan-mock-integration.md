# Simulación de integración con SINIGAN 6

> **Instrucciones para Codex.** Implementa una integración simulada (mock) entre nuestra plataforma ganadera y SINIGAN. La finalidad es representar cómo nuestra aplicación consultaría información de referencia de SINIGAN, sin conectarse al sistema real del ICA.

## 1. Contexto y objetivo

Nuestra plataforma busca complementar la gestión ganadera con información operativa e IoT. SINIGAN se toma como sistema externo de referencia para identificación y trazabilidad oficial de bovinos y bufalinos.

La integración académica debe permitir consultar datos simulados de:

- Establecimientos o predios.
- Inventario animal por establecimiento.
- Identificación de animales mediante DIN.
- Eventos sanitarios y productivos consultables.
- Histórico o cadena de custodia del DIN.
- Información básica de una GSMI, únicamente como referencia opcional.

**No se debe desarrollar una integración real con SINIGAN ni consumir endpoints privados.** El ICA no ha suministrado para este proyecto un contrato API, Swagger/OpenAPI, colección Postman, WSDL ni credenciales. Por tanto, ningún JSON de este documento debe presentarse como una respuesta oficial de SINIGAN. Son contratos internos de simulación diseñados a partir de los conceptos y campos descritos en el manual de usuario suministrado.

## 2. Fuente funcional y límites de lo documentado

Tomar como referencia el archivo entregado por el equipo: **“Operario prestador de servicios – Manual de usuario SINIGAN 6”**.

Secciones relevantes del manual:

- **Descripción general, págs. impresas 7–10:** SINIGAN 6, sus ambientes (UnICA Administradores, SINIGAN Web, APP SINIGAN y módulo BI) y funciones generales.
- **Eventos, págs. impresas 26–28:** contempla eventos como nacimientos, muertes, identificaciones, tratamientos, pruebas de laboratorio y vacunaciones. El manual indica que el rol PSG tiene permisos únicamente de consulta para esta funcionalidad.
- **Gestión de establecimientos e inventario, págs. impresas 28–47:** permite consultar establecimientos y sus inventarios. Los filtros descritos incluyen departamento, municipio, vereda, nombre del establecimiento, NIT, SIT y RSPP. El inventario se consulta por especie, grupo etario y sexo.
- **Gestión de identificación DIN, pág. impresa 48:** describe el estado del DIN, administradores actuales y anteriores, responsables físicos e historial de movimientos de la cadena de custodia.
- **GSMI, págs. impresas 52–76:** describe código, tipo, estado, fechas, origen, destino, selección de animales y validación de vacunas requeridas para la movilización.

El manual describe pantallas y procesos de usuario; **no documenta el formato JSON/XML ni los endpoints de una API pública**. No inferir nombres de endpoints, propiedades internas, autenticación ni protocolos de SINIGAN a partir de las pantallas.

## 3. Alcance del simulador

### Incluido

1. Un adaptador `MockSiniganAdapter` que entregue fixtures locales en JSON.
2. Una capa de mapeo que convierta los datos simulados en DTO/modelos internos de nuestra aplicación.
3. Endpoints REST propios para consultar establecimientos, inventario, animales, eventos y trazabilidad DIN.
4. Metadatos que identifiquen claramente que la fuente es simulada.
5. Pruebas unitarias y de integración para los escenarios principales.
6. Documentación Swagger de **nuestros endpoints**, no de SINIGAN.

### Fuera de alcance

- Login contra SINIGAN, automatización del navegador, scraping o reutilización de sesiones.
- Consumir endpoints internos o no documentados de SINIGAN.
- Crear, editar o eliminar información oficial en SINIGAN.
- Emitir GSMI, bonos de venta, DIN o certificados oficiales.
- Simular que una respuesta del mock tiene validez legal u oficial.
- Replicar módulos completos de SINIGAN.

La integración será de **consulta solamente**. Mantener esa restricción, especialmente para eventos, porque el manual indica que el rol PSG dispone de permisos de consulta en esa funcionalidad.

## 4. Arquitectura esperada

Respetar la arquitectura, convenciones, nombres y estructura que ya existan en el repositorio. Antes de programar, inspeccionar el proyecto y localizar los módulos de animales, predios, eventos, dispositivos IoT y configuración.

Como referencia, separar responsabilidades así:

```text
src/
  integrations/
    sinigan/
      sinigan-integration.module.ts
      sinigan.controller.ts
      sinigan.service.ts
      adapters/
        sinigan-adapter.interface.ts
        mock-sinigan.adapter.ts
      dto/
        sinigan-establishment.dto.ts
        sinigan-animal.dto.ts
        sinigan-inventory.dto.ts
        sinigan-event.dto.ts
        sinigan-din-history.dto.ts
      mappers/
        sinigan-animal.mapper.ts
        sinigan-establishment.mapper.ts
      fixtures/
        establishments.fixture.json
        animals.fixture.json
        events.fixture.json
        din-history.fixture.json
        gsmis.fixture.json
```

La ruta exacta puede cambiar para ajustarse a la estructura actual. No crear una segunda arquitectura paralela si el proyecto ya tiene una organización equivalente.

### Contrato del adaptador

Definir una interfaz para que el mock pueda sustituirse más adelante por un adaptador oficial, cuando exista documentación y autorización del ICA.

```typescript
export interface SiniganAdapter {
  getStatus(): Promise<SiniganAdapterStatus>;
  findEstablishments(filters: EstablishmentFilters): Promise<SiniganEstablishment[]>;
  getEstablishmentInventory(
    sitCode: string,
    filters: InventoryFilters,
  ): Promise<SiniganInventorySummary>;
  findAnimalByDin(din: string): Promise<SiniganAnimalReference | null>;
  getAnimalEvents(din: string): Promise<SiniganAnimalEvent[]>;
  getDinCustodyHistory(din: string): Promise<SiniganDinHistory | null>;
  getGSMI?(code: string): Promise<SiniganGSMIReference | null>;
}
```

El método `getGSMI` es opcional y puede implementarse después del flujo principal. No permitir operaciones de escritura contra el adaptador.

## 5. Convenciones de los datos simulados

Todos los ejemplos y fixtures deben llevar marcas inequívocas de simulación:

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0",
    "retrievedAt": "2026-11-18T15:30:00-05:00"
  },
  "data": {}
}
```

Los valores de DIN, SIT, RSPP, NIT, predios, personas y animales incluidos en fixtures deben ser simulados. No copiar datos personales ni identificadores reales del manual o de usuarios.

Usar ISO 8601 para fechas y horas. Los nombres de propiedades JSON serán camelCase y corresponderán a **nuestro contrato interno**, no a nombres confirmados de SINIGAN.

## 6. Contratos JSON internos de ejemplo

### 6.1 Estado del adaptador

`GET /api/integrations/sinigan/status`

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0"
  },
  "data": {
    "available": true,
    "adapter": "MockSiniganAdapter",
    "capabilities": [
      "establishments.read",
      "inventory.read",
      "animals.read",
      "animal-events.read",
      "din-history.read"
    ]
  }
}
```

### 6.2 Consulta de establecimiento

`GET /api/integrations/sinigan/establishments?department=ANTIOQUIA&municipality=MEDELLIN&sit=SIT-DEMO-001`

El manual indica que la búsqueda de establecimientos contempla departamento, municipio, vereda, nombre, NIT, SIT y RSPP. El mock puede soportar esos filtros cuando tengan valor.

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0"
  },
  "data": [
    {
      "sitCode": "SIT-DEMO-001",
      "rsppCode": "RSPP-DEMO-001",
      "name": "Finca El Roble",
      "nit": "900000000-1",
      "department": "ANTIOQUIA",
      "municipality": "MEDELLIN",
      "village": "VEREDA DEMO",
      "establishmentType": "PREDIO"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### 6.3 Inventario por establecimiento

`GET /api/integrations/sinigan/establishments/:sitCode/inventory?species=BOVINO&sex=HEMBRA&ageGroup=ADULTO`

El manual describe filtros de inventario por especie, grupo etario y sexo, y una vista general del inventario. No asumir que esta consulta de inventario agregado entrega todos los datos individuales de cada animal.

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0"
  },
  "data": {
    "sitCode": "SIT-DEMO-001",
    "filters": {
      "species": "BOVINO",
      "sex": "HEMBRA",
      "ageGroup": "ADULTO"
    },
    "summary": {
      "bovines": 12,
      "buffaloes": 0,
      "total": 12
    }
  }
}
```

Los valores numéricos son datos simulados para el escenario. Mantener catálogo de especies, sexos y grupos etarios centralizado, sin afirmar que los códigos enumerados coinciden con catálogos internos oficiales.

### 6.4 Consulta de animal por DIN

`GET /api/integrations/sinigan/animals/:din`

El manual describe el DIN como identificador nacional individual y muestra que, en los flujos de selección de animales, se puede buscar por nombre del animal, número o DIN, filtrando por especie y sexo.

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0"
  },
  "data": {
    "din": "DIN-DEMO-000001",
    "animalName": "Luna",
    "animalNumber": "ANIMAL-DEMO-001",
    "species": "BOVINO",
    "sex": "HEMBRA",
    "ageGroup": "ADULTO",
    "establishment": {
      "sitCode": "SIT-DEMO-001",
      "name": "Finca El Roble"
    }
  }
}
```

No agregar raza, peso, fecha de nacimiento, estado reproductivo u otros campos como si estuvieran confirmados por el manual para esta consulta. Si nuestra plataforma necesita esos campos, administrarlos como información propia y separada de la referencia externa.

### 6.5 Eventos consultables del animal

`GET /api/integrations/sinigan/animals/:din/events`

El manual enumera eventos sanitarios y productivos como nacimientos, muertes, identificaciones, tratamientos, pruebas de laboratorio y vacunaciones. Para el rol PSG la funcionalidad indicada es de consulta.

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0"
  },
  "data": [
    {
      "eventId": "EVENT-DEMO-001",
      "din": "DIN-DEMO-000001",
      "eventType": "VACCINATION",
      "eventDate": "2026-08-15",
      "description": "Evento de vacunación de demostración",
      "isSimulation": true
    },
    {
      "eventId": "EVENT-DEMO-002",
      "din": "DIN-DEMO-000001",
      "eventType": "TREATMENT",
      "eventDate": "2026-09-02",
      "description": "Tratamiento de demostración",
      "isSimulation": true
    }
  ]
}
```

Los nombres `eventId`, `eventType`, `eventDate` y `description` son decisiones de nuestro mock; el manual describe tipos de eventos, pero no publica el esquema JSON de dichos registros.

### 6.6 Histórico / cadena de custodia del DIN

`GET /api/integrations/sinigan/din/:din/custody-history`

El manual indica que el histórico permite consultar el estado actual del DIN, administradores actuales y anteriores, responsables físicos e hitos de movimientos: asignación inicial al ICA, entrega a proveedores, transferencia a ganaderos, venta del animal asociado, traslados entre ganaderos, recepción en plantas de beneficio y disposición final del dispositivo.

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "contractVersion": "1.0"
  },
  "data": {
    "din": "DIN-DEMO-000001",
    "currentStatus": "ASSIGNED",
    "currentAdministrator": "ADMIN-DEMO-A",
    "previousAdministrators": ["ADMIN-DEMO-ICA"],
    "custodyMovements": [
      {
        "movementId": "CUSTODY-DEMO-001",
        "movementType": "INITIAL_ASSIGNMENT_TO_ICA",
        "responsible": "RESPONSABLE-DEMO-001",
        "movementDate": "2025-04-10"
      },
      {
        "movementId": "CUSTODY-DEMO-002",
        "movementType": "TRANSFER_TO_FARMER",
        "responsible": "RESPONSABLE-DEMO-002",
        "movementDate": "2025-04-18"
      }
    ]
  }
}
```

Los códigos enumerados son normalizaciones internas del simulador. No son códigos oficiales confirmados.

### 6.7 GSMI (opcional, segunda fase)

`GET /api/integrations/sinigan/gsmis/:code`

Si se implementa, representar solo la consulta de referencia. El manual describe campos como código único, tipo, estado, fecha de expedición, fecha de movilización, expiración, origen y destino. También describe tipos de destino: predio, concentración ganadera y planta de beneficio.

No crear ni pagar guías desde nuestra plataforma. No implementar reglas regulatorias reales a partir de ejemplos simulados.

## 7. Reglas de negocio y seguridad

1. **Solo lectura:** todos los endpoints de la integración mock serán `GET`. No crear `POST`, `PUT`, `PATCH` o `DELETE` para escribir en SINIGAN.
2. **Identificador externo:** el DIN se almacenará como identificador oficial externo y deberá ser único cuando esté presente.
3. **Separación de datos:** no mezclar los datos de referencia simulados con telemetría IoT propia. La telemetría pertenece a nuestra plataforma.
4. **Trazabilidad de fuente:** toda respuesta debe indicar `sourceSystem`, `sourceMode`, `isSimulation` y `retrievedAt`.
5. **No afirmar oficialidad:** la UI debe mostrar una etiqueta visible “SIMULACIÓN”.
6. **Sin scraping:** no automatizar login, CAPTCHA ni navegación de SINIGAN.
7. **Sin credenciales reales:** no almacenar usuarios, contraseñas, cookies ni tokens de SINIGAN.
8. **Permisos locales:** proteger nuestros endpoints con el mecanismo de autenticación/autorización que ya utilice el proyecto.
9. **Datos simulados:** no incluir información personal real, NIT real, direcciones reales o identificadores DIN reales en fixtures.
10. **Errores controlados:** devolver 404 cuando el DIN o SIT no exista en los fixtures y errores 400 para filtros inválidos.

## 8. Persistencia y relación con nuestros modelos

No convertir el mock en la fuente maestra de la base de datos. Mantener una separación sencilla:

- `Animal`: entidad propia de nuestra plataforma.
- `AnimalExternalReference`: relación con el sistema externo (`system = SINIGAN`, `externalId = DIN`, `sourceMode = SIMULADO`).
- `EstablishmentExternalReference`: referencia SIT/RSPP si se requiere asociar el predio.
- `IoTDevice`: dispositivo simulado o real asociado al animal local.
- `IoTTelemetry`: lecturas generadas por el simulador IoT.
- `AnimalOperationalEvent`: eventos creados por nuestros usuarios en la plataforma.
- `ExternalDataSnapshot` o equivalente: opcional, para conservar la última consulta simulada y su fecha.

Si ya existen modelos equivalentes, reutilizarlos. No duplicar tablas sin revisar primero el modelo actual.

La relación esperada es:

```text
SINIGAN (mock)
  DIN ───────────────┐
  SIT ────────────┐  │
                  ▼  ▼
           Referencias externas
                  │
                  ▼
             Animal local
                  │
          ┌───────┴────────┐
          ▼                ▼
      IoTDevice       Eventos propios
          │
          ▼
      IoTTelemetry
```

## 9. Datos de prueba mínimos

Crear fixtures deterministas para:

- Dos establecimientos simulados con SIT y RSPP distintos.
- Al menos cinco animales simulados, con DIN, nombre/número, especie, sexo, grupo etario y SIT asociado.
- Animales bovinos y bufalinos.
- Animales con y sin eventos registrados.
- Un DIN con al menos dos movimientos de cadena de custodia.
- Un DIN inexistente para probar 404.
- Un establecimiento sin inventario para probar respuesta vacía.

Los fixtures deben ser reproducibles y no depender de `Math.random()` en cada petición. Si se simulan estados de error o latencia, controlarlos por configuración o parámetros exclusivos de desarrollo.

## 10. Criterios de aceptación

- [ ] Codex inspeccionó primero el proyecto y reutilizó sus módulos, patrones y convenciones.
- [ ] Existe un `SiniganAdapter` o abstracción equivalente.
- [ ] La implementación activa por defecto es `MockSiniganAdapter`.
- [ ] Ninguna petición sale a `sinigan.co`, dominios del ICA o servicios privados.
- [ ] Los endpoints GET permiten consultar establecimientos, inventario, animal por DIN, eventos y cadena de custodia.
- [ ] Los filtros de establecimientos contemplan departamento, municipio, vereda, nombre, NIT, SIT y RSPP, según disponibilidad en fixtures.
- [ ] El inventario permite filtrar por especie, sexo y grupo etario.
- [ ] Las respuestas incluyen metadatos de simulación.
- [ ] Los datos oficiales de referencia se distinguen de los datos propios e IoT.
- [ ] Los eventos del adaptador son de solo lectura.
- [ ] Hay manejo consistente de 400, 404 y errores inesperados.
- [ ] Hay pruebas unitarias del adapter y mapper y pruebas HTTP de los endpoints.
- [ ] Swagger documenta nuestros endpoints y aclara que son simulados.
- [ ] La interfaz, si se incorpora, muestra “SIMULACIÓN”.
- [ ] La solución puede cambiarse a otro adaptador sin reescribir la lógica de negocio.

## 11. Orden de implementación recomendado

Trabajar por cortes verticales pequeños, sin intentar implementar todo en una sola entrega:

**Incremento 1 — Consulta de animal por DIN**

- Fixture de animales.
- Adapter y mapper.
- Endpoint GET por DIN.
- Pruebas y respuesta visible en la aplicación.

**Incremento 2 — Consulta de establecimiento e inventario**

- Fixtures de establecimientos.
- Filtros descritos en el manual.
- Resumen del inventario por especie, sexo y grupo etario.

**Incremento 3 — Eventos y cadena de custodia**

- Consulta de eventos.
- Consulta del histórico DIN.
- Presentación de una línea de tiempo.

**Incremento 4 — Relación con IoT**

- Asociar un animal local con un dispositivo IoT simulado.
- Mantener separadas la referencia SINIGAN y la telemetría propia.
- Consultar ficha del animal con información externa simulada y lecturas IoT.

**Incremento 5 — GSMI opcional**

- Solo si el tiempo lo permite y sin crear trámites oficiales.

Después de cada incremento ejecutar pruebas, revisar regresiones y dejar la aplicación en estado funcional.

## 12. Instrucción final para Codex

Antes de modificar archivos:

1. Inspecciona el repositorio, `package.json`, estructura de módulos, modelos Sequelize/ORM, DTO existentes, convenciones de rutas, autenticación y pruebas.
2. Resume qué componentes existentes puedes reutilizar y qué archivos planeas crear o modificar.
3. Implementa primero el Incremento 1. No avances a los demás incrementos hasta que el primero compile y sus pruebas pasen.
4. No cambies tecnologías ni arquitectura general del proyecto sin necesidad.
5. No inventes una API real de SINIGAN. El mock debe quedar aislado y claramente marcado.
6. Al terminar, informa archivos modificados, endpoints disponibles, ejemplos de respuesta y pruebas ejecutadas con sus resultados.

**Resultado esperado:** una integración simulada, desacoplada y verificable que permita a nuestra plataforma consultar referencias de SINIGAN usando estructuras propias basadas en la información funcional documentada por el ICA, sin afirmar que se conoce o reproduce el contrato técnico real de SINIGAN.

## Referencia documental

Instituto Colombiano Agropecuario (ICA), *Sistema Nacional de Identificación e Información del Ganado Bovino — SINIGAN 6: Operario prestador de servicios, Manual de usuario*, especialmente las secciones de Eventos (págs. impresas 26–28), Establecimientos e Inventario (págs. 28–47), Gestión de Identificación DIN (pág. 48) y GSMI (págs. 52–76). Documento suministrado por el equipo.
