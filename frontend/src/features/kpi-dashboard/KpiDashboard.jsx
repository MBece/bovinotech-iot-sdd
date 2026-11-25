import { useCallback, useEffect, useState } from 'react';
import { kpiDashboardService } from './kpiDashboardService';
import { canExportAudit, formatGdp, formatNumber, formatPercentage, formatDate } from './kpiDashboardUtils';
import { KpiDashboardCard } from './KpiDashboardCard';
import { KpiDashboardFilters } from './KpiDashboardFilters';
import { AuditExportButton } from './AuditExportButton';

const INDICATOR_COLORS = {
  validatedVaccinationCoverage: '#176b4d',
  pendingValidationEvents: '#d97706',
  openAlerts: '#ef4444',
  averageGdp: '#3b82f6',
};

const INDICATOR_ICONS = {
  validatedVaccinationCoverage: '💉',
  pendingValidationEvents: '⏳',
  openAlerts: '🚨',
  averageGdp: '📈',
};

export function KpiDashboard({ token, role, farmId, farms }) {
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});

  const currentFilters = { farmId, startDate: filters.startDate ?? null, endDate: filters.endDate ?? null };

  const loadKpi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await kpiDashboardService.getKpi(token, currentFilters);
      setKpiData(data);
    } catch (err) {
      setError(err.message);
      setKpiData(null);
    } finally {
      setLoading(false);
    }
  }, [token, JSON.stringify(currentFilters)]);

  useEffect(() => {
    loadKpi();
  }, [loadKpi]);

  const handleFiltersChange = (partial) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const operationalOnly = kpiData?.operationalOnly ?? false;
  const indicators = kpiData?.indicators ?? {};

  return (
    <section style={styles.section} aria-labelledby="kpi-dashboard-title">
      <div style={styles.headingRow}>
        <div>
          <span style={styles.eyebrow}>Dashboard de indicadores</span>
          <h2 id="kpi-dashboard-title" style={styles.title}>
            Tablero de indicadores
          </h2>
          <p style={styles.subtitle}>
            {kpiData ? (
              <>
                Finca: <strong>{kpiData.farmName}</strong> | Rol: <strong>{role}</strong>
                {kpiData.period && (
                  <> | Periodo: {formatDate(kpiData.period.start)} – {formatDate(kpiData.period.end)}</>
                )}
              </>
            ) : (
              <>Finca: <strong>{farmId || '—'}</strong> | Rol: <strong>{role}</strong></>
            )}
          </p>
        </div>
      </div>

      <KpiDashboardFilters
        farmId={farmId}
        farms={farms}
        onFiltersChange={handleFiltersChange}
        loading={loading}
      />

      {error && (
        <div role="alert" style={styles.error}>
          {error}
        </div>
      )}

      <div style={styles.grid}>
        <KpiDashboardCard
          title="Cobertura de vacunación validada"
          value={formatPercentage(indicators.validatedVaccinationCoverage)}
          unit="%"
          icon={INDICATOR_ICONS.validatedVaccinationCoverage}
          color={INDICATOR_COLORS.validatedVaccinationCoverage}
          loading={loading}
        />
        <KpiDashboardCard
          title="Eventos pendientes validación"
          value={formatNumber(indicators.pendingValidationEvents)}
          icon={INDICATOR_ICONS.pendingValidationEvents}
          color={INDICATOR_COLORS.pendingValidationEvents}
          loading={loading}
        />
        {!operationalOnly && (
          <KpiDashboardCard
            title="Alertas abiertas"
            value={formatNumber(indicators.openAlerts)}
            icon={INDICATOR_ICONS.openAlerts}
            color={INDICATOR_COLORS.openAlerts}
            loading={loading}
          />
        )}
        {!operationalOnly && (
          <KpiDashboardCard
            title="GDP promedio"
            value={formatGdp(indicators.averageGdp)}
            icon={INDICATOR_ICONS.averageGdp}
            color={INDICATOR_COLORS.averageGdp}
            loading={loading}
          />
        )}
      </div>

      {kpiData && !loading && (
        <div style={styles.meta}>
          <span style={styles.metaText}>
            Generado: {formatDate(kpiData.generatedAt)} por {kpiData.generatedBy}
          </span>
        </div>
      )}

      {canExportAudit(role) && (
        <AuditExportButton token={token} filters={currentFilters} />
      )}
    </section>
  );
}

const styles = {
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '1.5rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    textAlign: 'left',
    color: '#1f2937',
  },
  headingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: '0.25rem',
  },
  eyebrow: {
    color: '#39705a',
    fontSize: '0.75rem',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  title: {
    margin: '0.25rem 0 0',
    color: '#065f46',
    fontSize: '1.5rem',
    fontWeight: 750,
  },
  subtitle: {
    margin: '0.5rem 0 0',
    color: '#4b5563',
    fontSize: '0.9rem',
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    marginTop: '0.5rem',
  },
  error: {
    marginTop: '1rem',
    padding: '0.75rem',
    borderRadius: '8px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: '0.85rem',
  },
  meta: {
    marginTop: '1rem',
    padding: '0.5rem 0',
    borderTop: '1px solid #e5e7eb',
  },
  metaText: {
    fontSize: '0.8rem',
    color: '#6b7280',
  },
};