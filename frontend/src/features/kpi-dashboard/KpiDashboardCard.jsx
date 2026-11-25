export function KpiDashboardCard({ title, value, unit, icon, color, loading }) {
  return (
    <div style={{ ...styles.card, borderTop: `4px solid ${color || '#176b4d'}` }}>
      <div style={styles.cardHeader}>
        <span style={styles.cardIcon}>{icon || '📊'}</span>
        <h3 style={styles.cardTitle}>{title}</h3>
      </div>
      <div style={styles.cardValue}>
        {loading ? (
          <span style={styles.loading}>Cargando...</span>
        ) : (
          <>
            <span style={{ ...styles.number, color: color || '#176b4d' }}>
              {value ?? '—'}
            </span>
            {unit && <span style={styles.unit}> {unit}</span>}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '1.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    minWidth: '200px',
    flex: '1 1 200px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  cardIcon: { fontSize: '1.5rem' },
  cardTitle: {
    margin: 0,
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  cardValue: { textAlign: 'center', padding: '0.5rem 0' },
  number: { fontSize: '2rem', fontWeight: '700' },
  unit: { fontSize: '0.9rem', color: '#6b7280', fontWeight: '500' },
  loading: { color: '#9ca3af', fontSize: '0.9rem' },
};