# Lista de Verificación: [NOMBRE DE LA FUNCIONALIDAD]

**Propósito**: Auditoría de calidad de requisitos, ciberseguridad y reglas ganaderas para la funcionalidad.
**Fecha**: [FECHA]
**Especificación**: [specs/[###-nombre-funcionalidad]/spec.md](spec.md)

**Nota de Revisión**: Este artefacto de auditoría pertenece al revisor (*Human-in-the-Loop* o Agente QA). Marca un ítem `[x]` únicamente cuando se verifique que el criterio está plenamente satisfecho.

## 1. Dominio Ganadero e Inmutabilidad

- [ ] CHK001 Historial Append-Only: No existen operaciones destructivas (`UPDATE`/`DELETE`) sobre registros históricos y las correcciones emplean `corrected_event_id`.
- [ ] CHK002 Autoridad SINIGÁN V6: Los identificadores canónicos respetan el formato oficial y las discrepancias se enrutan a la cola de conflictos veterinarios.
- [ ] CHK003 Idempotencia Offline: Toda sincronización en campo utiliza `client_event_id` único (UUID) para prevenir duplicados.
- [ ] CHK004 Tiempos de Retiro: Si el evento involucra fármacos, se calcula e inspecciona visualmente el periodo de retiro en las vistas.

## 2. Arquitectura, Vertical Slicing e Integración

- [ ] CHK005 Aislamiento Modular: Todo el código nuevo reside en `features/<modulo>/` sin dependencias bloqueantes contra otras ramas paralelas.
- [ ] CHK006 Puntos Compartidos: Únicamente se tocaron `backend/app/main.py` y `frontend/src/App.jsx` agregando líneas al final del bloque.
- [ ] CHK007 Semilla Autónoma: El módulo incluye su propio *seed* mínimo para funcionar de forma desacoplada.

## 3. UI, Menú Lateral y Ergonomía Responsive Mobile-First

- [ ] CHK008 Menú Lateral (Sidebar): La vista del módulo se integra en la navegación del App Shell exponiendo metadatos con control de rol (RBAC).
- [ ] CHK009 Mobile-First (< 768px): La interfaz es usable en smartphones de campo con botones táctiles >= 48x48 px y alto contraste solar.
- [ ] CHK010 Monitor de Conectividad: La interfaz reporta claramente el estado online/offline y los eventos pendientes de sincronización.

## 4. Calidad, DevSecOps y SRE

- [ ] CHK011 Contratos Pydantic: Todos los esquemas de entrada y salida están rigurosamente tipados y validados.
- [ ] CHK012 Ciberseguridad NISTIR 8259A: Cero tokens, credenciales o claves privadas quemadas en código. Análisis SAST limpio con Bandit.
- [ ] CHK013 TDD y Cobertura: Pruebas unitarias y de contrato pasando al 100%.
- [ ] CHK014 Compuerta CI (< 90 segundos): El pipeline completo ejecuta en menos de 90 segundos.
