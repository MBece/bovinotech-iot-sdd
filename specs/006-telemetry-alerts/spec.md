# Especificación de Funcionalidad: Telemetría IoT y alertas tempranas (HU-006)

**Rama sugerida**: `feat/hu-006-telemetry-alerts`  
**Módulo**: `telemetry`  
**Estado**: POR HACER  
**Prioridad**: SHOULD — Iteración 3

> Este documento define únicamente el comportamiento esperado. Las decisiones técnicas pertenecen a `plan.md`.

## Historia de Usuario

Como operario de una finca quiero recibir alertas tempranas de inmovilidad y salida de potrero generadas a partir de telemetría propia de BovinoTech, para actuar oportunamente y dejar constancia de la atención realizada.

## Prueba independiente

Inyectar un conjunto reproducible de lecturas que incluya inmovilidad prolongada, cruce de geocerca, datos normales, duplicados y huecos de ubicación; comprobar que se abren únicamente las alertas justificadas, que los datos insuficientes no producen falsos positivos, que el reenvío no duplica registros y que un usuario autorizado puede cerrar cada alerta dejando trazabilidad.

## Reglas de negocio

- La telemetría pertenece a BovinoTech y se mantiene separada de las referencias oficiales o simuladas de SINIGÁN.
- Cada lectura identifica de forma inequívoca al dispositivo, al animal, a la finca, al instante de captura y al lote de envío.
- El reenvío del mismo lote o de una lectura ya aceptada devuelve el resultado previo sin duplicar lecturas ni alertas.
- Las lecturas fuera de rango, con coordenadas imposibles o con secuencia temporal inválida se rechazan con una explicación trazable.
- Las reglas de inmovilidad y geocerca se evalúan con la versión vigente al momento del procesamiento; cada alerta conserva la versión aplicada.
- La falta de evidencia suficiente se clasifica como `INSUFFICIENT_DATA` y nunca abre una alerta de inmovilidad o salida de potrero.
- Una alerta abierta no se cierra automáticamente. Su cierre exige una decisión humana, observación, autor y fecha.
- Una alerta repetida del mismo tipo, animal y condición activa no crea múltiples alertas abiertas; agrega evidencia a la alerta existente.
- Toda consulta, configuración y acción humana se limita a la finca activa del usuario.
- El `OPERARIO` puede consultar y cerrar alertas de su finca; el `VETERINARIO` puede consultar y cerrar; el `ADMINISTRADOR` puede además configurar geocercas y reglas; el `DIRECTIVO` tiene consulta de solo lectura.
- La última posición conocida solo se muestra cuando procede de una lectura válida y se acompaña de su fecha de captura.

## Criterios de aceptación

1. **Dado un animal con actividad por debajo del umbral durante el periodo configurado, cuando se procesa evidencia suficiente, entonces se abre una única alerta de inmovilidad con animal, regla aplicada, periodo y última ubicación válida disponible.**
2. **Dado un animal cuya ubicación válida cruza desde el interior hacia el exterior de la geocerca vigente, cuando se procesa la lectura, entonces se abre una única alerta de salida de potrero con la última posición conocida y su fecha.**
3. **Dadas lecturas ausentes, atrasadas o sin precisión suficiente, cuando no existe evidencia para afirmar inmovilidad o cruce, entonces el resultado se clasifica como `INSUFFICIENT_DATA` y no se genera una alerta falsa.**
4. **Dado un lote ya procesado, cuando se reenvía con el mismo identificador y contenido, entonces se devuelve el mismo resultado sin duplicar lecturas, evaluaciones ni alertas.**
5. **Dado un lote ya procesado, cuando se reenvía con el mismo identificador pero contenido diferente, entonces se rechaza por conflicto y no se altera el resultado original.**
6. **Dada una alerta abierta, cuando un operario o veterinario de la misma finca la cierra con una observación, entonces queda cerrada con autor y fecha, conservando toda la evidencia previa.**
7. **Dado un usuario de otra finca o sin permiso de escritura, cuando intenta consultar datos ajenos, configurar reglas o cerrar una alerta, entonces la operación se rechaza sin revelar información de la otra finca.**
8. **Dado un administrador que publica una nueva regla o geocerca válida, cuando se activa, entonces las evaluaciones posteriores usan la nueva versión y las alertas existentes conservan la versión original.**
9. **Dado el flujo bajo carga sintética del piloto, cuando se mide el tiempo entre recepción válida y alerta persistida, entonces el percentil 95 es menor a dos minutos; para alertas críticas se mantiene el objetivo operativo inferior a diez segundos.**
10. **Dada una lectura con valores o coordenadas imposibles, cuando se recibe, entonces se rechaza de forma individual, se conserva el diagnóstico del lote y las demás lecturas válidas pueden procesarse.**

## Requisitos funcionales

- **FR-001**: El sistema DEBE aceptar lotes de telemetría autenticados e idempotentes.
- **FR-002**: El sistema DEBE validar identidad del dispositivo, finca, animal, instante, orden temporal, rangos, coordenadas y precisión declarada.
- **FR-003**: El sistema DEBE evaluar reglas versionadas de inmovilidad y cruce de geocerca.
- **FR-004**: El sistema DEBE representar explícitamente los resultados `NORMAL`, `ALERT_TRIGGERED`, `INSUFFICIENT_DATA` y `REJECTED`.
- **FR-005**: El sistema DEBE impedir alertas duplicadas mientras persista una misma condición activa.
- **FR-006**: El sistema DEBE conservar la evidencia, versión de regla y correlación que originaron cada alerta.
- **FR-007**: El sistema DEBE permitir consultar y filtrar alertas de la finca activa por estado, tipo y animal.
- **FR-008**: El sistema DEBE exigir cierre humano trazable para pasar una alerta de abierta a cerrada.
- **FR-009**: El sistema DEBE mantener separación estricta entre fincas y mínimo privilegio por rol.
- **FR-010**: El sistema DEBE mostrar la última posición válida con su antigüedad, sin presentar una ubicación desactualizada como actual.

## Entidades conceptuales

- **Dispositivo**: collar o emisor registrado, asociado a una finca y a un animal durante un intervalo válido.
- **Lote de telemetría**: unidad idempotente de envío y diagnóstico.
- **Lectura de telemetría**: medición propia de BovinoTech con captura temporal, actividad y ubicación opcional.
- **Geocerca**: límite versionado del potrero aplicable a una finca.
- **Regla de alerta**: umbrales y ventanas versionados para evaluar una condición.
- **Evaluación**: resultado trazable de aplicar una regla a evidencia suficiente o insuficiente.
- **Alerta**: condición abierta o cerrada, asociada a una finca, animal, regla y evidencia.
- **Cierre de alerta**: decisión humana con autor, fecha y observación.

## Fuera de alcance

- Integración con una API oficial de SINIGÁN o uso de la telemetría como fuente de propiedad legal.
- Control remoto del collar o del cercado físico.
- Diagnóstico clínico automático, prescripción de tratamientos o cierre automático de alertas.
- Notificaciones por SMS, correo o servicios externos.
- Mapas avanzados, rutas históricas o predicción mediante aprendizaje automático.
- Cambios en los módulos de las HU-001 a HU-005 fuera de los puntos compartidos autorizados.

