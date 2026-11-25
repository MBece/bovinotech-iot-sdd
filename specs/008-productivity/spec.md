# Especificación de Funcionalidad: Productividad por lote

**Rama de Funcionalidad**: `feat/hu-08-productivity`

**Fecha de Creación**: 2026-11-24

**Estado**: Draft

**Entrada**: Descripción de usuario: Registro de pesajes y consumo por lote; cálculo de GDP y eficiencia alimenticia; identificación de pesajes atípicos; indicación de datos insuficientes.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Registrar pesajes y consumo por lote (Prioridad: P1)

Como operario de finca, quiero registrar pesajes de animales y consumo de alimento asociados a un lote, para mantener datos productivos completos y disponibles durante la operación de campo.

**Rol y Dispositivo Objetivo**: OPERARIO en smartphone de campo; ADMINISTRADOR con acceso de consulta.

**Por qué esta prioridad**: Los registros de peso y consumo son la evidencia necesaria para calcular el desempeño productivo del lote.

**Prueba Independiente**: Registrar dos pesajes fechados para un animal y un consumo para su lote, y comprobar que quedan asociados y consultables sin depender de otros módulos.

**Escenarios de Aceptación**:

1. **Given** un lote activo y un animal identificado, **When** el operario registra un pesaje con fecha y peso, **Then** el pesaje queda asociado al animal y al lote con su autor y momento de captura.
2. **Given** un lote activo, **When** el operario registra una cantidad de alimento consumido y su periodo, **Then** el consumo queda asociado al lote y puede consultarse junto con sus pesajes.
3. **Given** que el dispositivo no tiene conectividad, **When** el operario registra un pesaje o consumo válido, **Then** el dato queda disponible localmente para su sincronización posterior sin duplicarse.

---

### Historia de Usuario 2 - Consultar indicadores y revisión de pesajes atípicos (Prioridad: P1)

Como administrador o veterinario, quiero consultar la GDP y la eficiencia alimenticia del lote, revisar los pesajes con variaciones inusuales y distinguir los resultados incompletos, para tomar decisiones con datos confiables.

**Rol y Dispositivo Objetivo**: ADMINISTRADOR o VETERINARIO en escritorio o dispositivo móvil.

**Por qué esta prioridad**: Los indicadores permiten comparar desempeño entre lotes y evitan que registros dudosos alteren los promedios.

**Prueba Independiente**: Calcular los indicadores con datos completos, agregar un pesaje atípico y comprobar que se conserva para revisión pero no afecta los resultados pendientes.

**Escenarios de Aceptación**:

1. **Given** que un animal del lote tiene un peso inicial, un peso final y los días transcurridos, **When** el usuario consulta la GDP, **Then** el sistema muestra `(Peso final - Peso inicial) / Días`.
2. **Given** que el lote tiene consumo total y ganancia de peso válida mayor que cero, **When** el usuario consulta la eficiencia alimenticia, **Then** el sistema muestra `Consumo total / Kg ganados`.
3. **Given** que un animal tiene una variación absoluta de peso superior a 15 kg en un intervalo menor que 24 horas, **When** se registra el nuevo pesaje, **Then** queda marcado `ATIPICO_EN_REVISION`, se conserva sin borrarse y se excluye temporalmente de los cálculos y promedios.
4. **Given** que faltan pesajes necesarios, días transcurridos, consumo, ganancia positiva de peso o costos para el resumen solicitado, **When** el usuario consulta el indicador o resumen correspondiente, **Then** se muestra `DATOS_INSUFICIENTES` y no se presenta un valor estimado como si fuera válido.
5. **Given** un pesaje marcado `ATIPICO_EN_REVISION`, **When** un usuario autorizado lo revisa, **Then** el resultado de la revisión queda registrado y el dato original permanece preservado; solo los datos aprobados participan en los cálculos posteriores.

---

### Casos de Borde y Condiciones Rurales

