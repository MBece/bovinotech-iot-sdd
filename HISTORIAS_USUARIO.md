# Especificaciones Funcionales — 10 Historias de Usuario (MVP BovinoTech IoT)

**Asignatura:** Especialización en Desarrollo de Software – Universidad EAFIT  
**Enfoque:** Spec-Driven Development (GitHub Spec Kit) · Lean-Kanban (`WIP = 1`) · Vertical Slicing  
**Alineación:** `constitution.md` y Documento E2E (Agile · DevOps · SRE)

---

## 1. Contratos Funcionales Globales (Cierre de Definiciones)

Para garantizar el trabajo en paralelo de los 5 integrantes sin ambigüedades ni bloqueos:

* **Roles del sistema:** `ADMINISTRADOR`, `OPERARIO`, `VETERINARIO` y `DIRECTIVO`.
* **Identificador oficial de referencia:** `din` (Documento de Identificación Nacional simulado de SINIGÁN V6, ej. `DIN-DEMO-0001`).
* **Catálogo sanitario del MVP:** `VACUNACION`, `TRATAMIENTO`, `CHEQUEO_CLINICO` y `DESPARASITACION`.
* **Fórmulas productivas estandarizadas:**
  * $\text{GDP (kg/día)} = \frac{\text{Peso final (kg)} - \text{Peso inicial (kg)}}{\text{Días transcurridos}}$
  * $\text{Eficiencia Alimenticia} = \frac{\text{Consumo total del periodo (kg)}}{\text{Kilogramos ganados en el periodo (kg)}}$
* **Desacoplamiento:** Cada módulo opera en su carpeta aislada (`features/<modulo>`) con datos semilla propios (*fixtures*) sin llaves foráneas bloqueantes entre historias en curso.

---

## 2. Bloque 1: Línea Base (`HU-01` a `HU-05`)

### HU-01 — Identidad, aprovisionamiento y control de acceso por rol
* **Módulo:** `auth`
* **Prioridad:** MUST – Línea base, iteración 1.
* **Historia:** Como administrador quiero aprovisionar cuentas de usuario asignándoles un rol y una finca, y como usuario quiero iniciar sesión con mis credenciales, para que cada persona acceda únicamente a las operaciones autorizadas según su responsabilidad.
* **Reglas de negocio:**
  * No existe autorregistro público; solo un `ADMINISTRADOR` activo crea y habilita usuarios.
  * Toda operación de escritura conserva de forma obligatoria el identificador del usuario responsable y la fecha/hora exacta.
  * Una sesión autenticada vigente permite continuar operando localmente en campo si se pierde la conectividad.
* **Criterios de aceptación:**
  1. **Dado** un usuario activo con credenciales válidas, **cuando** inicia sesión, **entonces** obtiene acceso con su rol (`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO` o `DIRECTIVO`) y su finca asignada.
  2. **Dado** un usuario sin cuenta, **cuando** intenta registrarse por su cuenta, **entonces** el sistema rechaza la solicitud e indica que requiere aprovisionamiento administrativo.
  3. **Dado** un usuario con rol `OPERARIO`, **cuando** intenta ejecutar una validación clínica o consultar costos directivos, **entonces** el sistema deniega la operación.
  4. **Dado** un usuario con sesión iniciada que pierde conexión a internet, **cuando** captura un evento permitido en su finca, **entonces** el sistema conserva su identidad como autor para la sincronización posterior.

---

### HU-02 — Captura offline de eventos sanitarios en campo
* **Módulo:** `offline_capture`
* **Prioridad:** MUST – Línea base, iteración 1.
* **Historia:** Como operario quiero registrar una vacunación, tratamiento, chequeo clínico o desparasitación en el potrero aunque no tenga conexión a internet, para evitar la pérdida de registros operativos en campo.
* **Reglas de negocio:**
  * Todo registro nace con un identificador único generado en el dispositivo del cliente (`client_event_id`) y con dos estados independientes: `PENDIENTE_SINCRONIZACION` y `PENDIENTE_VALIDACION`.
  * La marca de tiempo válida del evento es el momento real de captura en campo, nunca la hora en que llega al servidor.
  * Solo se permite asociar eventos a animales existentes en el catálogo local de la finca y con fecha/hora de captura no futura.
