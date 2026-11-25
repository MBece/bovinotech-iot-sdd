import {
  FIELD_LABELS,
  SIMULATION_LABEL,
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

function FieldList({ fields }) {
  return (
    <dl style={styles.grid}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt style={styles.term}>{label}</dt>
          <dd style={styles.value}>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SiniganComparisonCard({ comparison }) {
  const { meta, official, field, result, discrepancies = [], ticket } = comparison;
  const isConsistent = result === 'CONSISTENTE';

  return (
    <div style={styles.wrapper}>
      <div style={styles.summaryRow}>
        <span style={styles.simulationBadge}>
          {meta?.mockLabel || SIMULATION_LABEL}
        </span>
        <span style={isConsistent ? styles.consistent : styles.discrepancy}>
          {isConsistent ? 'Conciliación consistente' : 'Discrepancia detectada'}
        </span>
      </div>

      <p style={styles.summaryText}>
        Comparación realizada el {formatDateTime(meta?.comparedAt)}. La ficha
        oficial es de solo lectura y nunca se sobrescribe automáticamente.
      </p>

      <div style={styles.columns}>
        <article style={styles.panel} aria-labelledby="official-sheet-title">
          <span style={styles.eyebrow}>Fuente oficial simulada</span>
          <h3 id="official-sheet-title" style={styles.panelTitle}>Ficha oficial</h3>
          <FieldList
            fields={[
              ['DIN', official?.din],
              ['Nombre', official?.animalName],
              ['Número', official?.animalNumber],
              [FIELD_LABELS.species, official?.species],
              [FIELD_LABELS.sex, official?.sex],
              [FIELD_LABELS.age_group, official?.ageGroup],
              ['Establecimiento', official?.establishment?.name],
              ['Código de predio', official?.establishment?.sitCode],
            ]}
          />
        </article>

        <article style={styles.panel} aria-labelledby="field-record-title">
          <span style={styles.eyebrow}>Registro local simulado</span>
          <h3 id="field-record-title" style={styles.panelTitle}>Registro de campo</h3>
          <FieldList
            fields={[
              ['DIN', field?.din],
              [FIELD_LABELS.species, field?.species],
              [FIELD_LABELS.sex, field?.sex],
              [FIELD_LABELS.age_group, field?.ageGroup],
              [FIELD_LABELS.sit_code, field?.sitCode],
              ['Establecimiento', field?.establishmentName],
              ['Origen', formatSourceLabel(field?.source)],
              ['Actualizado', formatDateTime(field?.updatedAt)],
            ]}
          />
        </article>
      </div>

      {ticket && (
        <p style={styles.ticketNote}>
          Se generó el ticket #{ticket.id} con estado{' '}
          {STATUS_LABELS[ticket.status] || ticket.status}. Revíselo en la lista de
          tickets para registrar una resolución.
        </p>
      )}

      <h3 style={styles.sectionTitle}>Tabla de discrepancias</h3>
      {discrepancies.length === 0 ? (
        <p style={styles.empty}>
          No hay discrepancias: los cuatro campos comparados coinciden.
        </p>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <caption style={styles.caption}>
              Discrepancias detectadas entre la ficha oficial y el registro de campo
            </caption>
            <thead>
              <tr>
                <th scope="col" style={styles.th}>Campo</th>
                <th scope="col" style={styles.th}>Ficha oficial</th>
                <th scope="col" style={styles.th}>Registro de campo</th>
                <th scope="col" style={styles.th}>Origen oficial</th>
                <th scope="col" style={styles.th}>Origen de campo</th>
                <th scope="col" style={styles.th}>Detectada</th>
              </tr>
            </thead>
            <tbody>
              {discrepancies.map((item) => (
                <tr key={item.fieldName}>
                  <th scope="row" style={styles.rowHeader}>
                    {item.fieldLabel || FIELD_LABELS[item.fieldName] || item.fieldName}
                  </th>
                  <td style={styles.td}>{displayValue(item.officialValue)}</td>
                  <td style={styles.td}>{displayValue(item.fieldValue)}</td>
                  <td style={styles.td}>{displayValue(formatSourceLabel(item.officialSource))}</td>
                  <td style={styles.td}>{displayValue(formatSourceLabel(item.fieldSource))}</td>
                  <td style={styles.td}>{formatDateTime(item.detectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: { marginTop: 18, borderTop: '1px solid #e5ece8', paddingTop: 18 },
  summaryRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  simulationBadge: { background: '#fff1c2', color: '#7a5200', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 800 },
  consistent: { background: '#dff3e8', color: '#14583f', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 800 },
  discrepancy: { background: '#fee2e2', color: '#991b1b', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 800 },
  summaryText: { margin: '12px 0 16px', color: '#51675d', fontSize: 13 },
  columns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 },
  panel: { border: '1px solid #e2ebe6', borderRadius: 10, padding: 14, background: '#f7faf8' },
  eyebrow: { color: '#39705a', fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' },
  panelTitle: { margin: '5px 0 10px', color: '#123f30', fontSize: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, margin: 0 },
  term: { color: '#6d7e76', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { margin: '3px 0 0', color: '#1c3f33', fontWeight: 650, fontSize: 13 },
  ticketNote: { margin: '14px 0 0', padding: 10, borderRadius: 8, background: '#fff9e8', color: '#6b5417', fontSize: 12 },
  sectionTitle: { margin: '20px 0 10px', color: '#173d30', fontSize: 16 },
  empty: { padding: 14, borderRadius: 9, background: '#f7faf8', color: '#71827a', fontSize: 13 },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  caption: { textAlign: 'left', color: '#6d7e76', fontSize: 11, paddingBottom: 8 },
  th: { textAlign: 'left', padding: '8px 9px', background: '#eef5f1', color: '#335348', fontSize: 11, borderBottom: '1px solid #dce7df' },
  rowHeader: { textAlign: 'left', padding: '9px', color: '#173d30', fontWeight: 700, borderBottom: '1px solid #edf2ef' },
  td: { padding: '9px', borderBottom: '1px solid #edf2ef', color: '#334f44' },
};
