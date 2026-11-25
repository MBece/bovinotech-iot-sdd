# Constitución del Proyecto: BovinoTech IoT (Plataforma de Trazabilidad Ganadera)

**Versión:** 2.1.0 | **Ratificación:** 2026-11-18 | **Última Enmienda:** 2026-11-19

## 1. Idioma y Nomenclatura
- Especificaciones (`spec.md`), planes (`plan.md`), tareas (`tasks.md`) y textos de interfaz (UI) en **ESPAÑOL**.
- Código fuente (variables, clases, funciones, endpoints, pruebas y commits técnicos) en **INGLÉS**.

## 2. Principios de Ingeniería y Arquitectura (Vertical Slicing)
- **Aislamiento Modular Estricto:** Cada funcionalidad se implementa exclusivamente dentro de `backend/app/features/<modulo>/` y `frontend/src/features/<modulo>/`. Ningún desarrollador ni agente debe modificar módulos de otros integrantes.
- **Integración Limpia en Puntos Compartidos:** Los únicos archivos compartidos permitidos son `backend/app/main.py` (para importar el modelo y registrar `app.include_router(...)`) y `frontend/src/App.jsx` (para registrar la vista del módulo), agregando siempre las líneas al final del bloque correspondiente sin alterar rutas existentes.
- **Desacoplamiento entre Historias Paralelas:** Cada módulo referencia al animal mediante su identificador estándar (`sinigan_code` o `bovine_id` como string/UUID) sin depender de llaves foráneas bloqueantes contra tablas de otras HU en desarrollo. Cada módulo incluye su propio *seed* mínimo de prueba si lo requiere para funcionar de forma autónoma.
- **Separación QUÉ vs. CÓMO:** `spec.md` describe únicamente requisitos funcionales, reglas de negocio y criterios `Given/When/Then`. Prohibido mencionar frameworks, librerías o bases de datos en `spec.md`.
- **TDD (Test-First):** Toda historia requiere pruebas automatizadas en `backend/tests/` antes o junto con la implementación. Las pruebas unitarias y de contrato son obligatorias antes de considerar el código listo.

### 2.1. Arquitectura Frontend, Menú Lateral y Ergonomía Responsive Mobile-First
- **App Shell y Menú Lateral (Sidebar):** La navegación se orquesta mediante un Menú Lateral modular. Cada módulo en `frontend/src/features/<modulo>/` expone su vista y metadatos de navegación (`id`, `label`, `icon`, `requiredRole`). La integración en `frontend/src/App.jsx` solo registra dicho elemento sin acoplarse a otros módulos.
- **Filtrado por Roles (RBAC en Navegación):** El menú lateral oculta o deshabilita vistas restringidas según el rol activo (`OPERARIO` vs `VETERINARIO`).
- **Monitor de Conectividad Permanente:** El Header/Sidebar debe incluir un badge visual continuo: 🟢 **Online** / 🔴 **Offline (Modo Campo)** con el contador visible de eventos locales pendientes de sincronizar.
- **Diseño Responsive Mobile-First (< 768 px):** Para operarios en campo con dispositivos móviles, el menú lateral se repliega automáticamente a menú hamburguesa o barra inferior (*Bottom Navigation Bar*). En pantallas de escritorio ($\ge 768\text{ px}$) para veterinarios, se presenta el panel lateral completo colapsable.
- **Ergonomía de Campo y Accesibilidad Táctil:** Botones y acciones críticas deben tener un área táctil mínima de **$48 \times 48\text{ px}$**, espaciado holgado y paleta de alto contraste legible bajo luz solar intensa (WCAG AA). Campos numéricos de aretes/pesos deben forzar `inputMode="numeric"`.

### 2.2. Estandarización de Almacenamiento Local (Offline Hub)
- Toda persistencia temporal offline debe usar el prefijo `bovinotech_offline_<modulo>_queue` con el esquema estandarizado: `{ client_event_id: UUID, timestamp_utc: ISOString, status: 'pending'|'syncing'|'failed', payload: object }` para garantizar sincronización idempotente sin colisiones entre módulos.

## 3. Reglas Innegociables del Dominio Ganadero
- **Historial Append-Only (Solo Anexión):** Los eventos sanitarios (vacunación, tratamientos, pesajes) son inmutables. Nunca se ejecutan operaciones `UPDATE` o `DELETE` destructivas sobre eventos históricos. Toda corrección crea un nuevo evento vinculado mediante `corrected_event_id`.
- **Jerarquía de Verdad (SINIGÁN V6):** El identificador oficial y propiedad legal provienen de SINIGÁN V6. Si un registro de campo diverge de la fuente oficial, no se sobrescribe automáticamente: se envía a la cola de conflictos para validación veterinaria humana.
- **Operación Offline-First e Idempotencia:** La aplicación cliente debe permitir captura local sin conexión a internet y sincronizar mediante `client_event_id` único (UUID) para evitar duplicados al reconectar.
- **Tiempos de Retiro y Semáforo Sanitario:** Toda vista que liste o consulte un animal debe reflejar claramente si el animal se encuentra en periodo de "Tiempo de Retiro" por medicamentos (inspección visual destacada en amarillo/rojo), previniendo despacho o comercialización indebida de leche o carne.

## 4. Calidad y Ciberseguridad (DevSecOps)
- Validación estricta de esquemas de entrada y salida mediante contratos tipados (Pydantic).
- Control de acceso por roles (`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`) con mínimo privilegio: cada rol accede solo a las operaciones de su responsabilidad y a los datos de su finca activa.
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
