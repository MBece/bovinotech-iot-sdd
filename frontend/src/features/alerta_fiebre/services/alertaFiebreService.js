const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const alertaFiebreService = {
  async sendTelemetry(telemetry) {
    const response = await fetch(`${API_URL}/api/v1/alerta-fiebre/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetry),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al enviar telemetría');
    }
    return await response.json();
  },

  async getAlerts(token) {
    const response = await fetch(`${API_URL}/api/v1/alerta-fiebre/alerts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al obtener alertas de fiebre');
    }
    return await response.json();
  },

  async attendAlert(alertId, attentionData, token) {
    const response = await fetch(`${API_URL}/api/v1/alerta-fiebre/alerts/${alertId}/attend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(attentionData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al registrar atención veterinaria');
    }
    return await response.json();
  },
};

export default alertaFiebreService;
