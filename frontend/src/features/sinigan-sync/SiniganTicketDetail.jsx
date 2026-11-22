import { useState } from 'react';
import { siniganSyncService } from './siniganSyncService.js';
import {
  canResolveTicket,
  DECISION_LABELS,
  FIELD_LABELS,
  STATUS_LABELS,
  formatSourceLabel,
} from './siniganSyncUtils.js';

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const displayValue = (value) =>
  value === undefined || value === null || value === '' ? 'Sin dato' : value;

const readSnapshotField = (snapshot, fieldName) => {
  if (!snapshot) return null;
  if (fieldName === 'age_group') {
    return snapshot.ageGroup ?? snapshot.age_group;
  }
  if (fieldName === 'sit_code') {
    return (
      snapshot.sitCode ??
      snapshot.sit_code ??
      snapshot.establishment?.sitCode ??
      snapshot.establishment?.sit_code
    );
  }
  return snapshot[fieldName];
};

function SnapshotPanel({ titleId, title, snapshot }) {
  return (
    <article style={styles.panel} aria-labelledby={titleId}>
      <h4 id={titleId} style={styles.panelTitle}>{title}</h4>
      <dl style={styles.grid}>
        <div>
          <dt style={styles.term}>DIN</dt>
          <dd style={styles.value}>{displayValue(snapshot?.din)}</dd>
        </div>
        {Object.entries(FIELD_LABELS).map(([fieldName, label]) => (
          <div key={fieldName}>
            <dt style={styles.term}>{label}</dt>
            <dd style={styles.value}>
              {displayValue(readSnapshotField(snapshot, fieldName))}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function SiniganTicketDetail({ detail, role, token, onResolved }) {
  const [decision, setDecision] = useState('OFICIAL_PREVALECE');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const canResolve = canResolveTicket(role, detail);
  const isVeterinario = role === 'VETERINARIO';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await siniganSyncService.resolveTicket(
        detail.id,
        { decision, reason },
        token,
      );
      setReason('');
      setSuccess(
        `Ticket #${result.id} cerrado correctamente con la decisión "${
          DECISION_LABELS[result.resolution?.decision] || result.resolution?.decision
        }".`,
      );
      onResolved?.(result);
    } catch (resolveError) {
      setError(resolveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <dl style={styles.metaGrid}>
        <div>
          <dt style={styles.term}>DIN</dt>
          <dd style={styles.value}>{detail.din}</dd>
        </div>
        <div>
          <dt style={styles.term}>Estado</dt>
          <dd style={styles.value}>
            <span style={detail.status === 'OPEN' ? styles.open : styles.closed}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
          </dd>
        </div>
        <div>
          <dt style={styles.term}>Comparado</dt>
          <dd style={styles.value}>{formatDateTime(detail.comparedAt)}</dd>
        </div>
        <div>
          <dt style={styles.term}>Creado por</dt>
          <dd style={styles.value}>{displayValue(detail.createdByEmail)}</dd>
        </div>
        <div>
          <dt style={styles.term}>Creado</dt>
          <dd style={styles.value}>{formatDateTime(detail.createdAt)}</dd>
        </div>
        <div>
          <dt style={styles.term}>Cerrado</dt>
          <dd style={styles.value}>{formatDateTime(detail.closedAt)}</dd>
        </div>
      </dl>

      <p style={styles.sourceLine}>
        Origen oficial: <strong>{displayValue(formatSourceLabel(detail.officialSource))}</strong> ·
        Origen de campo: <strong>{displayValue(formatSourceLabel(detail.fieldSource))}</strong>
      </p>

      <div style={styles.columns}>
        <SnapshotPanel
          titleId={`official-snapshot-${detail.id}`}
          title="Snapshot de la ficha oficial"
          snapshot={detail.officialSnapshot}
        />
        <SnapshotPanel
          titleId={`field-snapshot-${detail.id}`}
          title="Snapshot del registro de campo"
          snapshot={detail.fieldSnapshot}
        />
      </div>

      <h4 style={styles.sectionTitle}>Discrepancias del ticket</h4>
      {detail.discrepancies?.length ? (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <caption style={styles.caption}>
              Discrepancias conservadas en el ticket #{detail.id}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={styles.th}>Campo</th>
                <th scope="col" style={styles.th}>Ficha oficial</th>
                <th scope="col" style={styles.th}>Registro de campo</th>
                <th scope="col" style={styles.th}>Detectada</th>
              </tr>
            </thead>
            <tbody>
              {detail.discrepancies.map((item) => (
                <tr key={item.fieldName}>
                  <th scope="row" style={styles.rowHeader}>
                    {item.fieldLabel || FIELD_LABELS[item.fieldName] || item.fieldName}
                  </th>
                  <td style={styles.td}>{displayValue(item.officialValue)}</td>
                  <td style={styles.td}>{displayValue(item.fieldValue)}</td>
                  <td style={styles.td}>{formatDateTime(item.detectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={styles.empty}>El ticket no tiene discrepancias registradas.</p>
      )}

      {detail.resolution && (
        <section style={styles.resolution} aria-labelledby={`resolution-${detail.id}`}>
          <h4 id={`resolution-${detail.id}`} style={styles.resolutionTitle}>
            Resolución registrada
          </h4>
          <p style={styles.resolutionDecision}>
            {DECISION_LABELS[detail.resolution.decision] || detail.resolution.decision}
          </p>
          <p style={styles.resolutionReason}>{detail.resolution.reason}</p>
          <p style={styles.resolutionMeta}>
            {displayValue(detail.resolution.resolvedByEmail)} ·{' '}
            {formatDateTime(detail.resolution.resolvedAt)}
          </p>
        </section>
      )}

      {error && <div role="alert" style={styles.error}>{error}</div>}
      {success && <div role="status" style={styles.success}>{success}</div>}

      {canResolve && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <h4 style={styles.formTitle}>Resolución veterinaria</h4>
          <label htmlFor="resolution-decision" style={styles.label}>
            Decisión
          </label>
          <select
            id="resolution-decision"
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            style={styles.select}
          >
            {Object.entries(DECISION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <label htmlFor="resolution-reason" style={styles.label}>
            Motivo obligatorio (5 a 500 caracteres)
          </label>
          <textarea
            id="resolution-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength="5"
            maxLength="500"
            required
            style={styles.textarea}
          />

          <button type="submit" disabled={saving} style={styles.saveButton}>
            {saving ? 'Resolviendo…' : 'Cerrar ticket con resolución'}
          </button>
        </form>
      )}

      {!canResolve && detail.status === 'OPEN' && !isVeterinario && (
        <p style={styles.permissionNote} role="note">
          Solo un usuario con rol VETERINARIO puede resolver este ticket.
        </p>
      )}
    </div>
  );
}

const styles = {
  wrapper: { display: 'grid', gap: 14 },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, margin: 0 },
  term: { color: '#6d7e76', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { margin: '3px 0 0', color: '#1c3f33', fontWeight: 650, fontSize: 13 },
  open: { color: '#805b0b', background: '#fff1c2', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  closed: { color: '#205a85', background: '#dbeafe', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  sourceLine: { margin: 0, padding: 10, borderRadius: 8, background: '#f7faf8', color: '#51675d', fontSize: 12 },
  columns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  panel: { border: '1px solid #e2ebe6', borderRadius: 10, padding: 13, background: '#f7faf8' },
  panelTitle: { margin: '0 0 10px', color: '#123f30', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, margin: 0 },
  sectionTitle: { margin: '4px 0 0', color: '#173d30', fontSize: 15 },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  caption: { textAlign: 'left', color: '#6d7e76', fontSize: 11, paddingBottom: 8 },
  th: { textAlign: 'left', padding: '8px 9px', background: '#eef5f1', color: '#335348', fontSize: 11, borderBottom: '1px solid #dce7df' },
  rowHeader: { textAlign: 'left', padding: '9px', color: '#173d30', fontWeight: 700, borderBottom: '1px solid #edf2ef' },
  td: { padding: '9px', borderBottom: '1px solid #edf2ef', color: '#334f44' },
  empty: { margin: 0, padding: 14, borderRadius: 9, background: '#f7faf8', color: '#71827a', fontSize: 13 },
  resolution: { border: '1px solid #cfe3d8', borderRadius: 10, padding: 14, background: '#eef8f2' },
  resolutionTitle: { margin: 0, color: '#14583f', fontSize: 15 },
  resolutionDecision: { margin: '8px 0 4px', color: '#123f30', fontWeight: 750, fontSize: 13 },
  resolutionReason: { margin: '0 0 7px', color: '#334f44', fontSize: 13 },
  resolutionMeta: { margin: 0, color: '#6d7e76', fontSize: 11 },
  error: { padding: 11, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 },
  success: { padding: 11, borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 13 },
  form: { padding: 16, borderRadius: 10, background: '#f7faf8', display: 'grid', gap: 8, border: '1px solid #e2ebe6' },
  formTitle: { margin: '0 0 6px', fontSize: 15, color: '#173d30' },
  label: { fontSize: 12, fontWeight: 750 },
  select: { padding: '9px 10px', border: '1px solid #b9cec3', borderRadius: 8, background: '#fff', fontFamily: 'inherit' },
  textarea: { width: '100%', minHeight: 72, boxSizing: 'border-box', padding: 10, border: '1px solid #b9cec3', borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' },
  saveButton: { justifySelf: 'end', padding: '9px 14px', border: 0, borderRadius: 7, background: '#176b4d', color: '#fff', fontWeight: 750, cursor: 'pointer' },
  permissionNote: { margin: 0, padding: 11, borderRadius: 8, background: '#fff9e8', color: '#6b5417', fontSize: 12 },
};
