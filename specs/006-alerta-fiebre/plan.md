# Plan de Implementación: Detección de Fiebre Bovina y Alertas Sanitarias (HU-06)

**Rama**: `feat/hu-06-alerta-fiebre` | **Fecha**: 2026-11-19 | **Spec**: [specs/006-alerta-fiebre/spec.md](spec.md)

---

## Resumen Ejecutivo

Implementación del módulo telemétrico y de alertas sanitarias para detección temprana de fiebre bovina (temperatura corporal > 39.5 °C) a partir de lecturas de collares IoT. La solución abarca desde la ingesta de telemetría con verificación de umbral biológico y latencia estricta (< 10s SLO), hasta la visualización en el panel veterinario y el registro inmutable (append-only) de las atenciones clínicas, garantizando aislamiento modular total y soporte para captura fuera de línea.

---

## Contexto Técnico

- **Lenguaje y Versión**: Python 3.12+ (Backend), JavaScript / React 19 (Frontend).
- **Dependencias Backend**: FastAPI, SQLAlchemy (SQLite), Pydantic v2, Pytest.
- **Dependencias Frontend**: React 19, Vite, Context API, Fetch nativo / Repository Pattern local.
- **Persistencia**: SQLite mediante SQLAlchemy (aislamiento por tabla de módulo).
- **Rendimiento / SLO**: Latencia de procesamiento extremo a extremo menor a 10 segundos desde la ingesta hasta la disponibilidad en el panel.
- **Restricciones de Dominio y Seguridad**:
  - `sinigan_code` modelado como `String` sin llaves foráneas (`ForeignKey`) bloqueantes hacia otros módulos, cumpliendo el aislamiento modular de la constitución.
  - Registro de eventos append-only: Prohibidas las sentencias `UPDATE` o `DELETE` sobre las alertas o atenciones sanitarias.
  - Control de acceso por roles (RBAC): Únicamente usuarios con rol `VETERINARIO` pueden registrar eventos de atención médica.

---

## Verificación de Constitución (.specify/memory/constitution.md)

- **Aislamiento Modular Estricto**: Todo el código se desarrollará exclusivamente en `backend/app/features/alerta_fiebre/` y `frontend/src/features/alerta_fiebre/`.
- **Idioma y Nomenclatura**: Documentación y textos de usuario en español; código (clases, funciones, modelos, endpoints) en inglés.
- **TDD (Test-First)**: Pruebas automatizadas en `backend/tests/test_alerta_fiebre.py` creadas antes de la implementación de la lógica.
- **Historial Append-Only**: La atención crea un registro `fever_alert_attentions` vinculado mediante `referenced_alert_id` sin mutar el registro `fever_alerts`.
- **Jerarquía de Verdad SINIGÁN V6**: Todas las alertas y lecturas indexadas por `sinigan_code`.

---

## Estructura del Módulo

```text
backend/
├── app/
│   └── features/
│       └── alerta_fiebre/
│           ├── __init__.py
│           ├── models.py          # Modelos SQLAlchemy aislados (sinigan_code sin FK)
│           ├── schemas.py         # Contratos Pydantic de entrada/salida
│           ├── services.py        # Lógica de detección de umbral (> 39.5 °C) y agregación
│           └── router.py          # Endpoints REST protegidos con RBAC
└── tests/
    └── test_alerta_fiebre.py      # Pruebas TDD (detección, latencia < 10s, append-only, RBAC)

frontend/
└── src/
    └── features/
        └── alerta_fiebre/
            ├── components/
            │   ├── FeverAlertCard.jsx       # Tarjeta de alerta crítica
            │   ├── AttendAlertModal.jsx     # Formulario de atención append-only
            │   └── OfflineTelemetryQueue.jsx# Monitor de cola de telemetría local
            ├── services/
            │   ├── alertaFiebreService.js    # Conexión con endpoints REST
            │   └── offlineQueueService.js   # Gestión de cola local en almacenamiento local
            ├── FeverAlertsDashboard.jsx     # Vista principal de alertas veterinarias
            └── index.js                     # Exportaciones del módulo
```

---

## Contratos Pydantic (schemas.py)

### 1. Ingesta de Telemetría IoT
```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class TelemetryIngestRequest(BaseModel):
    client_event_id: str = Field(..., description="UUID único generado por el cliente/collar")
    collar_id: str = Field(..., description="Identificador del dispositivo de campo")
    sinigan_code: str = Field(..., description="Identificador oficial del bovino")
    body_temperature: float = Field(..., ge=20.0, le=50.0, description="Temperatura corporal en °C")
    measured_at: datetime = Field(..., description="Fecha y hora de la lectura")

class TelemetryIngestResponse(BaseModel):
    status: str
    alert_generated: bool
    alert_id: Optional[int] = None
    processing_time_ms: float
    message: str
```

