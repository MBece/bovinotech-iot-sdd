# Especificación de Funcionalidad: Sincronización por lotes, idempotencia y reintentos controlados (HU-003)

**Rama sugerida**: `feat/hu-003-offline-sync`  
**Módulo**: `offline_sync`  
**Estado**: COMPLETADA  
**Prioridad**: MUST — Línea base, iteraciones 1 y 2

> Este documento toma la historia suministrada como fuente funcional. Las decisiones técnicas pertenecen a `plan.md`.

## Historia de Usuario

Como sistema quiero transmitir por lotes al servidor los eventos pendientes capturados sin conexión, garantizando idempotencia y reintentos progresivos, para consolidar la información de campo sin pérdidas ni duplicados al restablecerse la red.

## Reglas de negocio

- Ningún evento local se elimina hasta recibir confirmación explícita del servidor.
- El servidor procesa cada `client_event_id` de forma idempotente y reconoce reenvíos sin duplicar el registro.
- Los fallos transitorios conservan el evento local para un reintento posterior con espera progresiva.

## Criterios de aceptación

1. **Dado un lote pendiente, cuando vuelve la conectividad, entonces cada elemento queda confirmado como sincronizado, duplicado o fallido.**
2. **Dado un corte prolongado con eventos válidos, cuando vuelve la conexión, entonces se sincronizan sin pérdida ni duplicación.**
3. **Dado un evento ya sincronizado, cuando se reenvía, entonces el servidor responde como duplicado y conserva un único registro.**
4. **Dado un lote con resultados parciales, cuando termina el envío, entonces solo los fallidos permanecen disponibles para reintento.**

## Fuera de alcance

- Integraciones reales con dispositivos o servicios oficiales no suministrados.
- Sobrescrituras automáticas de información oficial o histórica.
- Cambios a módulos de otras historias fuera de los puntos compartidos autorizados.
