# Guía de Contribución y Flujo de Trabajo: BovinoTech IoT

Esta guía define el protocolo obligatorio para la creación de ramas, desarrollo aislado, verificación de calidad y el proceso de aprobación de Pull Requests (PR) en el proyecto **BovinoTech IoT**.

---

## 📌 PARTE 1: Guía para Desarrolladores

### 1. Convención de Ramas
Cada historia de usuario (HU) o módulo debe desarrollarse en su propia rama aislada partiendo siempre de `main` actualizado:

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

#### Paso 2: Desarrollo con Aislamiento Modular Estricto
De acuerdo con [.specify/memory/constitution.md](.specify/memory/constitution.md), cada integrante trabaja **únicamente** dentro de su espacio asignado:
- **Backend**: `backend/app/features/<modulo>/`
- **Frontend**: `frontend/src/features/<modulo>/`
- **Pruebas Backend**: `backend/tests/test_<modulo>.py`
- **Especificaciones**: `specs/00X-<modulo>/`

> ⚠️ **Prohibido:** Modificar código de módulos pertenecientes a otros integrantes o alterar `constitution.md`.

#### Paso 3: Verificación Local Pre-Push (Obligatoria)
Antes de enviar cambios al repositorio remoto, es obligatorio verificar que la suite de pruebas y compilación pase sin errores:

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

Si algún paso falla localmente, **no hacer push** hasta corregirlo.

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
Para posteriores cambios en la misma rama basta con:
```bash
git push
```

#### Paso 6: Abrir el Pull Request en GitHub
1. Ir al repositorio en GitHub.
2. Hacer clic en **"Compare & pull request"**.
3. Confirmar que la rama destino sea `base: main` y la de origen sea `compare: feat/hu-0X-nombre-modulo`.
4. Asignar un título descriptivo: `[HU-0X] Nombre de la Funcionalidad`.
5. En la descripción, referenciar las especificaciones de `specs/00X-...` y describir brevemente los cambios.

---

## 🛡️ PARTE 2: Guía de Revisión y Aprobación (Líder / Revisor)

Como revisor de código, debes seguir el siguiente protocolo de auditoría antes de autorizar cualquier integración hacia `main`.

### Checklist de Revisión

1. **Estado de GitHub Actions (CI/CD Automático)**:
   Al final del Pull Request, confirmar que los dos trabajos de `.github/workflows/ci.yml` estén en verde:
   - ✅ `backend-quality-and-security` (Pytest + Bandit SAST)
   - ✅ `frontend-build` (React PWA Build)
   *(Si alguno está en rojo ❌, el PR queda automáticamente bloqueado).*

2. **Auditoría en la pestaña "Files changed"**:
   - [ ] **Aislamiento modular**: ¿Solo se tocaron los archivos dentro de `features/<modulo>` y su test asociado?
   - [ ] **Cero secretos quemados**: ¿No existen tokens, passwords en texto plano ni API keys quemadas?
   - [ ] **Pruebas TDD**: ¿Se incluyeron pruebas unitarias/integración en `backend/tests/`?
   - [ ] **Idioma y nomenclatura**: ¿Código, variables y funciones en inglés? ¿Textos de la interfaz (UI) en español?
   - [ ] **Reglas de dominio ganadero**: En eventos sanitarios, ¿se respeta el principio append-only (sin UPDATE/DELETE destructivos)?

---

### Cómo Emitir la Decisión en GitHub

1. En el PR, entrar a la pestaña **Files changed**.
2. Hacer clic en el botón verde **Review changes** (arriba a la derecha).
3. Seleccionar la acción correspondiente:

| Veredicto | Cuándo aplicarlo | Acción en GitHub |
|---|---|---|
| **Approve** ✅ | Todas las pruebas pasan, CI en verde y cumple al 100% la constitución. | Seleccionar **Approve**, ingresar comentario de aprobación y hacer clic en **Submit review**. |
| **Request changes** ❌ | Falla algún test, hay secretos en código, falló el CI o se violó el aislamiento modular. | Seleccionar **Request changes**, detallar los puntos a corregir y hacer clic en **Submit review** (bloquea la fusión). |
| **Comment** 💬 | Preguntas aclaratorias o sugerencias menores no bloqueantes. | Seleccionar **Comment** y hacer clic en **Submit review**. |

### Fusión hacia `main` (Merge)
Una vez aprobado el Pull Request:
1. En la pestaña **Conversation**, hacer clic en el menú desplegable del botón de merge y seleccionar:  
   **"Squash and merge"** *(mantiene el historial de `main` limpio y atómico por cada historia de usuario)*.
2. Confirmar con **"Confirm squash and merge"**.
3. Hacer clic en **"Delete branch"** para eliminar la rama de trabajo remota y mantener el repositorio organizado.