### 2. Alertas Sanitarias de Fiebre
```python
from enum import Enum

class AlertSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"

class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ATTENDED = "ATTENDED"

class FeverAlertResponse(BaseModel):
    id: int
    sinigan_code: str
    collar_id: str
    temperature: float
    severity: AlertSeverity
    status: AlertStatus
    detected_at: datetime
    client_event_id: str
    is_offline_sync: bool

    class Config:
        from_attributes = True
```

### 3. Registro de Atención Médica (Append-Only)
```python
class AttendAlertRequest(BaseModel):
    clinical_notes: str = Field(..., min_length=5, description="Notas clínicas y diagnóstico")
    treatment_applied: Optional[str] = Field(None, description="Tratamiento farmacológico o manejo")

class FeverAlertAttentionResponse(BaseModel):
    id: int
    referenced_alert_id: int
    veterinarian_email: str
    attended_at: datetime
    clinical_notes: str
    treatment_applied: Optional[str]

    class Config:
        from_attributes = True
```

---

## Modelo de Datos Aislado (models.py)

De acuerdo con la constitución, para garantizar el aislamiento entre integrantes, no se generan restricciones de llave foránea (`ForeignKey`) con tablas de otros módulos. `sinigan_code` se mantiene como campo indexado de tipo `String`.

```python
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Enum as SQLEnum, Text, Boolean
from app.core.database import Base

class AlertSeverityEnum(str, enum.Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"

class AlertStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ATTENDED = "ATTENDED"

class FeverAlert(Base):
    """
    Registro inmutable de la anomalía de fiebre detectada.
    Nunca se actualiza destructivamente ni se borra.
    """
    __tablename__ = "fever_alerts"

    id = Column(Integer, primary_key=True, index=True)
    client_event_id = Column(String, unique=True, index=True, nullable=False)
    collar_id = Column(String, index=True, nullable=False)
    sinigan_code = Column(String, index=True, nullable=False)  # Sin FK bloqueante
    temperature = Column(Float, nullable=False)
    severity = Column(SQLEnum(AlertSeverityEnum), default=AlertSeverityEnum.CRITICAL, nullable=False)
    status = Column(SQLEnum(AlertStatusEnum), default=AlertStatusEnum.ACTIVE, nullable=False)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    is_offline_sync = Column(Boolean, default=False, nullable=False)

class FeverAlertAttention(Base):
    """
    Evento append-only que atiende una alerta previa.
    """
    __tablename__ = "fever_alert_attentions"

    id = Column(Integer, primary_key=True, index=True)
    referenced_alert_id = Column(Integer, index=True, nullable=False)  # Enlace conceptual append-only
    veterinarian_email = Column(String, nullable=False)
    clinical_notes = Column(Text, nullable=False)
    treatment_applied = Column(Text, nullable=True)
    attended_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
```

---

## Endpoints REST (router.py)

| Método | Ruta | Rol Permitido | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/alerta-fiebre/telemetry` | `OPERARIO` / `VETERINARIO` / Sistema | Ingesta de lectura de collar IoT. Evalúa `temperature > 39.5` y genera alerta en < 10s. |
| `GET` | `/api/v1/alerta-fiebre/alerts` | `VETERINARIO` | Consulta de alertas críticas activas e históricas para el panel clínico. |
| `GET` | `/api/v1/alerta-fiebre/alerts/{alert_id}` | `VETERINARIO` | Detalle de la alerta y su historial de atenciones enlazadas. |
| `POST` | `/api/v1/alerta-fiebre/alerts/{alert_id}/attend` | Exclusivo `VETERINARIO` | Crea un nuevo evento de atención append-only en `fever_alert_attentions`. |

---

## Diseño Frontend: `frontend/src/features/alerta_fiebre/`

1. **`FeverAlertsDashboard.jsx`**:
   - Vista principal para el Veterinario. Muestra contador de alertas activas, listado en tiempo real y semaforización en rojo para `temperature > 39.5 °C`.
2. **`AttendAlertModal.jsx`**:
   - Modal accesible solo para Veterinario. Captura diagnóstico y tratamiento, invocando `POST /attend` y actualizando la vista sin mutar el evento original.
3. **`OfflineTelemetryQueue.jsx` & `offlineQueueService.js`**:
   - Soporte offline: Si el usuario o sensor no tiene conexión, las lecturas se guardan en almacenamiento local y se sincronizan automáticamente con reintentos e idempotencia (`client_event_id`).
