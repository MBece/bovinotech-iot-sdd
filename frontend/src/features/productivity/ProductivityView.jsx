import { useCallback, useEffect, useMemo, useState } from 'react';
import { createProductivityOfflineQueue } from './productivityOfflineQueue.js';
import { ProductivityNetworkError, productivityService } from './productivityService.js';
import { canReviewProductivity, formatProductivityIndicator } from './productivityPresentation.js';
import { validateConsumption, validateWeighing } from './productivityValidation.js';
import './productivity.css';

const queue = createProductivityOfflineQueue();
const createId = () => globalThis.crypto.randomUUID();

const readInitialQueue = () => {
  try {
    return { items: queue.list(), error: '' };
  } catch (error) {
    return {
      items: [],
      error: `No se pudo leer la cola local de productividad: ${error.message}`,
    };
  }
};

const sendProductivityEvent = (kind, event, token, targetId) => {
  if (kind === 'weighing') return productivityService.createWeighing(event, token);
  if (kind === 'consumption') return productivityService.createConsumption(event, token);
  if (kind === 'weighing-correction') return productivityService.correctWeighing(targetId, event, token);
  if (kind === 'consumption-correction') return productivityService.correctConsumption(targetId, event, token);
  throw new Error('Tipo de evento de productividad desconocido.');
};

