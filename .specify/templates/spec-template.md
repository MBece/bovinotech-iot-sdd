# Especificación de Funcionalidad: [NOMBRE DE LA FUNCIONALIDAD]

**Rama de Funcionalidad**: `[###-nombre-funcionalidad]`

**Fecha de Creación**: [FECHA]

**Estado**: Draft

**Entrada**: Descripción de usuario: "$ARGUMENTS"

## Escenarios de Usuario y Pruebas *(obligatorio)*

<!--
  IMPORTANTE: Las historias de usuario deben priorizarse como viajes de usuario ordenados por importancia.
  Cada historia debe ser PROBABLE DE FORMA INDEPENDIENTE (Rebanada Vertical MVP).
  Asigna prioridades (P1, P2, P3...), donde P1 es la más crítica.
  Idiomas: Especificación en ESPAÑOL. Prohibido mencionar tecnologías, frameworks o bases de datos aquí (solo el QUÉ).
-->

### Historia de Usuario 1 - [Título Breve] (Prioridad: P1)

[Descripción del viaje de usuario en lenguaje claro y de negocio]

**Rol y Dispositivo Objetivo**: [e.g., OPERARIO en smartphone rural / VETERINARIO en escritorio]

**Por qué esta prioridad**: [Explica el valor ganadero/operativo y su nivel de criticidad]

**Prueba Independiente**: [Describe cómo verificar esta historia de forma autónoma con su valor de entrega]

**Escenarios de Aceptación**:

1. **Given** [estado inicial en finca/sistema], **When** [acción realizada por el usuario], **Then** [resultado esperado observable]
2. **Given** [estado inicial], **When** [acción], **Then** [resultado esperado]

---

### Historia de Usuario 2 - [Título Breve] (Prioridad: P2)

[Descripción del viaje de usuario]

**Rol y Dispositivo Objetivo**: [OPERARIO / VETERINARIO]

**Por qué esta prioridad**: [Explicación de valor]

**Prueba Independiente**: [Cómo probar de forma aislada]

**Escenarios de Aceptación**:

1. **Given** [estado inicial], **When** [acción], **Then** [resultado esperado]

---

### Casos de Borde y Condiciones Rurales

- ¿Qué ocurre ante la pérdida total de conectividad en campo (operación Offline-First e idempotencia)?
- ¿Cómo se maneja si el animal reportado difiere del registro oficial de SINIGÁN V6 (cola de conflictos)?
- ¿Cómo se previene la alteración destructiva de eventos sanitarios históricos (historial append-only)?
- ¿Qué alerta se muestra si el animal consultado se encuentra en "Tiempo de Retiro" farmacológico activo?

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE [capacidad específica del dominio ganadero]
- **FR-002**: El sistema DEBE [regla de validación o control de acceso RBAC]
- **FR-003**: El operario/veterinario DEBE poder [interacción clave de negocio]
- **FR-004**: Los eventos generados DEBEN ser inmutables (append-only con `corrected_event_id` ante correcciones)
- **FR-005**: Toda sincronización offline DEBE ser idempotente mediante identificador único de cliente (`client_event_id` UUID)

### Requisitos de Experiencia y Entorno (UI, Responsive y Campo)

- **UI-001**: La interfaz móvil (< 768 px) para operarios DEBE ofrecer áreas táctiles mínimas de 48x48 px y alto contraste legible bajo luz solar.
- **UI-002**: La funcionalidad DEBE registrar su entrada en el Menú Lateral (Sidebar) filtrando la visibilidad según el rol activo (OPERARIO vs VETERINARIO).
- **UI-003**: Si la funcionalidad captura datos en campo, DEBE persistir localmente sin internet y reflejar el estado en el monitor de conectividad del App Shell.

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **[Entidad 1, ej. Bovino]**: [Qué representa en la finca, atributos conceptuales clave (código SINIGÁN, raza, etc.) sin implementación técnica]
- **[Entidad 2, ej. Evento Sanitario]**: [Qué evento registra, inmutabilidad, relación con el animal]

## Criterios de Éxito y Metas de Servicio (SLO) *(obligatorio)*

### Resultados Medibles

- **SC-001**: [Métrica de negocio, ej. "El 100% de los tratamientos se registran con trazabilidad SINIGÁN"]
- **SC-002 (SLO Latencia)**: [Métrica operativa, ej. "Alertas críticas de salud procesadas en menos de 10 segundos"]
- **SC-003 (SLO Disponibilidad/Offline)**: [e.g., "100% de operaciones de campo disponibles sin conexión con cero pérdida de eventos al sincronizar"]
- **SC-004**: [Métrica de satisfacción/adopción, ej. "Tiempo de registro en manga inferior a 30 segundos por animal"]

## Supuestos y Restricciones de Dominio

- [Supuesto de conectividad: Operación rural intermitente que depende del cliente offline-first]
- [Supuesto de roles: Permisos diferenciados entre Operario de campo y Médico Veterinario]
- [Dependencia o fuente de verdad: SINIGÁN V6 como autoridad canónica de identificación]
