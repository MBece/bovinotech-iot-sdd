import { useCallback, useEffect, useState } from 'react';
import { offlineEventRepository } from '../../core/offline/offlineEventRepository';
import { syncService } from './syncService';

const EVENT_TYPE_LABELS = {
  VACCINATION: 'Vacunación',
  TREATMENT: 'Tratamiento',
  CHECKUP: 'Chequeo',
};

const STATUS_LABELS = {
  PENDING_SYNC: 'Pendiente',
  SYNCED: 'Sincronizado',
  REJECTED: 'Rechazado',
};

export function OfflineSanitaryCapture({ token, userEmail, selectedAnimal, onSynchronized }) {
  const [events, setEvents] = useState([]);
  const [eventType, setEventType] = useState('VACCINATION');
  const [dose, setDose] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState(null);
  const [syncing, setSyncing] = useState(false);

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
    const record = {
      clientEventId: crypto.randomUUID(),
      din: selectedAnimal.din,
      eventType,
      fieldOccurredAt: new Date().toISOString(),
      dose: dose ? Number(dose) : null,
      notes: notes.trim() || null,
      authorEmail: userEmail,
      status: 'PENDING_SYNC',
    };
    await offlineEventRepository.save(record);
    setDose('');
    setNotes('');
    setMessage({ type: 'success', text: 'Evento guardado localmente. Puede cerrar la aplicación sin perderlo.' });
    await refresh();
  };

  const synchronize = async () => {
    const pending = events.filter((item) => ['PENDING_SYNC', 'REJECTED'].includes(item.status));
    if (!pending.length) return;
    setSyncing(true);
    setMessage(null);
    try {
      const results = await syncService.syncEvents(pending, token);
      await Promise.all(results.map((result) => {
        const localStatus = result.status === 'RECHAZADO' ? 'REJECTED' : 'SYNCED';
        return offlineEventRepository.updateStatus(result.clientEventId, localStatus, result.detail);
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

  const pendingCount = events.filter((event) => event.status !== 'SYNCED').length;

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
        </select>

        <label style={styles.label} htmlFor="event-dose">Dosis opcional</label>
        <input id="event-dose" type="number" min="0.01" max="10000" step="0.01" value={dose} onChange={(event) => setDose(event.target.value)} style={styles.input} />

        <label style={styles.label} htmlFor="event-notes">Observación</label>
        <textarea id="event-notes" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} style={{ ...styles.input, minHeight: 78, resize: 'vertical' }} />

        <button type="submit" style={styles.saveButton}>Guardar en este dispositivo</button>
      </form>

      {message && <div role="status" style={message.type === 'error' ? styles.error : styles.success}>{message.text}</div>}

      <div style={styles.queueHeader}>
        <h3 style={styles.queueTitle}>Cola local</h3>
        <button type="button" onClick={synchronize} disabled={!pendingCount || syncing} style={styles.syncButton}>
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
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
              <span style={event.status === 'SYNCED' ? styles.synced : styles.pending}>
                {STATUS_LABELS[event.status] || event.status}
              </span>
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
  label: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  input: { padding: '10px 12px', border: '1px solid #b9cec3', borderRadius: 8, fontSize: 14, background: '#fff', color: '#173d30', boxSizing: 'border-box', width: '100%' },
  saveButton: { marginTop: 8, padding: 12, border: 0, borderRadius: 8, background: '#176b4d', color: '#fff', fontWeight: 750, cursor: 'pointer' },
  success: { marginTop: 14, padding: 11, borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: 13 },
  error: { marginTop: 14, padding: 11, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 },
  queueHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 22, borderTop: '1px solid #e5ece8', paddingTop: 18 },
  queueTitle: { margin: 0, fontSize: 16, color: '#173d30' },
  syncButton: { padding: '8px 12px', border: '1px solid #176b4d', borderRadius: 8, background: '#fff', color: '#176b4d', fontWeight: 750, cursor: 'pointer' },
  empty: { color: '#71827a', fontSize: 13, marginBottom: 0 },
  list: { display: 'grid', gap: 8, marginTop: 12 },
  item: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 11, borderRadius: 9, background: '#f7faf8', border: '1px solid #e2ebe6' },
  itemMeta: { color: '#6d7e76', fontSize: 11, marginTop: 3 },
  rejected: { color: '#991b1b', fontSize: 11, marginTop: 4 },
  pending: { color: '#805b0b', background: '#fff1c2', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  synced: { color: '#166534', background: '#dcfce7', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
};
