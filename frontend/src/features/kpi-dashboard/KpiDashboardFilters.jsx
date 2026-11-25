import { buildDefaultDateRange } from './kpiDashboardUtils';

export function KpiDashboardFilters({ onFiltersChange, loading }) {
  const range = buildDefaultDateRange();

  const handleDateChange = (field, value) => {
    onFiltersChange({ [field]: value || null });
  };

  return (
    <div style={styles.filters}>
      <div style={styles.filterGroup}>
        <label style={styles.label} htmlFor="kpi-start-date">
          Desde
        </label>
        <input
          id="kpi-start-date"
          type="date"
          defaultValue={range.startDate}
          onChange={(e) => handleDateChange('startDate', e.target.value)}
          style={styles.input}
          disabled={loading}
        />
      </div>
      <div style={styles.filterGroup}>
        <label style={styles.label} htmlFor="kpi-end-date">
          Hasta
        </label>
        <input
          id="kpi-end-date"
          type="date"
          defaultValue={range.endDate}
          onChange={(e) => handleDateChange('endDate', e.target.value)}
          style={styles.input}
          disabled={loading}
        />
      </div>
    </div>
  );
}

const styles = {
  filters: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: '1.5rem',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#4b5563',
  },
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '0.9rem',
    backgroundColor: '#ffffff',
  },
};