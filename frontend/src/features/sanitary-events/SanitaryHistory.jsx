import { useCallback, useEffect, useMemo, useState } from 'react';
import { sanitaryHistoryService } from './sanitaryHistoryService';

const EVENT_LABELS = {
  VACCINATION: 'Vacunación',
  TREATMENT: 'Tratamiento',
  CHECKUP: 'Chequeo',
  DEWORMING: 'Desparasitación',
};

const STATUS_LABELS = {
  PENDIENTE_VALIDACION: 'Pendiente de validación',
  CORREGIDO: 'Corrección registrada',
};

export function SanitaryHistory({ token, role, selectedAnimal, refreshSignal = 0 }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!selectedAnimal) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sanitaryHistoryService.getByDin(selectedAnimal.din, token);
      setItems(response.items);
    } catch (historyError) {
      setError(historyError.message);
    } finally {
      setLoading(false);
    }
  }, [selectedAnimal, token]);

  useEffect(() => {
    if (!selectedAnimal) return undefined;
    let cancelled = false;
    sanitaryHistoryService
      .getByDin(selectedAnimal.din, token)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setError(null);
        }
      })
      .catch((historyError) => {
        if (!cancelled) setError(historyError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAnimal, token, refreshSignal]);

  const latestByEvent = useMemo(() => {
    const latest = new Map();
    items.forEach((item) => {
      const current = latest.get(item.eventId);
      if (!current || item.version > current.version) latest.set(item.eventId, item);
    });
    return latest;
  }, [items]);

  const beginCorrection = (item) => {
    setEditing(item);
    setReason('');
    setNotes(item.notes || '');
    setError(null);
  };

  const saveCorrection = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await sanitaryHistoryService.correct(
        editing.eventId,
        {
          baseVersion: editing.version,
          eventType: editing.eventType,
          fieldOccurredAt: editing.fieldOccurredAt,
          product: editing.product,
          dose: editing.dose,
          doseUnit: editing.doseUnit,
          clinicalReason: editing.clinicalReason,
          finding: editing.finding,
          notes: notes.trim() || null,
          reason,
        },
        token,
      );
      setEditing(null);
      await loadHistory();
    } catch (correctionError) {
      setError(correctionError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={styles.card} aria-labelledby="history-title">
      <div style={styles.headingRow}>
        <div>
          <span style={styles.eyebrow}>Auditoría sanitaria</span>
          <h2 id="history-title" style={styles.title}>Historial solo-anexión</h2>
        </div>
        <span style={styles.counter}>{items.length} registros</span>
      </div>

      <p style={styles.description}>
        Las correcciones crean una versión nueva. El registro anterior permanece intacto.
      </p>

      {!selectedAnimal && <p style={styles.empty}>Consulte un DIN para ver su historial.</p>}
      {loading && <p style={styles.empty}>Consultando historial…</p>}
      {error && <div role="alert" style={styles.error}>{error}</div>}

      {selectedAnimal && !loading && !items.length && (
        <p style={styles.empty}>Este animal todavía no tiene eventos sincronizados.</p>
      )}

      <div style={styles.timeline}>
        {items.map((item) => {
          const isLatest = latestByEvent.get(item.eventId)?.version === item.version;
          return (
            <article key={`${item.eventId}-${item.version}`} style={styles.item}>
              <div style={styles.version}>Versión {item.version}</div>
              <div style={styles.itemBody}>
                <div style={styles.itemHeader}>
                  <strong>{EVENT_LABELS[item.eventType] || item.eventType}</strong>
                  <span style={item.version > 1 ? styles.corrected : styles.pending}>
                    {STATUS_LABELS[item.validationStatus] || item.validationStatus}
                  </span>
                </div>
                <div style={styles.meta}>
                  {new Date(item.fieldOccurredAt).toLocaleString()} · {item.authorEmail}
                </div>
                {item.product && <div style={styles.detail}>Producto: {item.product}</div>}
                {item.dose && <div style={styles.detail}>Dosis: {item.dose} {item.doseUnit || ''}</div>}
                {item.clinicalReason && <div style={styles.detail}>Motivo clínico: {item.clinicalReason}</div>}
                {item.finding && <div style={styles.detail}>Hallazgo: {item.finding}</div>}
                {item.notes && <div style={styles.detail}>Observación: {item.notes}</div>}
                {item.reason && <div style={styles.reason}>Motivo de corrección: {item.reason}</div>}
                {role === 'VETERINARIO' && isLatest && (
                  <button type="button" onClick={() => beginCorrection(item)} style={styles.correctButton}>
                    Registrar corrección
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editing && (
        <form onSubmit={saveCorrection} style={styles.form}>
          <h3 style={styles.formTitle}>Nueva corrección de la versión {editing.version}</h3>
          <label htmlFor="correction-notes" style={styles.label}>Observación corregida</label>
          <textarea id="correction-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength="500" style={styles.input} />
          <label htmlFor="correction-reason" style={styles.label}>Motivo obligatorio</label>
          <textarea id="correction-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength="5" maxLength="500" required style={styles.input} />
          <div style={styles.actions}>
            <button type="button" onClick={() => setEditing(null)} style={styles.cancelButton}>Cancelar</button>
            <button type="submit" disabled={saving} style={styles.saveButton}>{saving ? 'Guardando…' : 'Guardar nueva versión'}</button>
          </div>
        </form>
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
  description: { margin: '14px 0 18px', color: '#51675d', fontSize: 14 },
  empty: { padding: 18, borderRadius: 9, background: '#f7faf8', color: '#71827a' },
  error: { margin: '12px 0', padding: 11, borderRadius: 8, background: '#fee2e2', color: '#991b1b' },
  timeline: { display: 'grid', gap: 10 },
  item: { display: 'grid', gridTemplateColumns: '76px 1fr', gap: 12, border: '1px solid #e2ebe6', borderRadius: 10, padding: 13 },
  version: { color: '#39705a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' },
  itemBody: { minWidth: 0 },
  itemHeader: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  meta: { color: '#6d7e76', fontSize: 11, marginTop: 4 },
  detail: { color: '#334f44', fontSize: 13, marginTop: 7 },
  reason: { color: '#6b5417', background: '#fff9e8', borderRadius: 6, padding: 8, fontSize: 12, marginTop: 8 },
  pending: { color: '#805b0b', background: '#fff1c2', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  corrected: { color: '#205a85', background: '#dbeafe', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  correctButton: { marginTop: 10, padding: '7px 10px', border: '1px solid #176b4d', borderRadius: 7, background: '#fff', color: '#176b4d', fontWeight: 700, cursor: 'pointer' },
  form: { marginTop: 18, padding: 16, borderRadius: 10, background: '#f7faf8', display: 'grid', gap: 8 },
  formTitle: { margin: '0 0 6px', fontSize: 16, color: '#173d30' },
  label: { fontSize: 12, fontWeight: 750 },
  input: { width: '100%', minHeight: 64, boxSizing: 'border-box', padding: 10, border: '1px solid #b9cec3', borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 5 },
  cancelButton: { padding: '9px 12px', border: '1px solid #b8c8c0', borderRadius: 7, background: '#fff', color: '#4d6359', cursor: 'pointer' },
  saveButton: { padding: '9px 12px', border: 0, borderRadius: 7, background: '#176b4d', color: '#fff', fontWeight: 750, cursor: 'pointer' },
};
