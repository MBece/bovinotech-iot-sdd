# Guía de Contribución y Flujo de Trabajo: BovinoTech IoT

Esta guía define el protocolo obligatorio para la creación de ramas, desarrollo aislado, verificación de calidad y el proceso de aprobación de Pull Requests (PR) en el proyecto **BovinoTech IoT**, operando bajo metodología Lean-Kanban, Spec-Driven Development (SDD), DevSecOps y SRE.

---

## 📌 PARTE 1: Guía para Desarrolladores

### 1. Convención de Ramas y Límite de Trabajo en Curso (WIP = 1)
Cada integrante opera bajo la política estricta de **WIP = 1** (una sola Historia de Usuario activa a la vez). Toda rama debe crearse a partir de `main` actualizado:

$$\text{Nomenclatura Obligatoria:} \quad \mathbf{feat/hu-0X\text{-nombre-modulo}}$$

*Ejemplos:*
- `feat/hu-01-auth-rbac`
- `feat/hu-02-historial-append-only`
- `feat/hu-03-conflictos-sinigan`

---

### 2. Flujo de Comandos Paso a Paso

#### Paso 1: Actualizar `main` y crear la rama
```bash
git checkout main
git pull origin main
git checkout -b feat/hu-0X-nombre-modulo
```

#### Paso 2: Desarrollo con Aislamiento Modular y Vertical Slicing
De acuerdo con [.specify/memory/constitution.md](.specify/memory/constitution.md), cada funcionalidad se entrega como una **Rebanada Vertical (Vertical Slice)** completa y desacoplada:
- **Backend**: `backend/app/features/<modulo>/` (modelos, esquemas, servicios y router).
- **Frontend**: `frontend/src/features/<modulo>/` (vistas, servicios offline y metadatos para Menú Lateral).
- **Pruebas Backend**: `backend/tests/` (unitarias, contratos y seguridad RBAC con `pytest`).
- **Especificaciones SDD**: `specs/00X-<modulo>/` (`spec.md`, `plan.md`, `tasks.md`).

> ⚠️ **Regla de Puntos Compartidos Permitidos:**
> Los **únicos** archivos compartidos fuera de la carpeta del módulo permitidos para modificación son:
> 1. `backend/app/main.py`: para registrar `app.include_router(...)`.
> 2. `frontend/src/App.jsx`: para registrar la vista en el Menú Lateral / Router.
> **Obligatorio:** Agregar siempre las líneas al final del bloque correspondiente sin modificar rutas preexistentes.

> ⚠️ **Regla de Desacoplamiento entre HUs:**
> Cada módulo referencia a los animales mediante `sinigan_code` o `bovine_id` sin depender de llaves foráneas bloqueantes contra tablas de otras HUs en desarrollo simultáneo. Cada módulo provee su propio *seed* mínimo para pruebas independientes.

> 📱 **Regla de Ergonomía UI y Menú Lateral:**
> Toda interfaz debe ser adaptativa (**Mobile-First < 768 px** con áreas táctiles $\ge 48\times 48\text{ px}$ y alto contraste para luz solar) y registrar su elemento en el Menú Lateral (Sidebar) filtrando la vista según el rol asignado (`OPERARIO` vs `VETERINARIO`).

#### Paso 3: Verificación Local Pre-Push (Compuerta CI < 90 Segundos)
Antes de enviar cambios al repositorio remoto, es obligatorio verificar que la suite completa pase sin errores y en **menos de 90 segundos**:

```bash
# 1. Verificación Backend (desde la carpeta backend):
cd backend
pytest -v
bandit -r app -ll

# 2. Verificación Frontend (desde la carpeta frontend):
cd ../frontend
npm run lint
npm run build
```

Si algún paso falla localmente o toma más de 90 segundos, **no hacer push** hasta optimizarlo o corregirlo.

#### Paso 4: Confirmar Cambios (Commits)
Los mensajes de commit deben ser claros, descriptivos y en **inglés técnico**:
```bash
git add .
git commit -m "feat(auth): implement rbac login and jwt tokens"
```