* **Criterios de aceptación:**
  1. **Dado** que el dispositivo se encuentra sin conectividad, **cuando** el operario guarda un evento sanitario válido, **entonces** queda almacenado localmente en menos de 2 segundos y se muestra con estado `PENDIENTE_SINCRONIZACION`.
  2. **Dado** un evento guardado sin conexión, **cuando** el operario cierra y vuelve a abrir la aplicación aún sin red, **entonces** el registro continúa visible en su bandeja de pendientes con su hora original de captura.
  3. **Dado** un identificador de animal inexistente en el catálogo local o una fecha futura, **cuando** se intenta guardar el evento, **entonces** el sistema rechaza la captura e informa el motivo.
  4. **Dado** un evento recién capturado, **cuando** el operario consulta su detalle, **entonces** distingue claramente que está pendiente de sincronización y pendiente de validación veterinaria.

---

### HU-03 — Sincronización por lotes, idempotencia y reintentos controlados
* **Módulo:** `offline_sync`
* **Prioridad:** MUST – Línea base, iteraciones 1 y 2.
* **Historia:** Como sistema quiero transmitir por lotes al servidor los eventos pendientes capturados sin conexión, garantizando idempotencia y reintentos progresivos, para consolidar la información de campo sin pérdidas ni duplicados al restablecerse la red.
* **Reglas de negocio:**
  * Ningún evento local se elimina de la cola del dispositivo hasta recibir confirmación explícita del servidor.
  * El procesamiento en el servidor es estrictamente idempotente usando el `client_event_id`: si un evento ya fue procesado, se reconoce como duplicado sin crear un segundo registro.
  * Ante fallos temporales de red, los reintentos aplican espera exponencial progresiva (*backoff* con variación aleatoria).
* **Criterios de aceptación:**
  1. **Dado** un lote de eventos en estado `PENDIENTE_SINCRONIZACION`, **cuando** se restablece la conectividad, **entonces** el sistema los envía en lote y actualiza cada elemento como `SINCRONIZADO`, `DUPLICADO` o `FALLIDO`.
  2. **Dado** un corte simulado de 24 horas con múltiples eventos capturados, **cuando** vuelve la conexión, **entonces** el 100 % de los eventos válidos se sincronizan sin pérdida ni duplicación.
  3. **Dado** un evento que ya fue sincronizado previamente, **cuando** el cliente lo reenvía por un corte a mitad de respuesta, **entonces** el servidor responde `DUPLICADO` y conserva un único registro.
  4. **Dado** un lote donde fallan 2 de 10 eventos por error transitorio, **cuando** finaliza el envío, **entonces** los 8 exitosos quedan confirmados y solo los 2 fallidos permanecen en cola para reintento.

---

### HU-04 — Historial sanitario auditable y correcciones por anexión (Append-Only)
* **Módulo:** `sanitary_events`
* **Prioridad:** MUST – Línea base, iteración 2.
* **Historia:** Como veterinario quiero consultar el historial cronológico de eventos sanitarios de cada animal y registrar correcciones o validaciones sin borrar ni sobrescribir datos previos, para garantizar trazabilidad auditada.
* **Reglas de negocio:**
  * Modelo estricto de solo anexión (*append-only*): está prohibido eliminar o modificar físicamente cualquier evento histórico.
  * Toda corrección genera un nuevo evento vinculado al original (`corrected_event_id`), exigiendo obligatoriamente motivo, autor con rol `VETERINARIO` y marca de tiempo.
  * El estado sanitario vigente del animal se deriva siempre de la última versión válida aprobada.
* **Criterios de aceptación:**
  1. **Dado** un animal con historial sanitario, **cuando** el veterinario consulta su ficha, **entonces** visualiza la línea de tiempo completa con autor, fecha de captura, fecha de sincronización y estado de validación.
  2. **Dado** un evento con dosis o producto digitado con error, **cuando** el veterinario registra una corrección indicando un motivo obligatorio, **entonces** se crea una nueva versión vinculada y el evento original permanece intacto para auditoría.
  3. **Dado** un usuario con rol `OPERARIO` o `DIRECTIVO`, **cuando** intenta validar o corregir un evento sanitario, **entonces** el sistema rechaza la acción por falta de permisos.
  4. **Dado** un intento de eliminar un evento sanitario histórico desde cualquier interfaz, **cuando** se ejecuta la solicitud, **entonces** el sistema bloquea la operación y registra el intento en la bitácora de auditoría.

---

