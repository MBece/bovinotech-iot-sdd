# Triage de revisiones A6A/A6B

## A6A — Arquitectura

Veredicto: **aprobar**. Sin Critical/High/Medium. Hallazgos Low F-01…F-06, no bloqueantes.

## A6B — Código

Veredicto: **aprobado con observaciones**. Sin Critical/High. Tres Medium:

| ID | Hallazgo | Severidad | Responsable | Estado |
|---|---|---|---|---|
| M-01 | Timestamps naive de SQLite serializados sin zona; UI los interpreta como hora local | Medium | A3 | En corrección |
| M-02 | Estado de comparación anterior persiste tras un error | Medium | A4 | En corrección |
| M-03 | Carrera al cargar detalle de tickets; posible mismatch de ticket | Medium | A4 | En corrección |

Low seleccionados para corrección:

| ID | Hallazgo | Responsable | Estado |
|---|---|---|---|
| L-03 | `FIELD_LABELS` indexado directo | A3 | En corrección |
| L-04 | Recarga fallida tras resolver deja formulario OPEN | A4 | En corrección |
| L-05 / F-03 | Seed parcial no repara DIN faltantes | A3 | En corrección |
| L-07 / F-06 | Carga inicial de tickets duplicada | A4 | En corrección |
| L-09 | Origen de campo muestra código crudo | A4 | En corrección |

Low diferidos y documentados: L-01 (409 sin campo), L-02 (concurrencia), L-06 (seed en import), L-08 (rama roja y README G2), L-10 (quickstart), L-11 (tests de componente). No bloquean AC-01…AC-04.
