# Especificación de Funcionalidad: Gestión de Identidad y RBAC

**Rama de Funcionalidad**: `001-auth-rbac`

**Fecha**: 2026-11-18

**Estado**: Draft

**Entrada**: Implementar gestión de identidad y control de acceso por roles (RBAC) para BovinoTech IoT con dos perfiles operativos: OPERARIO y VETERINARIO.

## Escenarios de Usuario y Pruebas

### Historia de Usuario 1 - Gestión de Identidad y Control de Acceso por Roles (Prioridad: P1)

Como usuario del sistema (Operario o Veterinario), quiero autenticarme en la plataforma para acceder a las funciones correspondientes a mi cargo, asegurando que solo personal autorizado realice acciones críticas.

**Por qué esta prioridad**: Es la base de seguridad de todo el sistema BovinoTech IoT. Sin una gestión de identidad robusta, no se puede garantizar la integridad del historial append-only ni la validez de los datos de SINIGÁN V6.

**Prueba Independiente**: Se puede probar mediante el flujo de inicio de sesión y el intento de acceso a recursos restringidos, verificando los códigos de respuesta y el contenido del token.

**Escenarios de Aceptación**:

1. **Given** credenciales válidas de un operario o veterinario, **When** inicia sesión, **Then** recibe un token de acceso con su rol explícito.
2. **Given** un usuario autenticado con rol OPERARIO, **When** intenta acceder a una acción exclusiva de VETERINARIO (aprobar corrección o resolver conflicto), **Then** el sistema rechaza la operación con un error de autorización (403).

---

### Casos de Borde

- ¿Qué sucede cuando un usuario intenta iniciar sesión con credenciales de un usuario que ha sido desactivado?
- ¿Cómo maneja el sistema un token que ha expirado mientras el operario está en campo (offline)?
- ¿Qué ocurre si un usuario intenta acceder sin enviar ningún token de autenticación?

## Requisitos

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir el inicio de sesión de usuarios mediante credenciales únicas.
- **FR-002**: El sistema DEBE asignar uno de los dos roles definidos: OPERARIO o VETERINARIO.
- **FR-003**: El sistema DEBE incluir el rol del usuario de forma explícita dentro del token de acceso generado tras una autenticación exitosa.
- **FR-004**: El sistema DEBE restringir el acceso a los módulos de "Aprobación de Correcciones" y "Resolución de Conflictos SINIGÁN V6" exclusivamente al rol VETERINARIO.
- **FR-005**: El sistema DEBE permitir al rol OPERARIO realizar capturas en campo, registrar eventos sanitarios y consultar el inventario.

### Entidades Clave

- **Usuario**: Representa al personal de la finca. Atributos: Identificador único, credenciales, nombre completo y rol asignado.
- **Rol**: Define el conjunto de permisos en el sistema. Valores: OPERARIO, VETERINARIO.
- **Token de Acceso**: Objeto digital que certifica la identidad y el rol del usuario para las solicitudes al servidor.

## Criterios de Éxito

### Resultados Medibles

- **SC-001**: El 100% de los intentos de acceso a funciones de VETERINARIO por parte de un OPERARIO deben ser rechazados con código 403.
- **SC-002**: El token de acceso debe ser generado en menos de 500ms tras la validación de credenciales.
- **SC-003**: El sistema debe soportar la validación de roles incluso en condiciones de baja latencia o intermitencia (mediante la verificación del token).

## Supuestos

- Se asume que la creación de usuarios y la asignación inicial de roles se realiza por un administrador del sistema (fuera del alcance de esta HU).
- El sistema de autenticación será la base para la trazabilidad de quién registró cada evento en el historial append-only.