#### Paso 5: Publicar la Rama (Push)
El primer push debe configurar el upstream hacia el repositorio remoto:
```bash
git push -u origin feat/hu-0X-nombre-modulo
```
Para posteriores cambios en la misma rama:
```bash
git push
```

#### Paso 6: Abrir el Pull Request en GitHub
1. Ir al repositorio en GitHub y hacer clic en **"Compare & pull request"**.
2. Confirmar que la rama destino sea `base: main` y la de origen sea `compare: feat/hu-0X-nombre-modulo`.
3. Título descriptivo: `[HU-0X] Nombre de la Funcionalidad`.
4. En la descripción, referenciar los artefactos de especificación de `specs/00X-...`.

---

## 🛡️ PARTE 2: Guía de Revisión y Aprobación (Líder / Revisor)

Como revisor de código, debes seguir el siguiente protocolo de auditoría antes de autorizar cualquier integración hacia `main`.

### Checklist de Revisión (Compuertas Innegociables)

1. **Estado de GitHub Actions (CI/CD Automático)**:
   Al final del Pull Request, confirmar que los dos trabajos de `.github/workflows/ci.yml` estén en verde en menos de 90 segundos:
   - ✅ `backend-quality-and-security` (Pytest + Bandit SAST)
   - ✅ `frontend-build` (React PWA Lint + Build)
   *(Si alguno está en rojo ❌, el PR queda automáticamente bloqueado).*

2. **Auditoría en la pestaña "Files changed"**:
   - [ ] **Aislamiento modular**: ¿Solo se tocaron archivos dentro de `features/<modulo>`, sus pruebas y las líneas finales de `main.py`/`App.jsx`?
   - [ ] **Desacoplamiento**: ¿No existen foreign keys bloqueantes contra otras ramas y cuenta con seed autónomo?
   - [ ] **Cero secretos quemados (NISTIR 8259A)**: ¿No existen tokens, contraseñas en texto plano ni API keys en el código?
   - [ ] **Pruebas TDD**: ¿Se incluyeron pruebas unitarias/contrato en `backend/tests/` ejecutadas previamente a la solución?
   - [ ] **Idioma y nomenclatura**: ¿Código y commits en inglés? ¿Textos de la interfaz (UI) en español?
   - [ ] **Dominio ganadero**: ¿Se respeta append-only (sin UPDATE/DELETE destructivos) y jerarquía SINIGÁN V6?
   - [ ] **UI, Menú Lateral y Mobile-First**: ¿Se integra en el menú lateral con RBAC y es usable en pantallas móviles (< 768px con targets >= 48px)?

---

### Cómo Emitir la Decisión en GitHub

1. En el PR, entrar a la pestaña **Files changed**.
2. Hacer clic en el botón verde **Review changes** (arriba a la derecha).
3. Seleccionar la acción correspondiente:

| Veredicto | Cuándo aplicarlo | Acción en GitHub |
|---|---|---|
| **Approve** ✅ | Todas las pruebas pasan, CI en verde en < 90s y cumple al 100% la constitución. | Seleccionar **Approve**, ingresar comentario de aprobación y hacer clic en **Submit review**. |
| **Request changes** ❌ | Falla algún test, hay secretos en código, falló el CI o se violó el aislamiento modular. | Seleccionar **Request changes**, detallar los puntos a corregir y hacer clic en **Submit review** (bloquea la fusión). |
| **Comment** 💬 | Preguntas aclaratorias o sugerencias menores no bloqueantes. | Seleccionar **Comment** y hacer clic en **Submit review**. |

### Fusión hacia `main` (Merge)
Una vez aprobado el Pull Request:
1. En la pestaña **Conversation**, hacer clic en el menú desplegable del botón de merge y seleccionar **"Squash and merge"** *(mantiene el historial de `main` limpio y atómico por cada historia de usuario)*.
2. Confirmar con **"Confirm squash and merge"**.
3. Hacer clic en **"Delete branch"** para eliminar la rama remota.
