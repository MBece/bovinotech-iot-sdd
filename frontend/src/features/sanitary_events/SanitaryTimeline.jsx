import { useCallback, useEffect, useMemo, useState } from 'react';
import { SanitaryCorrectionForm } from './SanitaryCorrectionForm';
import { sanitaryEventsService, QUEUE_KEY } from './services/sanitaryEventsService';
import './sanitaryTimeline.css';

const EVENT_LABELS = {
  VACCINATION: 'Vacunación',
  TREATMENT: 'Tratamiento',
  CHECKUP: 'Chequeo',
};

const STATUS_LABELS = {
  PENDING_VALIDATION: 'Pendiente de validación',
  CORRECTION: 'Corrección anexada',
};

const selectedDin = (animal) => animal?.din || animal?.sinigan_code || '';

const readPendingCount = () => {
  try {
    const entries = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(entries) ? entries.length : 0;
  } catch {
    return 0;
  }
};

const formatDate = (value) => new Date(value).toLocaleString();

export function SanitaryTimeline({
  token,
  role,
  selectedAnimal,
  refreshSignal = 0,
}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine !== false);
  const [pendingCount, setPendingCount] = useState(readPendingCount);
  const din = selectedDin(selectedAnimal);
  const canCorrect = role === 'VETERINARIO';
  const isLoading = Boolean(din && loading);

  const loadHistory = useCallback(async () => {
    if (!din) {
      setEvents([]);
      setStale(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await sanitaryEventsService.getByDin(din, token);
      setEvents(response.items);
      setStale(response.stale);
    } catch (loadError) {
      setError(loadError.message || 'No fue posible consultar el historial.');
    } finally {
      setLoading(false);
    }
  }, [din, token]);

  useEffect(() => {
    let active = true;
    if (!din) return undefined;
    const fetchHistory = async () => {
      setError('');
      setLoading(true);
      try {
        const response = await sanitaryEventsService.getByDin(din, token);
        if (active) {
          setEvents(response.items);
          setStale(response.stale);
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'No fue posible consultar el historial.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchHistory();
    return () => {
      active = false;
    };
  }, [din, token, refreshSignal]);

  useEffect(() => {
    const updateConnection = () => setOnline(globalThis.navigator?.onLine !== false);
    const updateQueue = () => setPendingCount(readPendingCount());
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('storage', updateQueue);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('storage', updateQueue);
    };
  }, []);

  useEffect(() => {
    if (!online || !token) return undefined;
    let active = true;
    sanitaryEventsService.syncPendingCorrections(token).then((syncedCount) => {
      if (active && syncedCount > 0) {
        setPendingCount(readPendingCount());
        setNotice('Las correcciones pendientes se sincronizaron.');
        loadHistory();
      }
    });
    return () => {
      active = false;
    };
  }, [online, token, loadHistory]);

  const orderedEvents = useMemo(
    () =>
      (din ? [...events] : []).sort(
        (left, right) =>
          new Date(left.fieldOccurredAt) - new Date(right.fieldOccurredAt) ||
          left.id - right.id,
      ),
    [din, events],
  );

  const saveCorrection = async (payload) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await sanitaryEventsService.correct(
        editingEvent.id,
        payload,
        token,
      );
      setEditingEvent(null);
      if (result.queued) {
        setPendingCount(readPendingCount());
        setNotice('Corrección guardada en el dispositivo; se sincronizará al recuperar conexión.');
      } else {
        setNotice('Corrección anexada; el evento original permanece en el historial.');
        await loadHistory();
      }
    } catch (saveError) {
      setError(saveError.message || 'No fue posible guardar la corrección.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sanitary-timeline" aria-labelledby="sanitary-timeline-title">
      <header className="sanitary-timeline-heading">
        <div>
          <p className="sanitary-eyebrow">Registro inmutable</p>
          <h2 id="sanitary-timeline-title">Historial sanitario</h2>
        </div>
        <span className={`sanitary-connection ${online ? 'is-online' : 'is-offline'}`}>
          {online ? 'En línea' : 'Sin conexión'}
        </span>
      </header>

      <p className="sanitary-description">
        DIN consultado: <strong>{din || 'Seleccione un animal'}</strong>
        {pendingCount > 0 && ` · ${pendingCount} corrección(es) pendiente(s)`}
      </p>
      {stale && (
        <p className="sanitary-stale" role="status">
          Historial local disponible; puede no incluir cambios recientes.
        </p>
      )}
      {notice && <p className="sanitary-notice" role="status">{notice}</p>}
      {din && error && <p className="sanitary-error" role="alert">{error}</p>}
      {isLoading && <p className="sanitary-state" role="status">Cargando historial…</p>}
      {!isLoading && !din && (
        <p className="sanitary-state">Seleccione un animal para consultar su DIN.</p>
      )}
      {!isLoading && !error && din && orderedEvents.length === 0 && (
        <p className="sanitary-state">No hay eventos sanitarios registrados para este DIN.</p>
      )}

      <ol className="sanitary-event-list">
        {orderedEvents.map((event) => {
          const withdrawalActive =
            event.withdrawalUntil && new Date(event.withdrawalUntil) > new Date();
          return (
            <li className="sanitary-event" key={event.id}>
              <article>
                <div className="sanitary-event-title">
                  <h3>{EVENT_LABELS[event.eventType] || event.eventType}</h3>
                  <span className="sanitary-status">
                    {STATUS_LABELS[event.validationStatus] || event.validationStatus}
                  </span>
                </div>
                <p className="sanitary-event-meta">
                  Capturado: {formatDate(event.fieldOccurredAt)} · Autor: {event.authorEmail}
                </p>
                <p className="sanitary-event-meta">
                  Sincronizado: {formatDate(event.receivedAt)}
                </p>
                {event.correctedEventId && (
                  <p className="sanitary-event-detail">
                    Anotación que corrige el evento #{event.correctedEventId}
                  </p>
                )}
                {event.reason && (
                  <p className="sanitary-event-reason">Motivo: {event.reason}</p>
                )}
                {event.dose != null && (
                  <p className="sanitary-event-detail">Dosis: {event.dose}</p>
                )}
                {event.notes && (
                  <p className="sanitary-event-detail">Observación: {event.notes}</p>
                )}
                {event.withdrawalUntil && (
                  <p className={`sanitary-withdrawal ${withdrawalActive ? 'is-active' : ''}`}>
                    {withdrawalActive ? 'Tiempo de retiro vigente' : 'Tiempo de retiro finalizado'}
                    {' · hasta '}
                    {formatDate(event.withdrawalUntil)}
                  </p>
                )}
                {canCorrect && (
                  <button
                    className="sanitary-action"
                    type="button"
                    onClick={() => setEditingEvent(event)}
                  >
                    Anexar corrección
                  </button>
                )}
              </article>
            </li>
          );
        })}
      </ol>

      {editingEvent && canCorrect && (
        <SanitaryCorrectionForm
          event={editingEvent}
          saving={saving}
          onCancel={() => setEditingEvent(null)}
          onSave={saveCorrection}
        />
      )}
    </section>
  );
}
