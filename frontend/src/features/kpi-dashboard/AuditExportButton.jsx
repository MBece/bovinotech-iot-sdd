import { useState } from 'react';
import { kpiDashboardService } from './kpiDashboardService';

export function AuditExportButton({ token, filters }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const data = await kpiDashboardService.getAuditExport(token, filters);
      // Descargar como JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria-kpi-${filters.farmId || 'todas'}-${filters.startDate || 'inicio'}-${filters.endDate || 'hoy'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleExport} disabled={loading} style={styles.button}>
        {loading ? 'Exportando...' : '📥 Exportar reporte de auditoría'}
      </button>
      {error && <p style={styles.error}>{error}</p>}
      {success && <p style={styles.success}>✅ Reporte descargado con éxito</p>}
    </div>
  );
}

const styles = {
  button: {
    padding: '0.6rem 1.2rem',
    borderRadius: '8px',
    border: '1px solid #176b4d',
    backgroundColor: '#ffffff',
    color: '#176b4d',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginTop: '1rem',
  },
  error: { color: '#991b1b', fontSize: '0.85rem', marginTop: '0.5rem' },
  success: { color: '#15803d', fontSize: '0.85rem', marginTop: '0.5rem' },
};