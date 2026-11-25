export function AlertFilters({ filters, onChange }) {
  return (
    <div style={styles.row} aria-label="Filtros de alertas">
      <select value={filters.status || ''} onChange={(event) => onChange({ ...filters, status: event.target.value })}>
        <option value="">Todos los estados</option>
        <option value="OPEN">Abiertas</option>
        <option value="CLOSED">Cerradas</option>
      </select>
      <select value={filters.alert_type || ''} onChange={(event) => onChange({ ...filters, alert_type: event.target.value })}>
        <option value="">Todos los tipos</option>
        <option value="IMMOBILITY">Inmovilidad</option>
        <option value="GEOFENCE_EXIT">Salida de potrero</option>
      </select>
      <input
        aria-label="Animal"
        placeholder="Identificador del animal"
        value={filters.bovine_id || ''}
        onChange={(event) => onChange({ ...filters, bovine_id: event.target.value })}
      />
    </div>
  );
}

const styles = { row: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' } };