### HU-05 — Interoperabilidad simulada con SINIGÁN V6 y conciliación de conflictos
* **Módulo:** `sinigan_sync`
* **Prioridad:** MUST – Línea base, iteración 2.
* **Historia:** Como veterinario o administrador quiero consultar la ficha simulada de un animal en SINIGÁN V6 y compararla con los registros de campo, para preservar la fuente de verdad oficial y resolver divergencias mediante revisión humana.
* **Reglas de negocio:**
  * SINIGÁN V6 (operado mediante adaptador simulado) es la fuente de verdad legal para identidad (`din`), especie, sexo, grupo etario y predio (`sit`/`rspp`).
  * Toda información proveniente del adaptador debe etiquetarse visiblemente como `MODO SIMULADO (SINIGÁN V6 MOCK)`.
  * Ante una discrepancia entre los datos de campo y la ficha simulada, nunca se aplica sobrescritura automática; se crea un ticket de conciliación para decisión humana con motivo obligatorio.
* **Criterios de aceptación:**
  1. **Dado** un `din` existente en los datos simulados, **cuando** se consulta su ficha, **entonces** el sistema muestra sus datos oficiales simulados indicando explícitamente que corresponde a un entorno de simulación.
  2. **Dado** un `din` inexistente en la fuente simulada, **cuando** se consulta, **entonces** el sistema informa que no fue encontrado sin crear registros automáticos en el inventario.
  3. **Dado** un animal cuyo sexo o grupo etario registrado en campo difiere de su ficha SINIGÁN simulada, **cuando** se ejecuta la comparación, **entonces** se genera un ticket de conflicto mostrando ambos valores, fecha y origen.
  4. **Dado** un ticket de conflicto abierto, **cuando** el veterinario registra su resolución y motivo, **entonces** el conflicto queda cerrado conservando la trazabilidad de la decisión.

---

## 3. Bloque 2: Desarrollo Incremental y Demostración en Vivo (`HU-06` a `HU-10`)

### HU-06 — Motor de alertas tempranas por telemetría IoT (Inmovilidad y Salida de Potrero)
* **Módulo:** `telemetry_alerts`
* **Prioridad:** MUST – Desarrollo incremental, iteración 2.
* **Historia:** Como operario o veterinario quiero recibir alertas automáticas cuando la telemetría simulada de un collar detecte inmovilidad prolongada o salida del perímetro del potrero asignado, para intervenir oportunamente ante riesgos sanitarios o de abigeato.
* **Reglas de negocio:**
  * Las reglas de umbral (tiempo máximo sin movimiento en horas y polígono del potrero) son configurables y versionadas.
  * Si hay huecos de transmisión o lecturas insuficientes, el sistema clasifica el estado como `DATO_INSUFICIENTE` en lugar de emitir falsas alarmas.
  * Ninguna alerta se cierra automáticamente por lecturas posteriores; requiere confirmación explícita de un usuario autorizado.
  * **SLO de latencia:** El 99 % de las alertas críticas deben generarse en **menos de 10 segundos** desde la recepción de la trama anómala.
* **Criterios de aceptación:**
  1. **Dado** un animal con collar simulado que supera el umbral configurado de inmovilidad (ej. 6 horas sin actividad), **cuando** ingresa la lectura, **entonces** se genera una alerta crítica en menos de 10 segundos con animal, duración y última coordenada.
  2. **Dado** un animal cuya coordenada GPS simulada queda fuera del polígono del potrero asignado, **cuando** se procesa la telemetría, **entonces** se dispara una alerta de `SALIDA_POTRERO` en menos de 10 segundos.
  3. **Dado** un animal con pérdida temporal de señal GPS sin lecturas suficientes para evaluar movimiento, **cuando** se ejecuta la evaluación, **entonces** el sistema registra `DATO_INSUFICIENTE` y no emite falsa alerta.
  4. **Dado** una alerta abierta, **cuando** un usuario autorizado la atiende registrando una acción, **entonces** cambia a estado `ATENDIDA` conservando quién la cerró y cuándo.

---

### HU-07 — Registro genealógico y advertencia preventiva de consanguinidad
* **Módulo:** `genealogy`
* **Prioridad:** MUST – Desarrollo incremental, iteraciones 2 y 3.
* **Historia:** Como veterinario quiero registrar los progenitores de cada bovino y evaluar el grado de parentesco ante un posible cruce, para prevenir riesgos de consanguinidad en el hato.
* **Reglas de negocio:**
  * Un animal no puede ser su propio ancestro (validación anti-ciclos) y la fecha de nacimiento de padre y madre debe ser anterior a la de la cría.
  * El árbol genealógico se despliega hasta 3 generaciones cuando existan registros disponibles.
  * Si faltan ancestros en el árbol, el sistema indica `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` y nunca asume consanguinidad cero como certeza.
