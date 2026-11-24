import { useCallback, useEffect, useState } from 'react';
import { offlineEventRepository } from '../../core/offline/offlineEventRepository';
import { syncService } from './syncService';

const EVENT_TYPE_LABELS = {
  VACCINATION: 'Vacunación',
  TREATMENT: 'Tratamiento',
  CHECKUP: 'Chequeo',
  DEWORMING: 'Desparasitación',
};

const SYNC_STATUS_LABELS = {
  PENDIENTE_SINCRONIZACION: 'Pendiente de sincronización',
  SINCRONIZADO: 'Sincronizado',
  DUPLICADO: 'Duplicado confirmado',
  FALLIDO: 'Fallido; pendiente de reintento',
};

const VALIDATION_STATUS_LABELS = {
  PENDIENTE_VALIDACION: 'Pendiente de validación veterinaria',
  VALIDADO: 'Validado',
};

const readSyncStatus = (event) => ({
  CREADO: 'SINCRONIZADO',
  RECHAZADO: 'FALLIDO',
}[event.syncStatus] || event.syncStatus || ({
  PENDING_SYNC: 'PENDIENTE_SINCRONIZACION',
  SYNCED: 'SINCRONIZADO',
  REJECTED: 'FALLIDO',
}[event.status] || 'PENDIENTE_SINCRONIZACION'));

