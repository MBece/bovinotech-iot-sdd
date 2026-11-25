# Plan de Implementación: HU-10 — Observabilidad Técnica, Cumplimiento SLI/SLO y Presupuesto de Error (Error Budget)

**Rama:** `feat/hu-10-observability-ops` | **Fecha:** 2026-11-24 | **Spec:** [spec.md](spec.md)  
**Módulo:** `observability_ops` *(Transversal y SRE)*  
**Ubicación Backend:** `backend/app/features/observability_ops/`  
**Ubicación Frontend:** `frontend/src/features/observability_ops/`  

---

## 1. Resumen y Contexto Técnico

Implementación de la infraestructura transversal de observabilidad técnica y gobernanza basada en **Presupuesto de Error (*Error Budget*)**. El subsistema provee propagación de `correlation_id` para trazabilidad distribuida, cálculo en tiempo real de indicadores SLI/SLO (latencia p99 de alertas IoT $< 10\text{ s}$ e integridad de sincronización $99.9\%$), y una compuerta automatizada de **Congelamiento de Cambios (*Feature Freeze*)** cuando el presupuesto se agota, además de un simulador de degradación controlada para demostración en vivo.

* **Lenguaje y Versiones:** Python 3.12 (FastAPI, Pydantic v2, SQLAlchemy) y React 19 (Vite, CSS Modules / CSS-in-JS).
* **Dependencias:** `uuid`, `time`, `datetime`, `collections.deque` para buffers circulares en memoria sin sobrecargar SQLite.
* **SLO Clave:**
  * Latencia de alertas críticas: 99% de eventos procesados en $< 10\text{ segundos}$.
  * Tasa de éxito de sincronización rural por lotes: $99.9\%$.
  * Ejecución de suite de pruebas CI en menos de 90 segundos.
* **Ciberseguridad (NISTIR 8259A & ISO 25010):** Sanitización estricta de registros de log (cero tokens completos, contraseñas o datos personales en texto plano).

---

## 2. Verificación de Constitución (Constitution Check)

- [x] **Aislamiento Modular Estricto:** Toda la lógica reside en `backend/app/features/observability_ops/` y `frontend/src/features/observability_ops/`.
- [x] **Integración Limpia:** Únicos archivos compartidos son `backend/app/main.py` (registro de middleware y router `/ops`) y `frontend/src/App.jsx` (pestaña técnica separada).
- [x] **Segregación de Vistas:** El tablero técnico no expone costos ni datos de negocio de animales, manteniéndose puramente en métricas SRE.
- [x] **Sin Operaciones Destructivas:** La telemetría y métricas operan en memoria y anexión sin mutar entidades históricas.
- [x] **TDD Estricto:** Pruebas automatizadas en `backend/tests/test_observability_ops.py` antes de codificar la solución productiva.

---

## 3. Contratos de Datos y Esquemas Pydantic v2 (`schemas.py`)

```python
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class BudgetStatus(str, Enum):
    SALUDABLE = "SALUDABLE"
    AGOTADO = "AGOTADO"

class LogEntry(BaseModel):
    timestamp: datetime
    level: str
    correlation_id: str
    message: str
    context: Dict[str, Any] = Field(default_factory=dict)

class ServiceLevelMetrics(BaseModel):
    latency_p99_seconds: float
    latency_p50_seconds: float
    sync_success_rate_percent: float
    error_rate_percent: float
    total_processed_events: int
    active_alerts_count: int

class ErrorBudgetStatus(BaseModel):
    budget_percentage_remaining: float
    status: BudgetStatus
    is_freeze_active: bool
    freeze_reason: Optional[str] = None
    target_slo_latency_seconds: float = 10.0
    target_slo_sync_success: float = 99.9

class DegradationSimulationRequest(BaseModel):
    inject_latency_seconds: float = Field(default=12.5, ge=0.0)
    inject_error_rate_percent: float = Field(default=5.0, ge=0.0, le=100.0)
    is_active: bool = True

class DegradationSimulationResponse(BaseModel):
    is_active: bool
    status: BudgetStatus
    is_freeze_active: bool
    message: str
```

---

## 4. Endpoints de la API (`router.py`)

* `GET /ops/metrics`: Retorna las métricas consolidadas en tiempo real (`ServiceLevelMetrics`) y el estado del Error Budget.
* `GET /ops/error-budget`: Retorna exclusivamente el estado del Error Budget y si la compuerta *Feature Freeze* está activa.
* `GET /ops/logs`: Retorna los últimos 50 registros estructurados con `correlation_id` para inspección técnica.
* `POST /ops/simulate-degradation`: Activa o desactiva la degradación simulada para demostración en vivo del paso de `SALUDABLE` a `AGOTADO`.

---

## 5. Arquitectura del Componente Frontend (`frontend/src/features/observability_ops/`)

* `ObservabilityDashboard.jsx`:
  * Tarjetas de estado SLI/SLO: Latencia p99, Tasa de Éxito de Sincronización y Tasa de Error.
  * Medidor de Presupuesto de Error (*Error Budget Gauge*): Barra dinámica de 0 a 100%.
  * **Banner de Alerta Crítica (Feature Freeze):** Se activa en color rojo pulsante cuando el status es `AGOTADO`, indicando la suspensión de nuevos despliegues.
  * **Panel de Control de Simulación:** Botones interactivos para alternar entre "Estado Saludable" y "Simular Degradación Crítica (Agotar Error Budget)".