* **Criterios de aceptación:**
  1. **Dado** un bovino con padre y madre registrados, **cuando** se consulta su genealogía, **entonces** se visualiza el árbol genealógico de hasta tres generaciones con el estado de validación de cada vínculo.
  2. **Dado** una propuesta de cruce entre dos animales que comparten ancestros directos dentro de las generaciones registradas, **cuando** se evalúa el cruce, **entonces** el sistema emite una advertencia de consanguinidad detallando el ancestro común y el coeficiente estimado.
  3. **Dado** un animal sin ancestros registrados en el sistema, **cuando** se solicita el indicador de consanguinidad, **entonces** el sistema informa que los datos son insuficientes en lugar de mostrar `0 %` como dato confirmado.
  4. **Dado** un intento de asignar como progenitor a un animal nacido después de la cría o crear un ciclo genealógico, **cuando** se intenta guardar, **entonces** el sistema rechaza el registro.

---

### HU-08 — Seguimiento de peso, consumo y Ganancia Diaria de Peso (GDP)
* **Módulo:** `productivity`
* **Prioridad:** MUST – Desarrollo incremental, iteración 3.
* **Historia:** Como directivo quiero consultar los pesajes, el consumo de alimento y la Ganancia Diaria de Peso (GDP) por animal o lote, para evaluar la eficiencia productiva de la finca con criterios auditables.
* **Reglas de negocio:**
  * Se admiten pesajes manuales y simulados de báscula; todo pesaje fuera de rango biológico plausible (ej. variación mayor a ±15 kg en menos de 24 horas) se marca como `ATIPICO_EN_REVISION` sin distorsionar promedios.
  * La GDP exige al menos dos pesajes válidos en fechas distintas ($\text{GDP} = \Delta\text{Peso} / \Delta\text{Días}$).
  * Si no existen datos de consumo o costos cargados en el periodo, el sistema informa `DATOS_INSUFICIENTES` sin rellenar con ceros ni inventar estimaciones.
* **Criterios de aceptación:**
  1. **Dado** un animal con pesaje inicial de `220 kg` el día 1 y pesaje final de `250 kg` el día 31, **cuando** se consulta su desempeño, **entonces** el sistema calcula una GDP exacta de `1.00 kg/día`.
  2. **Dado** un pesaje simulado con un salto atípico fuera del umbral biológico, **cuando** ingresa al sistema, **entonces** queda marcado como `ATIPICO_EN_REVISION` y se excluye del cálculo automático hasta revisión.
  3. **Dado** un lote con `500 kg` de consumo registrado y `100 kg` ganados en el periodo, **cuando** el directivo consulta el reporte, **entonces** visualiza la eficiencia alimenticia (`5.0 kg alimento / kg ganado`) y el costo por kilogramo si existen costos registrados.
  4. **Dado** un animal con un único pesaje registrado, **cuando** se solicita su GDP, **entonces** el sistema muestra `DATOS_INSUFICIENTES`.

---

### HU-09 — Tablero ejecutivo de indicadores sanitarios y productivos auditables
* **Módulo:** `kpi_dashboard`
* **Prioridad:** MUST – Desarrollo incremental, iteración 3.
* **Historia:** Como veterinario o directivo quiero consultar un panel consolidado con indicadores sanitarios, alertas y desempeño productivo filtrables por finca y periodo, para tomar decisiones respaldadas por registros trazables.
* **Reglas de negocio:**
  * Todo indicador mostrado debe derivarse exclusivamente de registros existentes y permitir rastrear los eventos que lo componen.
  * Los eventos sanitarios en estado `PENDIENTE_VALIDACION` se contabilizan por separado y nunca inflan los indicadores de cobertura sanitaria validada.
  * Un usuario con rol `OPERARIO` solo visualiza métricas operativas de su finca asignada y tiene restringido el acceso a indicadores financieros o de costos.
* **Criterios de aceptación:**
  1. **Dado** una finca y un rango de fechas seleccionados, **cuando** el veterinario o directivo abre el tablero, **entonces** visualiza el porcentaje de cobertura de vacunación validada, eventos pendientes de validación, alertas abiertas y GDP promedio del periodo.
  2. **Dado** un evento sanitario pendiente de validación veterinaria, **cuando** se recalculan los indicadores, **entonces** aparece en el contador de pendientes y no suma al porcentaje de hato vacunado validado.
  3. **Dado** un usuario con rol `OPERARIO`, **cuando** accede al panel, **entonces** visualiza únicamente los indicadores operativos de su finca sin exposición de costos ni reportes financieros.
  4. **Dado** una solicitud de reporte de auditoría para el piloto, **cuando** se exporta el resumen del periodo, **entonces** incluye los filtros aplicados, el responsable que exporta y el estado de validación de cada registro.