const localDateTimeValue = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function OfflineSanitaryCapture({ token, userEmail, selectedAnimal, onSynchronized }) {
  const [events, setEvents] = useState([]);
  const [eventType, setEventType] = useState('VACCINATION');
  const [capturedAt, setCapturedAt] = useState(localDateTimeValue);
  const [product, setProduct] = useState('');
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState('ml');
  const [reason, setReason] = useState('');
  const [finding, setFinding] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);

  const refresh = useCallback(async () => {
    const saved = (await offlineEventRepository.getAll()).filter(
      (event) => event.authorEmail === userEmail,
    );
    setEvents(saved.sort((a, b) => b.fieldOccurredAt.localeCompare(a.fieldOccurredAt)));
  }, [userEmail]);

  useEffect(() => {
    let cancelled = false;
    offlineEventRepository
      .getAll()
      .then((saved) => {
        if (!cancelled) {
          setEvents(
            saved
              .filter((event) => event.authorEmail === userEmail)
              .sort((a, b) => b.fieldOccurredAt.localeCompare(a.fieldOccurredAt)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ type: 'error', text: 'No se pudo abrir el almacenamiento offline.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  const saveOffline = async (event) => {
    event.preventDefault();
    if (!selectedAnimal) {
      setMessage({ type: 'error', text: 'Consulte y seleccione primero un animal por DIN.' });
      return;
    }
    const occurredAt = new Date(capturedAt);
    if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now()) {
      setMessage({ type: 'error', text: 'La fecha y hora de captura no puede estar en el futuro.' });
      return;
    }
    const requiresProduct = ['VACCINATION', 'TREATMENT', 'DEWORMING'].includes(eventType);
    if (requiresProduct && (!product.trim() || !dose)) {
      setMessage({ type: 'error', text: 'Indique el producto, la dosis y su unidad.' });
      return;
    }
    if (eventType === 'TREATMENT' && !reason.trim()) {
      setMessage({ type: 'error', text: 'Indique el motivo del tratamiento.' });
      return;
    }
    if (eventType === 'CHECKUP' && !finding.trim()) {
      setMessage({ type: 'error', text: 'Indique el hallazgo clínico.' });
      return;
    }
    const record = {
      clientEventId: crypto.randomUUID(),
      din: selectedAnimal.din,
      eventType,
      fieldOccurredAt: occurredAt.toISOString(),
      product: product.trim() || null,
      dose: dose ? Number(dose) : null,
      doseUnit: requiresProduct ? doseUnit : null,
      reason: reason.trim() || null,
      finding: finding.trim() || null,
      notes: notes.trim() || null,
      authorEmail: userEmail,
      status: 'PENDING_SYNC',
      syncStatus: 'PENDIENTE_SINCRONIZACION',
      validationStatus: 'PENDIENTE_VALIDACION',
    };
    await offlineEventRepository.save(record);
    setDose('');
    setProduct('');
    setReason('');
    setFinding('');
    setNotes('');
    setCapturedAt(localDateTimeValue());
    setMessage({ type: 'success', text: 'Evento guardado localmente. Puede cerrar la aplicación sin perderlo.' });
    await refresh();
  };

  const synchronize = async () => {
    const pending = events.filter((item) => (
      ['PENDIENTE_SINCRONIZACION', 'FALLIDO'].includes(readSyncStatus(item))
    ));
    if (!pending.length) return;
    setSyncing(true);
    setMessage(null);
    try {
      if (simulateOffline) {
        throw new Error('Sin conexión simulada');
      }
      const results = await syncService.syncEvents(pending, token);
      await Promise.all(results.map((result) => {
        return offlineEventRepository.updateStatus(
          result.clientEventId,
          result.status,
          result.detail,
        );
      }));
      setMessage({ type: 'success', text: 'Sincronización terminada sin eliminar el historial local.' });
      await refresh();
      onSynchronized?.();
    } catch (error) {
      setMessage({ type: 'error', text: `${error.message}. Los eventos continúan guardados localmente.` });
    } finally {
      setSyncing(false);
    }
  };

  const resend = async (event) => {
    setSyncing(true);
    setMessage(null);
    try {
      const [result] = await syncService.syncEvents([event], token);
      await offlineEventRepository.updateStatus(
        result.clientEventId,
        result.status,
        result.detail,
      );
      setMessage({
        type: 'success',
        text: result.status === 'DUPLICADO'
          ? 'Reenvío idempotente confirmado: no se creó un segundo registro.'
          : 'Reenvío procesado correctamente.',
      });
      await refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSyncing(false);
    }
  };

  const pendingCount = events.filter((event) => (
    ['PENDIENTE_SINCRONIZACION', 'FALLIDO'].includes(readSyncStatus(event))
  )).length;
  const requiresProduct = ['VACCINATION', 'TREATMENT', 'DEWORMING'].includes(eventType);

  return (
    <section style={styles.card} aria-labelledby="offline-title">
      <div style={styles.headingRow}>
        <div>
          <span style={styles.eyebrow}>Operación sin conexión</span>
          <h2 id="offline-title" style={styles.title}>Registrar evento sanitario</h2>
        </div>
        <span style={styles.counter}>{pendingCount} pendientes</span>
      </div>

      <p style={styles.context}>
        {selectedAnimal
          ? <>Animal seleccionado: <strong>{selectedAnimal.animalName}</strong> · {selectedAnimal.din}</>
          : 'Consulte un DIN para habilitar la captura.'}
      </p>

      <form onSubmit={saveOffline} style={styles.form}>
        <label style={styles.label} htmlFor="event-type">Tipo de evento</label>
        <select id="event-type" value={eventType} onChange={(event) => setEventType(event.target.value)} style={styles.input}>
          <option value="VACCINATION">Vacunación</option>
          <option value="TREATMENT">Tratamiento</option>
          <option value="CHECKUP">Chequeo</option>
          <option value="DEWORMING">Desparasitación</option>
        </select>

        <label style={styles.label} htmlFor="event-captured-at">Fecha y hora de captura</label>
        <input id="event-captured-at" type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} max={localDateTimeValue()} required style={styles.input} />

        {requiresProduct && (
          <>
            <label style={styles.label} htmlFor="event-product">Producto aplicado</label>
            <input id="event-product" maxLength="120" value={product} onChange={(event) => setProduct(event.target.value)} required style={styles.input} />

            <label style={styles.label} htmlFor="event-dose">Dosis</label>
            <div style={styles.inlineFields}>
              <input id="event-dose" type="number" min="0.01" max="10000" step="0.01" value={dose} onChange={(event) => setDose(event.target.value)} required style={styles.input} />
              <select aria-label="Unidad de dosis" value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} style={styles.input}>
                <option value="ml">ml</option>
                <option value="mg">mg</option>
                <option value="g">g</option>
                <option value="unidades">unidades</option>
              </select>
            </div>
          </>
        )}

        {eventType === 'TREATMENT' && (
          <>
            <label style={styles.label} htmlFor="event-reason">Motivo del tratamiento</label>
            <textarea id="event-reason" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} required style={styles.input} />
          </>
        )}

        {eventType === 'CHECKUP' && (
          <>
            <label style={styles.label} htmlFor="event-finding">Hallazgo clínico</label>
            <textarea id="event-finding" maxLength="500" value={finding} onChange={(event) => setFinding(event.target.value)} required style={styles.input} />
          </>
        )}

        <label style={styles.label} htmlFor="event-notes">Observación</label>
        <textarea id="event-notes" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} style={{ ...styles.input, minHeight: 78, resize: 'vertical' }} />

        <button type="submit" style={styles.saveButton}>Guardar en este dispositivo</button>
      </form>

      {message && <div role="status" style={message.type === 'error' ? styles.error : styles.success}>{message.text}</div>}

      <div style={styles.queueHeader}>
        <h3 style={styles.queueTitle}>Cola local</h3>
        <div style={styles.actions}>
          {import.meta.env.DEV && (
            <button type="button" onClick={() => setSimulateOffline((value) => !value)} style={simulateOffline ? styles.offlineActive : styles.syncButton}>
              {simulateOffline ? 'Sin conexión simulada' : 'Simular sin conexión'}
            </button>
          )}
          <button type="button" onClick={synchronize} disabled={!pendingCount || syncing} style={styles.syncButton}>
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </div>
      </div>

      {!events.length ? (
        <p style={styles.empty}>Aún no hay eventos guardados en este navegador.</p>
      ) : (
        <div style={styles.list}>
          {events.map((event) => (
            <article key={event.clientEventId} style={styles.item}>
              <div>
                <strong>{EVENT_TYPE_LABELS[event.eventType] || event.eventType}</strong>
                <div style={styles.itemMeta}>{event.din} · {new Date(event.fieldOccurredAt).toLocaleString()}</div>
                {event.syncDetail && <div style={styles.rejected}>{event.syncDetail}</div>}
              </div>
              <div style={styles.statuses}>
                <span style={['SINCRONIZADO', 'DUPLICADO'].includes(readSyncStatus(event)) ? styles.synced : styles.pending}>
                  {SYNC_STATUS_LABELS[readSyncStatus(event)] || readSyncStatus(event)}
                </span>
                <span style={styles.validationPending}>
                  {VALIDATION_STATUS_LABELS[event.validationStatus || 'PENDIENTE_VALIDACION']}
                </span>
                {['SINCRONIZADO', 'DUPLICADO'].includes(readSyncStatus(event)) && import.meta.env.DEV && (
                  <button type="button" onClick={() => resend(event)} disabled={syncing} style={styles.resendButton}>
                    Probar reenvío idempotente
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid #dce7df', borderRadius: 16, padding: 24, textAlign: 'left', color: '#163329' },
  headingRow: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' },
  eyebrow: { color: '#39705a', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' },
  title: { margin: '4px 0 0', color: '#123f30', fontSize: 22, fontWeight: 750 },
  counter: { background: '#e7f5ed', color: '#176b4d', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 800 },
  context: { margin: '16px 0', color: '#51675d', fontSize: 14 },
  form: { display: 'grid', gap: 8 },
  inlineFields: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  input: { padding: '10px 12px', border: '1px solid #b9cec3', borderRadius: 8, fontSize: 14, background: '#fff', color: '#173d30', boxSizing: 'border-box', width: '100%' },
  saveButton: { marginTop: 8, padding: 12, border: 0, borderRadius: 8, background: '#176b4d', color: '#fff', fontWeight: 750, cursor: 'pointer' },
  success: { marginTop: 14, padding: 11, borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: 13 },
  error: { marginTop: 14, padding: 11, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 },
  queueHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 22, borderTop: '1px solid #e5ece8', paddingTop: 18 },
  queueTitle: { margin: 0, fontSize: 16, color: '#173d30' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  syncButton: { padding: '8px 12px', border: '1px solid #176b4d', borderRadius: 8, background: '#fff', color: '#176b4d', fontWeight: 750, cursor: 'pointer' },
  offlineActive: { padding: '8px 12px', border: '1px solid #b91c1c', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontWeight: 750, cursor: 'pointer' },
  empty: { color: '#71827a', fontSize: 13, marginBottom: 0 },
  list: { display: 'grid', gap: 8, marginTop: 12 },
  item: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 11, borderRadius: 9, background: '#f7faf8', border: '1px solid #e2ebe6' },
  itemMeta: { color: '#6d7e76', fontSize: 11, marginTop: 3 },
  rejected: { color: '#991b1b', fontSize: 11, marginTop: 4 },
  statuses: { display: 'grid', justifyItems: 'end', gap: 5 },
  pending: { color: '#805b0b', background: '#fff1c2', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  synced: { color: '#166534', background: '#dcfce7', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  validationPending: { color: '#205a85', background: '#dbeafe', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  resendButton: { padding: '5px 7px', border: '1px solid #64748b', borderRadius: 7, background: '#fff', color: '#475569', fontSize: 10, cursor: 'pointer' },
};
