# Constitución del Proyecto: BovinoTech IoT (Plataforma de Trazabilidad Ganadera)

## 1. Idioma y Nomenclatura
- Especificaciones (`spec.md`), planes (`plan.md`), tareas (`tasks.md`) y textos de interfaz (UI) en **ESPAÑOL**.
- Código fuente (variables, clases, funciones, endpoints, pruebas y commits técnicos) en **INGLÉS**.

## 2. Principios de Ingeniería y Arquitectura (Vertical Slicing)
- **Aislamiento Modular Estricto:** Cada funcionalidad se implementa exclusivamente dentro de `backend/app/features/<modulo>/` y `frontend/src/features/<modulo>/`. Ningún desarrollador ni agente debe modificar módulos de otros integrantes.
- **Integración Limpia en Puntos Compartidos:** Los únicos archivos compartidos permitidos son `backend/app/main.py` (para importar el modelo y registrar `app.include_router(...)`) y `frontend/src/App.jsx` (para registrar la vista del módulo), agregando siempre las líneas al final del bloque correspondiente sin alterar rutas existentes.
- **Desacoplamiento entre Historias Paralelas:** Cada módulo referencia al animal mediante su identificador estándar (`sinigan_code` o `bovine_id` como string/UUID) sin depender de llaves foráneas bloqueantes contra tablas de otras HU en desarrollo. Cada módulo incluye su propio *seed* mínimo de prueba si lo requiere para funcionar de forma autónoma.
- **Separación QUÉ vs. CÓMO:** `spec.md` describe únicamente requisitos funcionales, reglas de negocio y criterios `Given/When/Then`. Prohibido mencionar frameworks, librerías o bases de datos en `spec.md`.
- **TDD (Test-First):** Toda historia requiere pruebas automatizadas en `backend/tests/` antes o junto con la implementación.

## 3. Reglas Innegociables del Dominio Ganadero
- **Historial Append-Only (Solo Anexión):** Los eventos sanitarios (vacunación, tratamientos, pesajes) son inmutables. Nunca se ejecutan operaciones `UPDATE` o `DELETE` destructivas sobre eventos históricos. Toda corrección crea un nuevo evento vinculado mediante `corrected_event_id`.
- **Jerarquía de Verdad (SINIGÁN V6):** El identificador oficial y propiedad legal provienen de SINIGÁN V6. Si un registro de campo diverge de la fuente oficial, no se sobrescribe automáticamente: se envía a la cola de conflictos para validación veterinaria humana.
- **Operación Offline-First e Idempotencia:** La aplicación cliente debe permitir captura local sin conexión a internet y sincronizar mediante `client_event_id` único (UUID) para evitar duplicados al reconectar.

## 4. Calidad y Ciberseguridad (DevSecOps)
- Validación estricta de esquemas de entrada y salida mediante contratos tipados (Pydantic).
- Control de acceso por roles (`OPERARIO` vs `VETERINARIO`).
- Cero credenciales, tokens o claves quemadas en el repositorio.

## 5. Gobernanza Metodológica (Enfoque E2E: Lean-Kanban + SDD + DevSecOps + SRE)

1. **Gestión de Flujo Lean-Kanban y Vertical Slicing:**
   - Se opera bajo flujo continuo sin ceremonias pesadas de Scrum, respetando estrictamente un límite de **WIP = 1** (una Historia de Usuario activa a la vez por integrante).
   - Cada entrega es una **Rebanada Vertical (Vertical Slice)** funcional de extremo a extremo (UI + API + Modelos + Pruebas) encerrada en su carpeta aislada (`features/<modulo>`).

2. **Trazabilidad SDD + TDD y Supervisión Humana (Human-in-the-Loop):**
   - Ningún código avanza sin su cadena de contratos: `spec.md` -> `plan.md` -> `tasks.md` -> pruebas en rojo/verde (`pytest`).
   - Segregación estricta de agentes (`@especificador`, `@implementador`, `@qa-seguridad`) con revisión cruzada y aprobación humana obligatoria antes de integrar a `main`.

3. **Compuertas DevSecOps y Estándares de Calidad:**
   - Todo cambio debe superar el pipeline CI en **menos de 90 segundos** (pruebas unitarias, contratos Pydantic/IoT, sincronización offline y análisis estático SAST).
   - Diseño alineado con calidad de software **ISO/IEC 25010:2023** y seguridad para telemetría/dispositivos IoT bajo **NISTIR 8259A** (autenticación de collares, integridad de payload y cero secretos expuestos).

4. **Resiliencia Operativa y Gobierno por SLO / Error Budget (SRE):**
   - **Degradación Elegante (*Graceful Degradation*):** Ninguna pérdida de conectividad rural puede bloquear la captura operativa del trabajador en campo.
   - **SLOs y Presupuesto de Error:** Las alertas críticas (ej. fiebre bovina o fuga de potrero) deben procesarse con latencia **menor a 10 segundos** e integridad del **99.9 %**. Si se agota el *Error Budget* por fallos en pruebas de resiliencia o sincronización, se detienen nuevas funcionalidades y todo el tablero Kanban pasa a estabilización.