- Una variación exactamente igual a 15 kg no supera el umbral y no se marca por esta regla.
- Una variación superior a 15 kg ocurrida exactamente a las 24 horas no cumple la condición de intervalo menor a 24 horas.
- Las variaciones negativas se evalúan por su valor absoluto; tanto una subida como una bajada superior a 15 kg en menos de 24 horas requieren revisión.
- Un pesaje atípico pendiente o rechazado permanece visible en el historial, pero no se usa en promedios ni indicadores.
- Si el periodo no tiene días transcurridos positivos, no se calcula GDP.
- Si la ganancia de peso válida es cero o negativa, no se calcula eficiencia alimenticia.
- Si falta cualquier dato requerido por el indicador consultado, se informa `DATOS_INSUFICIENTES`; no se sustituyen datos ausentes por cero.
- La pérdida de conectividad no debe impedir registrar pesajes o consumo en campo; la sincronización posterior debe evitar duplicados.
- Los registros históricos son append-only: una corrección se registra como un nuevo evento enlazado al anterior mediante `corrected_event_id`, sin modificar ni borrar el dato original.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir registrar pesajes con animal, lote, fecha y hora de captura, peso, autor y estado de revisión.
- **FR-002**: El sistema DEBE permitir registrar consumo de alimento por lote y periodo, incluyendo cantidad y unidad de medida.
- **FR-003**: El sistema DEBE asociar cada registro al lote activo y al identificador del animal cuando se trate de un pesaje.
- **FR-004**: El sistema DEBE calcular la GDP como `(Peso final - Peso inicial) / Días`, usando pesajes aprobados del mismo animal y un intervalo con días transcurridos positivos.
- **FR-005**: El sistema DEBE calcular la eficiencia alimenticia como `Consumo total / Kg ganados`, usando consumo y ganancia de peso válidos del lote.
- **FR-006**: El sistema DEBE marcar `ATIPICO_EN_REVISION` cualquier pesaje cuya diferencia absoluta respecto al pesaje anterior del mismo animal exceda 15 kg en un intervalo menor a 24 horas.
- **FR-007**: El sistema DEBE conservar los pesajes atípicos y excluirlos de cálculos y promedios mientras estén pendientes o rechazados; tras su aprobación, podrán participar en los cálculos correspondientes.
- **FR-008**: El sistema DEBE mostrar `DATOS_INSUFICIENTES` cuando falten muestras, periodos, consumos, costos requeridos por el resumen solicitado o una ganancia de peso positiva para el indicador correspondiente.
- **FR-009**: El sistema NO DEBE inventar valores, presentar ceros sustitutos ni calcular indicadores con datos insuficientes.
- **FR-010**: El sistema DEBE preservar el historial de pesajes y consumos como append-only; toda corrección debe crear un nuevo registro enlazado mediante `corrected_event_id`.
- **FR-011**: El sistema DEBE registrar autor, fecha y resultado de la revisión de pesajes atípicos, y restringir la revisión a usuarios autorizados por su rol y finca activa.
- **FR-012**: El sistema DEBE permitir la captura offline de pesajes y consumos, y sincronizarlos sin duplicación al restablecerse la conectividad.
- **FR-013**: El sistema DEBE presentar el estado de conectividad y la cantidad de registros pendientes de sincronización de acuerdo con la experiencia de campo del proyecto.

### Requisitos de Experiencia y Entorno (UI, Responsive y Campo)

- **UI-001**: La interfaz móvil (< 768 px) DEBE permitir registrar pesajes y consumo con áreas táctiles mínimas de 48x48 px y alto contraste legible bajo luz solar.
- **UI-002**: La interfaz DEBE mostrar claramente lote, periodo, animal, unidades, estado de revisión e indicador o motivo de `DATOS_INSUFICIENTES`.
- **UI-003**: Los campos de peso y cantidad DEBEN facilitar la entrada numérica en dispositivos móviles.
- **UI-004**: La vista DEBE distinguir los pesajes atípicos pendientes de los registros aprobados o rechazados, sin ocultar ni borrar su historial.
- **UI-005**: La funcionalidad DEBE estar disponible desde el Menú Lateral y filtrar acciones de revisión según el rol activo.

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **Lote**: Grupo de animales gestionado como unidad productiva, identificado dentro de una finca.
- **Pesaje**: Observación inmutable del peso de un animal en una fecha y hora, asociada al lote, con autor y estado de revisión.
- **Consumo de alimento**: Cantidad de alimento consumida por un lote durante un periodo, expresada en una unidad identificable.
- **Revisión de pesaje atípico**: Decisión auditable que conserva el pesaje original e indica si se aprueba o rechaza su uso en cálculos.
- **Indicador de productividad**: Resultado de GDP o eficiencia alimenticia calculado con muestras aprobadas y datos completos.

## Criterios de Éxito y Metas de Servicio (SLO) *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100% de los pesajes y consumos registrados muestran el lote asociado, la fecha de captura y el autor.
- **SC-002**: El 100% de las variaciones superiores a 15 kg en menos de 24 horas se identifica como `ATIPICO_EN_REVISION` y se excluye de los promedios hasta su revisión.
- **SC-003**: El 100% de las consultas con datos completos muestran los indicadores calculados con las fórmulas definidas.
- **SC-004**: El 100% de las consultas con entradas requeridas ausentes muestran `DATOS_INSUFICIENTES` en lugar de un valor inventado.
- **SC-005**: La captura de pesajes y consumo en campo permanece disponible sin conectividad y los registros válidos se sincronizan sin duplicados al reconectar.
- **SC-006**: Ningún pesaje o consumo histórico desaparece ni cambia por una corrección; el 100% de las correcciones conserva el vínculo y motivo de auditoría.

## Supuestos y Restricciones de Dominio

- El peso de un animal se compara con su pesaje cronológicamente anterior; se evalúa el valor absoluto de la diferencia.
- Los pesajes pendientes de revisión no se consideran muestras aprobadas para indicadores ni promedios.
- El lote es la unidad para agregar consumo y kg ganados; la GDP individual se calcula por animal y el resumen del lote se basa en los animales con pares de pesajes aprobados.
- No se define una fórmula de rentabilidad o costo por kilogramo. Si el resumen solicitado depende de costos y estos faltan, se indica `DATOS_INSUFICIENTES` sin inferir un resultado económico.
- Los OPERARIOS pueden capturar datos; ADMINISTRADORES o VETERINARIOS autorizados pueden revisar pesajes atípicos, siempre dentro de su finca activa.
- La captura de campo puede ocurrir con conectividad intermitente y debe conservar la autoría y fecha real de captura.
