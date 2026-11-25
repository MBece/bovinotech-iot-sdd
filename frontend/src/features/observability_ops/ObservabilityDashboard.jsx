import { useState, useEffect } from 'react';

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000';

export function ObservabilityDashboard() {
  const [metricsData, setMetricsData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const [metricsResp, logsResp] = await Promise.all([
          fetch(`${API_URL}/ops/metrics`),
          fetch(`${API_URL}/ops/logs`),
        ]);
        if (!isMounted) return;
        if (metricsResp.ok) {
          const m = await metricsResp.json();
          setMetricsData(m);
        }
        if (logsResp.ok) {
          const l = await logsResp.json();
          setLogs(l.slice(0, 15));
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      }
    };

    load();
    const interval = setInterval(load, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const refreshData = async () => {
    try {
      const [metricsResp, logsResp] = await Promise.all([
        fetch(`${API_URL}/ops/metrics`),
        fetch(`${API_URL}/ops/logs`),
      ]);
      if (metricsResp.ok) {
        const m = await metricsResp.json();
        setMetricsData(m);
      }
      if (logsResp.ok) {
        const l = await logsResp.json();
        setLogs(l.slice(0, 15));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleSimulation = async (activate) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_URL}/ops/simulate-degradation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: activate,
          inject_latency_seconds: activate ? 14.8 : 0.0,
          inject_error_rate_percent: activate ? 12.0 : 0.0,
        }),
      });
      if (!resp.ok) {
        throw new Error('Error al actualizar simulación de degradación');
      }
      await refreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const metrics = metricsData?.metrics;
  const budget = metricsData?.error_budget;
  const isHealthy = budget?.status === 'SALUDABLE';

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <span style={styles.kicker}>Ingeniería SRE & DevSecOps</span>
          <h2 style={styles.title}>Tablero de Observabilidad Técnica & Error Budget</h2>
          <p style={styles.subtitle}>
            Monitoreo en tiempo real de SLI/SLO, Presupuesto de Error y Gobernanza de Despliegues
          </p>
        </div>
        <div style={styles.statusBadge(isHealthy)}>
          {budget?.status || 'CARGANDO...'}
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Feature Freeze Critical Banner */}
      {budget?.is_freeze_active && (
        <div style={styles.freezeBanner}>
          <div style={styles.freezeIcon}>⚠️</div>
          <div>
            <h4 style={styles.freezeTitle}>COMPUERTA DE CONGELAMIENTO ACTIVA (FEATURE FREEZE)</h4>
            <p style={styles.freezeText}>
              {budget.freeze_reason || 'El Presupuesto de Error se ha agotado. Políticas Kanban exigen suspender nuevos cambios y priorizar tareas de estabilización (Run).'}
            </p>
          </div>
        </div>
      )}

      {/* Key SLI / SLO Metrics Cards */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Latencia Alertas IoT (p99)</span>
          <div style={styles.metricValue(metrics ? metrics.latency_p99_seconds < 10.0 : true)}>
            {metrics ? `${metrics.latency_p99_seconds}s` : '--'}
          </div>
          <span style={styles.metricTarget}>Objetivo SLO: &lt; 10.0s</span>
        </div>

        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Éxito Sincronización Rural</span>
          <div style={styles.metricValue(metrics ? metrics.sync_success_rate_percent >= 99.9 : true)}>
            {metrics ? `${metrics.sync_success_rate_percent}%` : '--'}
          </div>
          <span style={styles.metricTarget}>Objetivo SLO: 99.9%</span>
        </div>

        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Presupuesto de Error Restante</span>
          <div style={styles.metricValue(isHealthy)}>
            {budget ? `${budget.budget_percentage_remaining}%` : '--'}
          </div>
          <span style={styles.metricTarget}>
            {isHealthy ? 'Margen Disponible' : 'Agotado (0.0%)'}
          </span>
        </div>

        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Tasa de Error Global</span>
          <div style={styles.metricValue(metrics ? metrics.error_rate_percent <= 0.1 : true)}>
            {metrics ? `${metrics.error_rate_percent}%` : '--'}
          </div>
          <span style={styles.metricTarget}>Eventos: {metrics?.total_processed_events || 0}</span>
        </div>
      </div>

      {/* Error Budget Visual Progress Bar */}
      <div style={styles.budgetSection}>
        <div style={styles.budgetHeader}>
          <span style={styles.budgetTitle}>Saldo del Error Budget:</span>
          <span style={styles.budgetPercent}>{budget?.budget_percentage_remaining || 0}%</span>
        </div>
        <div style={styles.progressBarBg}>
          <div
            style={styles.progressBarFill(
              budget?.budget_percentage_remaining || 0,
              isHealthy
            )}
          />
        </div>
      </div>

      {/* Interactive Simulation Controls */}
      <div style={styles.controlsSection}>
        <span style={styles.controlsTitle}>Demostración en Vivo de SRE & Presupuesto de Error:</span>
        <div style={styles.buttonRow}>
          <button
            type="button"
            disabled={loading || isHealthy}
            onClick={() => toggleSimulation(false)}
            style={styles.restoreBtn(isHealthy)}
          >
            ✓ Restablecer Servicio a SALUDABLE
          </button>
          <button
            type="button"
            disabled={loading || !isHealthy}
            onClick={() => toggleSimulation(true)}
            style={styles.degradeBtn(!isHealthy)}
          >
            🔥 Simular Degradación (Agotar Error Budget)
          </button>
        </div>
      </div>

      {/* Structured Trace Log Console */}
      <div style={styles.logSection}>
        <div style={styles.logHeader}>
          <span style={styles.logTitle}>Consola de Trazabilidad Estructurada (correlation_id)</span>
          <span style={styles.logCount}>{logs.length} registros capturados</span>
        </div>
        <div style={styles.consoleBox}>
          {logs.length === 0 ? (
            <p style={styles.consoleEmpty}>No hay registros técnicos disponibles.</p>
          ) : (
            logs.map((item, idx) => (
              <div key={idx} style={styles.logLine}>
                <span style={styles.logTime}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
                <span style={styles.logLevel(item.level)}>[{item.level}]</span>
                <span style={styles.logCorr}>[{item.correlation_id}]</span>
                <span style={styles.logMsg}>{item.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '1.75rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    border: '1px solid #e2e8f0',
    marginTop: '1.5rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.25rem',
  },
  kicker: {
    fontSize: '0.75rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#4c51bf',
    letterSpacing: '0.05em',
  },
  title: {
    margin: '0.25rem 0',
    fontSize: '1.4rem',
    color: '#1a202c',
    fontWeight: '700',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#718096',
  },
  statusBadge: (isHealthy) => ({
    backgroundColor: isHealthy ? '#c6f6d5' : '#fed7d7',
    color: isHealthy ? '#22543d' : '#9b2c2c',
    padding: '0.4rem 0.9rem',
    borderRadius: '9999px',
    fontSize: '0.85rem',
    fontWeight: '700',
    border: `1px solid ${isHealthy ? '#9ae6b4' : '#feb2b2'}`,
  }),
  errorBox: {
    backgroundColor: '#fff5f5',
    color: '#c53030',
    padding: '0.75rem',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    border: '1px solid #feb2b2',
  },
  freezeBanner: {
    backgroundColor: '#fff5f5',
    border: '2px solid #e53e3e',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
    display: 'flex',
    gap: '0.8rem',
    alignItems: 'center',
    boxShadow: '0 0 10px rgba(229, 62, 62, 0.2)',
  },
  freezeIcon: {
    fontSize: '1.8rem',
  },
  freezeTitle: {
    margin: '0 0 0.25rem 0',
    color: '#9b2c2c',
    fontSize: '1rem',
    fontWeight: '800',
    letterSpacing: '0.02em',
  },
  freezeText: {
    margin: 0,
    color: '#c53030',
    fontSize: '0.85rem',
    lineHeight: '1.4',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  metricCard: {
    backgroundColor: '#f7fafc',
    borderRadius: '8px',
    padding: '1rem',
    border: '1px solid #edf2f7',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: '0.75rem',
    color: '#718096',
    fontWeight: '600',
    marginBottom: '0.4rem',
  },
  metricValue: (ok) => ({
    fontSize: '1.6rem',
    fontWeight: '800',
    color: ok ? '#2f855a' : '#c53030',
    marginBottom: '0.2rem',
  }),
  metricTarget: {
    fontSize: '0.75rem',
    color: '#a0aec0',
  },
  budgetSection: {
    marginBottom: '1.5rem',
  },
  budgetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#4a5568',
    marginBottom: '0.4rem',
  },
  budgetTitle: {},
  budgetPercent: {
    fontWeight: '700',
  },
  progressBarBg: {
    height: '10px',
    backgroundColor: '#edf2f7',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressBarFill: (percent, isHealthy) => ({
    height: '100%',
    width: `${percent}%`,
    backgroundColor: isHealthy ? '#38a169' : '#e53e3e',
    transition: 'width 0.4s ease, background-color 0.4s ease',
  }),
  controlsSection: {
    backgroundColor: '#f8fafc',
    border: '1px dashed #cbd5e0',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  controlsTitle: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#4a5568',
    marginBottom: '0.75rem',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  restoreBtn: (disabled) => ({
    backgroundColor: disabled ? '#e2e8f0' : '#2b6cb0',
    color: disabled ? '#a0aec0' : '#ffffff',
    border: 'none',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem',
    fontWeight: '600',
  }),
  degradeBtn: (disabled) => ({
    backgroundColor: disabled ? '#e2e8f0' : '#c53030',
    color: disabled ? '#a0aec0' : '#ffffff',
    border: 'none',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem',
    fontWeight: '600',
  }),
  logSection: {
    marginTop: '1rem',
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    color: '#718096',
    fontWeight: '600',
    marginBottom: '0.5rem',
  },
  logTitle: {},
  logCount: {},
  consoleBox: {
    backgroundColor: '#1a202c',
    color: '#e2e8f0',
    borderRadius: '8px',
    padding: '0.8rem',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    maxHeight: '180px',
    overflowY: 'auto',
  },
  consoleEmpty: {
    color: '#718096',
    margin: 0,
    fontStyle: 'italic',
  },
  logLine: {
    display: 'flex',
    gap: '0.6rem',
    padding: '0.2rem 0',
    borderBottom: '1px solid #2d3748',
  },
  logTime: {
    color: '#a0aec0',
  },
  logLevel: (level) => ({
    color: level === 'WARN' || level === 'ERROR' ? '#fc8181' : '#68d391',
    fontWeight: '700',
  }),
  logCorr: {
    color: '#63b3ed',
  },
  logMsg: {
    color: '#edf2f7',
  },
};