export function ProductivityView({ user, role, farmId }) {
  const token = user?.token;
  const [initialQueue] = useState(readInitialQueue);
  const [loteId, setLoteId] = useState('');
  const [din, setDin] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('COP');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [weighings, setWeighings] = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState(initialQueue.items);
  const [message, setMessage] = useState(initialQueue.error);
  const [online, setOnline] = useState(() => navigator.onLine);
  const canReview = canReviewProductivity(role);
  const canCapture = role === 'OPERARIO' || role === 'ADMINISTRADOR';

  const refresh = useCallback(async () => {
    if (!token || !loteId.trim() || !navigator.onLine) return;
    try {
      const [weighingResult, consumptionResult] = await Promise.all([
        productivityService.listWeighings(loteId, token),
        productivityService.listConsumptions(loteId, token),
      ]);
      setWeighings(weighingResult.items || []);
      setConsumptions(consumptionResult.items || []);
    } catch {
      setMessage('No se pudo actualizar el historial. Se conservan los datos locales pendientes.');
    }
  }, [loteId, token]);

  const syncPending = useCallback(async () => {
    if (!navigator.onLine || !token) return;
    try {
      const remaining = await queue.synchronize(({ kind, event, targetId }) =>
        sendProductivityEvent(kind, event, token, targetId));
      setPending(remaining);
      await refresh();
    } catch (error) {
      setMessage(`No se pudo acceder a la cola local: ${error.message}`);
    }
  }, [refresh, token]);

  useEffect(() => {
    const updateConnectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) syncPending();
    };
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    queueMicrotask(() => (navigator.onLine ? syncPending() : refresh()));
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, [refresh, syncPending]);

  const saveEvent = async (kind, payload) => {
    const enqueueLocally = () => {
      try {
        const { targetId, ...event } = payload;
        queue.enqueue({ kind, event, targetId }, payload.clientEventId);
        setPending(queue.list());
        setMessage('Registro guardado en este dispositivo; se sincronizará al recuperar conexión.');
        return true;
      } catch (error) {
        setMessage(`No se pudo guardar el registro localmente: ${error.message}`);
        return false;
      }
    };
    if (!navigator.onLine) {
      return enqueueLocally();
    }
    if (!token) {
      setMessage('No hay una sesión autenticada para enviar el registro.');
      return false;
    }
    try {
      const { targetId, ...event } = payload;
      await sendProductivityEvent(kind, event, token, targetId);
      setMessage('Registro guardado correctamente.');
      await refresh();
      return true;
    } catch (error) {
      if (error instanceof ProductivityNetworkError) {
        return enqueueLocally();
      } else {
        setMessage(error.message || 'El servidor rechazó el registro.');
        return false;
      }
    }
  };

  const handleWeighing = async (event) => {
    event.preventDefault();
    const values = { loteId, din, weightKg };
    const errors = validateWeighing(values);
    if (Object.keys(errors).length) {
      setMessage(Object.values(errors).join(' '));
      return;
    }
    const saved = await saveEvent('weighing', {
      clientEventId: createId(),
      loteId: loteId.trim(),
      din: din.trim().toUpperCase(),
      weightKg: Number(weightKg),
      capturedAt: new Date().toISOString(),
    });
    if (saved) setWeightKg('');
  };

  const handleConsumption = async (event) => {
    event.preventDefault();
    const errors = validateConsumption({ loteId, quantityKg });
    if (!periodStart || !periodEnd || !Number.isFinite(Date.parse(periodStart)) || !Number.isFinite(Date.parse(periodEnd)) || periodStart >= periodEnd) {
      errors.period = 'Indique un periodo válido.';
    }
    if (Object.keys(errors).length) {
      setMessage(Object.values(errors).join(' '));
      return;
    }
    const saved = await saveEvent('consumption', {
      clientEventId: createId(),
      loteId: loteId.trim(),
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      quantityKg: Number(quantityKg),
      ...(costAmount !== '' ? { costAmount: Number(costAmount), currencyCode } : {}),
    });
    if (saved) {
      setQuantityKg('');
      setCostAmount('');
    }
  };

  const handleCorrection = async (event, item, kind) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const reason = String(values.get('reason') || '').trim();
    if (!reason) {
      setMessage('El motivo de corrección es obligatorio.');
      return;
    }
    const payload = {
      clientEventId: createId(),
      loteId: item.loteId,
      reason,
    };
    if (kind === 'weighing') {
      payload.din = item.din;
      payload.weightKg = Number(values.get('weightKg'));
      payload.capturedAt = item.capturedAt;
    } else {
      payload.periodStart = item.periodStart;
      payload.periodEnd = item.periodEnd;
      payload.quantityKg = Number(values.get('quantityKg'));
      const cost = values.get('costAmount');
      if (cost !== '') {
        payload.costAmount = Number(cost);
        payload.currencyCode = values.get('currencyCode');
      }
    }
    const saved = await saveEvent(`${kind}-correction`, { ...payload, targetId: item.id });
    if (saved) form.reset();
  };

  const calculateSummary = async () => {
    if (!periodStart || !periodEnd || !user?.token) {
      setMessage('Seleccione el periodo para consultar los indicadores.');
      return;
    }
    try {
      setSummary(await productivityService.summary(
        loteId,
        new Date(periodStart).toISOString(),
        new Date(periodEnd).toISOString(),
        token,
      ));
    } catch {
      setSummary(null);
      setMessage('No fue posible consultar los indicadores.');
    }
  };

  const review = async (weighing, decision) => {
    try {
      await productivityService.reviewWeighing(
        weighing.id,
        { decision, reason: decision === 'APPROVED' ? 'Verificado por usuario autorizado' : 'Rechazado tras revisión' },
        token,
      );
      await refresh();
    } catch {
      setMessage('No se pudo registrar la revisión del pesaje.');
    }
  };

  const dateRange = useMemo(() => ({
    start: periodStart ? new Date(periodStart).toLocaleDateString('es-CO') : '—',
    end: periodEnd ? new Date(periodEnd).toLocaleDateString('es-CO') : '—',
  }), [periodStart, periodEnd]);

  return (
    <section className="productivity" aria-labelledby="productivity-title">
      <header className="productivity__header">
        <div>
          <p className="productivity__eyebrow">Finca {farmId ?? 'sin finca activa'}</p>
          <h2 id="productivity-title">Productividad por lote</h2>
        </div>
        <div className={`productivity__connectivity ${online ? 'is-online' : 'is-offline'}`} role="status">
          {online ? '🟢 En línea' : '🔴 Sin conexión'} · {pending.length} pendientes
        </div>
      </header>

      <label className="productivity__field">
        Lote
        <input value={loteId} onChange={(event) => setLoteId(event.target.value)} maxLength="64" required />
      </label>

      {message && <p className="productivity__message" role="status">{message}</p>}

      <div className="productivity__forms">
        <form className="productivity__card" onSubmit={handleWeighing}>
          <h3>Registrar pesaje</h3>
          <label className="productivity__field">
            DIN del animal
            <input value={din} onChange={(event) => setDin(event.target.value)} maxLength="32" required />
          </label>
          <label className="productivity__field">
            Peso (kg)
            <input inputMode="decimal" type="number" min="0.001" step="0.001" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} required />
          </label>
          <button type="submit">Guardar pesaje</button>
        </form>

        <form className="productivity__card" onSubmit={handleConsumption}>
          <h3>Registrar consumo</h3>
          <label className="productivity__field">
            Cantidad (kg)
            <input inputMode="decimal" type="number" min="0.001" step="0.001" value={quantityKg} onChange={(event) => setQuantityKg(event.target.value)} required />
          </label>
          <label className="productivity__field">
            Costo (opcional)
            <input inputMode="decimal" type="number" min="0" step="0.01" value={costAmount} onChange={(event) => setCostAmount(event.target.value)} />
          </label>
          <label className="productivity__field">
            Moneda
            <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="productivity__field">
            Inicio del periodo
            <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
          </label>
          <label className="productivity__field">
            Fin del periodo
            <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
          </label>
          <button type="submit">Guardar consumo</button>
        </form>
      </div>

      <section className="productivity__card" aria-labelledby="summary-title">
        <h3 id="summary-title">Indicadores del lote</h3>
        <p>Periodo: {dateRange.start} – {dateRange.end}</p>
        <button type="button" onClick={calculateSummary}>Consultar indicadores</button>
        {summary && (
          <dl className="productivity__summary">
            <dt>GDP (kg/día)</dt>
            <dd>{formatProductivityIndicator(summary.gdpKgPerDay, summary.gdpStatus)}</dd>
            <dt>Eficiencia alimenticia (kg/kg)</dt>
            <dd>{formatProductivityIndicator(summary.feedEfficiencyKgPerKg, summary.feedEfficiencyStatus)}</dd>
            <dt>Datos faltantes</dt>
            <dd>{summary.missingData?.join(', ') || 'Ninguno'}</dd>
          </dl>
        )}
      </section>

      <section className="productivity__card" aria-labelledby="history-title">
        <div className="productivity__history-heading">
          <h3 id="history-title">Historial de pesajes</h3>
          <button type="button" onClick={refresh}>Actualizar</button>
        </div>
        {weighings.length === 0 ? <p>No hay pesajes sincronizados para este lote.</p> : (
          <ul className="productivity__list">
            {weighings.map((item) => (
              <li key={item.id}>
                <span><strong>{item.din}</strong> · {item.weightKg} kg · {new Date(item.capturedAt).toLocaleString('es-CO')}</span>
                <span className={item.isAtypical ? 'productivity__status--review' : 'productivity__status'}>
                  {item.reviewStatus}
                </span>
                {item.isAtypical && item.reviewStatus === 'ATIPICO_EN_REVISION' && canReview && (
                  <span className="productivity__review-actions">
                    <button type="button" onClick={() => review(item, 'APPROVED')}>Aprobar</button>
                    <button type="button" onClick={() => review(item, 'REJECTED')}>Rechazar</button>
                  </span>
                )}
                {canCapture && (
                  <details className="productivity__correction">
                    <summary>Corregir pesaje</summary>
                    <form onSubmit={(event) => handleCorrection(event, item, 'weighing')}>
                      <label className="productivity__field">
                        Peso corregido (kg)
                        <input name="weightKg" inputMode="decimal" type="number" min="0.001" step="0.001" defaultValue={item.weightKg} required />
                      </label>
                      <label className="productivity__field">
                        Motivo de corrección
                        <textarea name="reason" minLength="1" maxLength="500" required />
                      </label>
                      <button type="submit">Anexar corrección</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending.length > 0 && (
        <section className="productivity__card" aria-labelledby="pending-title">
          <h3 id="pending-title">Registros pendientes de sincronización</h3>
          <ul className="productivity__list">
            {pending.map((item) => (
              <li key={item.client_event_id}>
                {item.payload.kind.startsWith('weighing')
                  ? `${item.payload.kind.endsWith('correction') ? 'Corrección de pesaje' : 'Pesaje'} de ${item.payload.event.din}: ${item.payload.event.weightKg} kg`
                  : `${item.payload.kind.endsWith('correction') ? 'Corrección de consumo' : 'Consumo'}: ${item.payload.event.quantityKg} kg`}
                {' · '}
                {item.status === 'failed' ? 'Error al sincronizar' : 'Pendiente'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="productivity__card" aria-labelledby="consumption-history-title">
        <h3 id="consumption-history-title">Consumos registrados</h3>
        {consumptions.length === 0 ? <p>No hay consumos sincronizados para este lote.</p> : (
          <ul className="productivity__list">
            {consumptions.map((item) => (
              <li key={item.id}>
                <span>{item.quantityKg} kg · {new Date(item.periodStart).toLocaleDateString('es-CO')} – {new Date(item.periodEnd).toLocaleDateString('es-CO')}</span>
                {canCapture && (
                  <details className="productivity__correction">
                    <summary>Corregir consumo</summary>
                    <form onSubmit={(event) => handleCorrection(event, item, 'consumption')}>
                      <label className="productivity__field">
                        Cantidad corregida (kg)
                        <input name="quantityKg" inputMode="decimal" type="number" min="0.001" step="0.001" defaultValue={item.quantityKg} required />
                      </label>
                      <label className="productivity__field">
                        Costo corregido (opcional)
                        <input name="costAmount" inputMode="decimal" type="number" min="0" step="0.01" defaultValue={item.costAmount ?? ''} />
                      </label>
                      <label className="productivity__field">
                        Moneda
                        <select name="currencyCode" defaultValue={item.currencyCode || 'COP'}>
                          <option value="COP">COP</option>
                          <option value="USD">USD</option>
                        </select>
                      </label>
                      <label className="productivity__field">
                        Motivo de corrección
                        <textarea name="reason" minLength="1" maxLength="500" required />
                      </label>
                      <button type="submit">Anexar corrección</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending.length > 0 && online && <button type="button" onClick={syncPending}>Sincronizar pendientes</button>}
    </section>
  );
}