---

### HU-10 — Observabilidad técnica, cumplimiento SLI/SLO y compuertas DevSecOps
* **Módulo:** `observability_ops` *(Transversal)*
* **Prioridad:** MUST – Transversal desde iteración 1.
* **Historia:** Como equipo de ingeniería quiero disponer de registros estructurados con correlación, métricas técnicas en tiempo real y compuertas automatizadas de seguridad y pruebas, para verificar el cumplimiento de los SLO y gobernar la estabilidad del sistema bajo el Presupuesto de Error.
* **Reglas de negocio:**
  * Toda petición de sincronización o trama IoT incorpora un `correlation_id` que permite rastrear su recorrido de extremo a extremo.
  * El pipeline de integración continua ejecuta pruebas automatizadas, análisis estático de seguridad (SAST) y verificación de secretos en **menos de 90 segundos**, bloqueando la integración ante hallazgos críticos.
  * El tablero técnico de observabilidad (latencia de alertas, tasa de errores, tamaño de cola offline y disponibilidad) está separado del tablero agropecuario de negocio.
* **Criterios de aceptación:**
  1. **Dado** una trama de telemetría IoT que dispara una alerta crítica, **cuando** se consulta la bitácora técnica, **entonces** es posible rastrear todo el flujo mediante su `correlation_id`, `animal_id` y `event_id`.
  2. **Dado** un cambio de código propuesto para integración, **cuando** se ejecuta el pipeline automatizado, **entonces** valida pruebas unitarias, integridad *append-only*, seguridad SAST y tiempo de ejecución menor a 90 segundos.
  3. **Dado** el panel técnico de observabilidad durante la demostración, **cuando** se consulta, **entonces** muestra en tiempo real la latencia promedio y percentil 99 de alertas (`< 10 s`), el estado de las colas de sincronización y la tasa de éxito de escritura.
  4. **Dado** una degradación simulada donde la latencia de alertas supera el umbral permitido agotando el *Error Budget*, **cuando** el tablero técnico lo reporta, **entonces** se activa la alerta operativa de congelamiento de cambios hasta estabilizar el servicio.

---

## 4. Mapa de Distribución y Trabajo Concurrente

| HU | Módulo (`features/<modulo>`) | Bloque | ¿Ejecutable en paralelo? |
|---|---|---|---|
| **HU-01** | `auth` | Línea Base | Completada en `main` (habilitadora) |
| **HU-02** | `offline_capture` | Línea Base | Sí, usando catálogo local semilla |
| **HU-03** | `offline_sync` | Línea Base | Sí, sobre contrato `client_event_id` congelado |
| **HU-04** | `sanitary_events` | Línea Base | Sí, con *fixtures* sanitarios propios |
| **HU-05** | `sinigan_sync` | Línea Base | Sí, mediante `MockSiniganAdapter` aislado |
| **HU-06** | `telemetry_alerts` | Demo en Vivo | Sí, con simulador de tramas IoT propio |
| **HU-07** | `genealogy` | Demo en Vivo | Sí, con árbol semilla de 3 generaciones |
| **HU-08** | `productivity` | Demo en Vivo | Sí, con pesajes y consumos semilla |
| **HU-09** | `kpi_dashboard` | Demo en Vivo | Sí, agregando métricas de las tablas base |
| **HU-10** | `observability_ops` | Transversal / Demo | Sí, instrumentando middleware y `/metrics` |

---

## 5. Definition of Done (DoD) para Spec Kit

Una Historia de Usuario se considera terminada únicamente cuando:
1. Cuenta con su cadena completa en `specs/00X-<modulo>/`: `spec.md` $\rightarrow$ `plan.md` $\rightarrow$ `tasks.md`.
2. Cumple el 100 % de sus escenarios `Dado / Cuando / Entonces` en pruebas automatizadas (`pytest`).
3. El código está estrictamente aislado en `backend/app/features/<modulo>/` y `frontend/src/features/<modulo>/`, con registro limpio en `main.py` y `App.jsx`.
4. Supera la auditoría de `@qa-seguridad` (ISO/IEC 25010, NISTIR 8259A, cero secretos expuestos) y el pipeline CI en `< 90 s`.
5. Cuenta con revisión y aprobación humana final (*Human-in-the-Loop*).
```eof

Ya tienes el archivo `Backlog_10_HU_SpecKit_BovinoTech.md` listo para descargar y enviar directamente a tu equipo por WhatsApp o subirlo al repositorio.