# Constitución del Proyecto: BovinoTech IoT (Plataforma de Trazabilidad Ganadera)

## 1. Idioma y Nomenclatura
- Especificaciones (spec.md), planes (plan.md), tareas (	asks.md) y textos de interfaz (UI) en ESPAÑOL.
- Código fuente (variables, clases, funciones, endpoints, pruebas y commits técnicos) en INGLÉS.

## 2. Principios de Ingeniería y Arquitectura (Vertical Slicing)
- **Aislamiento Modular Estricto:** Cada funcionalidad se implementa exclusivamente dentro de ackend/app/features/<modulo>/ y rontend/src/features/<modulo>/. Ningún desarrollador ni agente debe modificar módulos de otros integrantes.
- **Separación QUÉ vs. CÓMO:** spec.md describe únicamente requisitos funcionales, reglas de negocio y criterios Given/When/Then. Prohibido mencionar frameworks o bases de datos en spec.md.
- **TDD (Test-First):** Toda historia requiere pruebas automatizadas en ackend/tests/ antes o junto con la implementación.

## 3. Reglas Innegociables del Dominio Ganadero
- **Historial Append-Only (Solo Anexión):** Los eventos sanitarios (vacunación, tratamientos, pesajes) son inmutables. Nunca se ejecutan operaciones UPDATE o DELETE destructivas sobre eventos históricos. Toda corrección crea un nuevo evento vinculado mediante corrected_event_id.
- **Jerarquía de Verdad (SINIGÁN V6):** El identificador oficial y propiedad legal provienen de SINIGÁN V6. Si un registro de campo diverge de la fuente oficial, no se sobrescribe automáticamente: se envía a la cola de conflictos para validación veterinaria humana.
- **Operación Offline-First e Idempotencia:** La aplicación cliente debe permitir captura local sin conexión a internet y sincronizar mediante client_event_id único (UUID) para evitar duplicados al reconectar.

## 4. Calidad y Ciberseguridad (DevSecOps)
- Validación estricta de esquemas de entrada y salida.
- Control de acceso por roles (OPERARIO vs VETERINARIO).
- Cero credenciales, tokens o claves quemadas en el repositorio.
