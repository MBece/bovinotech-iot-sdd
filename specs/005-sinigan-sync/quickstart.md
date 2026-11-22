# Quickstart: HU-05 `sinigan_sync`

## Requisitos

- Python 3.11+ con las dependencias de `backend/requirements.txt`.
- Node.js 20+ con `npm`.

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API: `http://127.0.0.1:8000`  
Swagger: `http://127.0.0.1:8000/docs`

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Flujo demo

1. Iniciar sesión como `operario@bovinotech.co` / `password123`.
2. Consultar `DIN-DEMO-000001`: ficha consistente con etiqueta `MODO SIMULADO (SINIGÁN V6 MOCK)`.
3. Consultar `DIN-DEMO-999999`: no encontrado, sin ticket.
4. Comparar `DIN-DEMO-000002`: discrepancia de sexo y ticket abierto.
5. Comparar `DIN-DEMO-000003`: discrepancia de grupo etario y ticket abierto.
6. Cerrar sesión e iniciar como `vet@bovinotech.co` / `password123`.
7. Abrir un ticket, registrar decisión y motivo, y verificar el cierre con trazabilidad.

## Pruebas

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ../frontend
npm run lint
npm run build
# Ejecuta toda la suite Node de la rebanada (utilidades + servicio + etiquetas):
node --test
```

## Evidencia

La evidencia del run queda en `docs/evidence/hu-05-sinigan-sync/`.
