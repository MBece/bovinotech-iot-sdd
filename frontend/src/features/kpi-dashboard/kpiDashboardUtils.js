export const KPI_ROLES_WITH_FINANCE = ['VETERINARIO', 'DIRECTIVO'];
export const KPI_EXPORT_ROLES = ['VETERINARIO', 'DIRECTIVO'];

export function canViewFinancials(role) {
  return KPI_ROLES_WITH_FINANCE.includes(role);
}

export function canExportAudit(role) {
  return KPI_EXPORT_ROLES.includes(role);
}

export function formatPercentage(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(1)}%`;
}

export function formatNumber(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('es-CO');
}

export function formatGdp(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(2)} kg/día`;
}

export function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

export function buildDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}