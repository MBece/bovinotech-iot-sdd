import { useState } from 'react';

const typeLabel = (type) => type === 'IMMOBILITY' ? 'Inmovilidad' : 'Salida de potrero';

export function AlertDetail({ alert, canClose, onClose }) {
  const [observation, setObservation] = useState('');
  const [saving, setSaving] = useState(false);
  if (!alert) return <p>Seleccione una alerta para ver su evidencia.</p>;
  const close = async () => {
    if (observation.trim().length < 3) return;
    setSaving(true);
    try { await onClose(alert.id, observation.trim()); setObservation(''); } finally { setSaving(false); }
  };
  return (
    <div style={styles.detail}>
      <h3>{typeLabel(alert.alert_type)} · {alert.bovine_id}</h3>
      <p><strong>Estado:</strong> {alert.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</p>
      <p><strong>Primera evidencia:</strong> {new Date(alert.first_detected_at).toLocaleString('es-CO')}</p>
      <p><strong>Última evidencia:</strong> {new Date(alert.last_detected_at).toLocaleString('es-CO')}</p>
      <p><strong>Regla aplicada:</strong> versión #{alert.rule_version_id}</p>
      {alert.latitude != null ? <p><strong>Última posición válida:</strong> {alert.latitude}, {alert.longitude}</p> : <p>Sin posición válida disponible.</p>}
      {alert.closure_note && <p><strong>Atención registrada:</strong> {alert.closure_note}</p>}
      {canClose && alert.status === 'OPEN' && (
        <div style={styles.closeBox}>
          <label htmlFor={`close-${alert.id}`}>Observación de atención</label>
          <textarea id={`close-${alert.id}`} value={observation} maxLength={500} onChange={(event) => setObservation(event.target.value)} />
          <button type="button" disabled={saving || observation.trim().length < 3} onClick={close}>{saving ? 'Guardando…' : 'Cerrar alerta'}</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  detail: { borderTop: '1px solid #d1d5db', marginTop: '1rem', paddingTop: '1rem' },
  closeBox: { display: 'grid', gap: '0.5rem', marginTop: '1rem' },
};

