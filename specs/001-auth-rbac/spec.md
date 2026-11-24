# Especificación Funcional: HU-01 — Gestión de Identidad, Aprovisionamiento y Control de Acceso por Roles

**Módulo:** `auth`  
**Prioridad:** MUST – Línea base, iteración 1  
**Alineación:** `.specify/memory/constitution.md`, `ISO/IEC 25010:2023`, `NISTIR 8259A`

---

## 1. Historia de Usuario

**Como** administrador del sistema ganadero,  
**quiero** aprovisionar cuentas de usuario asignándoles un rol institucional y una finca de operación,  
**y como** usuario de campo o veterinario,  
**quiero** iniciar sesión con mis credenciales institucionales,  
**para** garantizar que cada persona acceda únicamente a las operaciones y datos autorizados según su nivel de responsabilidad y predio asignado.

---

## 2. Reglas de Negocio Innegociables

1. **Cero Autorregistro Público:** No existe creación libre ni autoregistro de cuentas; todo usuario debe ser aprovisionado explícitamente por un `ADMINISTRADOR` activo.
2. **Catálogo Cerrado de Roles:** Los únicos roles permitidos en el sistema son:
   * `ADMINISTRADOR`: Gestión de usuarios, asignación de fincas, auditoría de accesos.
   * `OPERARIO`: Captura local de eventos sanitarios y lectura operativa de su finca; prohibido ver costos o validar diagnósticos clínicos.
   * `VETERINARIO`: Diagnóstico clínico, formulación, validación de eventos, resolución de discrepancias SINIGÁN.
   * `DIRECTIVO`: Visualización estratégica de indicadores (KPIs), costos, pesajes y reportes consolidados; sin permisos de manipulación operativa directa.
3. **Asignación Obligatoria de Finca (*Farm Scope*):**
   * Todo usuario pertenece al menos a una finca (`farm_id`).
   * Los roles `OPERARIO` operan exclusivamente en su finca asignada.
   * Roles multi-predio (como `VETERINARIO` o `DIRECTIVO`) pueden tener múltiples fincas autorizadas, debiendo seleccionar su finca activa al iniciar sesión.
4. **Trazabilidad y No Repudio:** Toda operación registrada en el sistema debe quedar vinculada de forma obligatoria al correo/identificador del usuario responsable y su marca de tiempo exacta.
5. **Autonomía Offline:** Una sesión autenticada vigente genera credenciales seguras que permiten continuar operando localmente en el potrero ante pérdida total de señal de internet.
6. **Política de Contraseñas Seguras:** Las contraseñas se almacenan mediante funciones de derivación criptográfica seguras (bcrypt) con longitud máxima segura de 72 bytes.

---

## 3. Criterios de Aceptación (Given / When / Then)

### Escenario 1: Inicio de sesión exitoso con rol y finca activa
* **Dado** un usuario activo con credenciales válidas registradas en el sistema y una finca asociada,
* **Cuando** el usuario ingresa su correo, contraseña y selecciona su finca de trabajo,
* **Entonces** el sistema valida las credenciales, emite un token de acceso seguro que incluye su rol (`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`) y su finca activa (`farm_id`), permitiendo el ingreso al panel correspondiente en menos de 500 ms.

### Escenario 2: Rechazo tajante de autorregistro público
* **Dado** un usuario anónimo sin credenciales previas,
* **Cuando** intenta enviar una solicitud de registro autónomo a la plataforma,
* **Entonces** el sistema rechaza la solicitud indicando que el aprovisionamiento requiere autorización administrativa explícita.

### Escenario 3: Denegación de acceso RBAC a operaciones no autorizadas
* **Dado** un usuario autenticado con el rol `OPERARIO`,
* **Cuando** intenta acceder a la consulta de costos financieros o validar un evento clínico veterinario,
* **Entonces** el sistema bloquea la acción denegando el acceso (HTTP 403 Forbidden) y registrando el intento en la bitácora de seguridad.

### Escenario 4: Preservación de identidad en operación offline
* **Dado** un operario con sesión activa que pierde la conexión a internet en el potrero,
* **Cuando** captura un evento sanitario localmente,
* **Entonces** el cliente almacena la información vinculando de forma inmutable el correo del operario como autor del evento para su posterior sincronización por lotes.
