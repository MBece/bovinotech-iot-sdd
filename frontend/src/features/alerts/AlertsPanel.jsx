import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { AlertDetail } from './AlertDetail';
import { AlertFilters } from './AlertFilters';
import { alertService } from './alertService';

export function AlertsPanel() {
  const { user, role } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [filters, setFilters] = useState({ status: 'OPEN', alert_type: '', bovine_id: '' });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const rows = await alertService.list(user.token, filters);
      setAlerts(rows);
      setSelected((current) => rows.find((row) => row.id === current?.id) || null);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [user.token, filters]);
  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const close = async (id, observation) => {
    try { const updated = await alertService.close(user.token, id, observation); setSelected(updated); await load(); }
    catch (err) { setError(err.message); }
  };
  const canClose = ['OPERARIO', 'VETERINARIO'].includes(role);
  return (
    <section style={styles.card}>
      <div style={styles.header}><div><span style={styles.kicker}>HU-006 · IoT</span><h2 style={styles.title}>Alertas tempranas</h2></div><button type="button" onClick={load}>Actualizar</button></div>
      <AlertFilters filters={filters} onChange={setFilters} />
      <p style={styles.summary}>
        {alerts.filter((item) => item.status === 'OPEN').length} abiertas · {alerts.length} mostradas
      </p>
      {error && <p style={styles.error}>{error}</p>}
      {loading ? <p>Cargando alertas…</p> : alerts.length === 0 ? <p>No hay alertas para los filtros seleccionados.</p> : (
        <div style={styles.list}>{alerts.map((alert) => <button type="button" key={alert.id} style={styles.item} onClick={() => setSelected(alert)}><strong>{alert.alert_type === 'IMMOBILITY' ? 'Inmovilidad' : 'Salida de potrero'}</strong><span>{alert.bovine_id} · {alert.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</span></button>)}</div>
      )}
      <AlertDetail alert={selected} canClose={canClose} onClose={close} />
    </section>
  );
}

const styles = {
  card: { background: '#fff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', textAlign: 'left' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start' },
  kicker: { color: '#047857', fontSize: '.75rem', fontWeight: 800 }, title: { marginTop: '.25rem' },
  list: { display: 'grid', gap: '.5rem' }, item: { display: 'flex', justifyContent: 'space-between', padding: '.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' },
  error: { color: '#b91c1c' },
  summary: { color: '#4b5563', fontSize: '.9rem' },
};

