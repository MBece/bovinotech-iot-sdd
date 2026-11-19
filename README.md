# BovinoTech IoT - Plataforma de Trazabilidad Ganadera (SDD + Multiagente)

Plataforma agroindustrial offline-first para la gestion sanitaria, trazabilidad bovina compatible con **SINIGAN V6** y monitoreo telemetrico IoT en entornos rurales con conectividad intermitente.

Proyecto desarrollado bajo **Spec-Driven Development (SDD)** con **GitHub Spec Kit** y una arquitectura **Multiagente (Modalidad B)** para el curso de *Procesos Modernos de Desarrollo de Software* (Universidad EAFIT).

---

## Arquitectura y Stack Tecnologico

- **Metodologia:** Spec-Driven Development (SDD) + Test-Driven Development (TDD) + Vertical Slicing.
- **Orquestacion IA:** GitHub Spec Kit (specify-cli) + Gemini CLI (@google/gemini-cli) con 3 agentes diferenciados en .github/agents/.
- **Backend:** Python 3.12, FastAPI, SQLAlchemy (SQLite), Pydantic, Pytest, Bandit (SAST).
- **Frontend:** React 19, Vite (PWA), ESLint.
- **CI/CD y DevSecOps:** GitHub Actions (.github/workflows/ci.yml).

### Estructura Modular Aislada (Cero Conflictos de Merge)
Cada integrante desarrolla su funcionalidad de forma vertical y aislada dentro de su propia carpeta features/<modulo>:

- .github/agents/ -> Topologia de 3 agentes (Especificador, Implementador, QA-Seguridad)
- .github/workflows/ci.yml -> Pipeline automatico (Pytest + Bandit SAST + Vite Build)
- .specify/memory/constitution.md -> Reglas innegociables del dominio (SINIGAN V6, Append-Only, Offline)
- backend/app/features/ -> Modulos aislados por historia de usuario (FastAPI)
- backend/tests/ -> Pruebas automatizadas TDD (Pytest)
- frontend/src/features/ -> Interfaces React aisladas por historia de usuario
- GEMINI.md -> Contexto multiagente automatico para Gemini CLI

---

## Guia de Instalacion Rapida para el Equipo

### Prerrequisitos
- Git
- Python 3.11+
- Node.js 20+ (incluye npm)
- Cuenta de Google (para usar Gemini CLI gratuitamente)

### 1. Clonar el Repositorio
    git clone [https://github.com/MBece/bovinotech-iot-sdd.git](https://github.com/MBece/bovinotech-iot-sdd.git)
    cd bovinotech-iot-sdd

### 2. Configurar y Levantar el Backend (FastAPI)
En Windows (PowerShell):
    cd backend
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    pytest
    uvicorn app.main:app --reload

(En Mac/Linux activa el entorno con: source .venv/bin/activate)
- API disponible en: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Documentacion interactiva (Swagger): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Configurar y Levantar el Frontend (React + Vite)
En otra terminal, desde la raiz del proyecto:
    cd frontend
    npm install
    npm run dev

- Aplicacion disponible en: http://localhost:5173

### 4. Instalar Herramientas SDD (GitHub Spec Kit + Gemini CLI)
    pip install git+[https://github.com/github/spec-kit.git](https://github.com/github/spec-kit.git)
    npm install -g @google/gemini-cli

Inicia gemini en la raiz del proyecto (la primera vez pedira autenticar con cuenta de Google en el navegador).

---

## Flujo de Trabajo SDD Multiagente (Obligatorio por Historia)

> 📖 **Guía Completa de Contribución:** Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para ver la guía detallada de comandos Git, verificación pre-push y el manual de revisión y aprobación de Pull Requests.

1. Crear rama aislada: git checkout -b feat/hu-0X-nombre-modulo
2. Abrir Gemini CLI: gemini
3. Especificar (@especificador): Ejecutar /speckit.specify describiendo el QUE (sin tecnologias, respetando constitution.md).
4. Planificar (@especificador): Ejecutar /speckit.plan definiendo el COMO dentro de backend/app/features/<modulo>/ y frontend/src/features/<modulo>/.
5. Desglosar Tareas: Ejecutar /speckit.tasks
6. Implementar con TDD (@implementador): Ejecutar /speckit.implement (pruebas primero en backend/tests/, luego codigo).
7. Auditar y Validar (@qa-seguridad): Verificar seguridad, correr pytest y npm run build.
8. Subir cambios: git push -u origin feat/hu-0X-nombre-modulo y abrir Pull Request hacia main.

---

## Reglas Innegociables del Dominio (constitution.md)

1. Historial Append-Only: Los eventos sanitarios son inmutables. Prohibido usar UPDATE o DELETE destructivos; las correcciones crean un nuevo registro enlazado mediante corrected_event_id.
2. Jerarquia de Verdad SINIGAN V6: Toda discrepancia entre captura en campo y el registro oficial se envia a una cola de conflictos para resolucion humana por un VETERINARIO.
3. Offline-First e Idempotencia: Toda operacion local lleva un client_event_id (UUID) para evitar duplicados al reconectar.
