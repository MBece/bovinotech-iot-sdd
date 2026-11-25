const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000';
const BASE_PATH = '/dashboard';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const parseResponse = async (response, fallback) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (typeof payload.detail === 'string') ? payload.detail : fallback;
    throw new Error(detail || fallback);
  }
  return payload;
};

export const kpiDashboardService = {
  async getKpi(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.farmId) params.set('farm_id', filters.farmId);
    if (filters.startDate) params.set('start_date', filters.startDate);
    if (filters.endDate) params.set('end_date', filters.endDate);
    const qs = params.toString();
    const url = `${API_URL}${BASE_PATH}/kpi${qs ? '?' + qs : ''}`;
    const response = await fetch(url, { headers: authHeaders(token) });
    return parseResponse(response, 'No fue posible obtener los indicadores.');
  },

  async getAuditExport(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.farmId) params.set('farm_id', filters.farmId);
    if (filters.startDate) params.set('start_date', filters.startDate);
    if (filters.endDate) params.set('end_date', filters.endDate);
    const qs = params.toString();
    const url = `${API_URL}${BASE_PATH}/audit-export${qs ? '?' + qs : ''}`;
    const response = await fetch(url, { headers: authHeaders(token) });
    return parseResponse(response, 'No fue posible exportar el reporte de auditoría.');
  },
};