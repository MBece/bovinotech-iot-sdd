const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class ProductivityNetworkError extends Error {
  constructor(cause) {
    super('No fue posible conectar con el servidor.', { cause });
    this.name = 'ProductivityNetworkError';
  }
}

const request = async (path, token, options = {}) => {
  let response;
  try {
    response = await fetch(`${API_URL}/productivity${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) throw new ProductivityNetworkError(error);
    throw error;
  }
  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const detail = body?.detail;
    const error = new Error(
      detail?.message || detail || `La solicitud fue rechazada (HTTP ${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
};

export const productivityService = {
  createWeighing: (payload, token) =>
    request('/pesajes', token, { method: 'POST', body: JSON.stringify(payload) }),
  createConsumption: (payload, token) =>
    request('/consumos', token, { method: 'POST', body: JSON.stringify(payload) }),
  correctWeighing: (id, payload, token) =>
    request(`/pesajes/${encodeURIComponent(id)}/correcciones`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  correctConsumption: (id, payload, token) =>
    request(`/consumos/${encodeURIComponent(id)}/correcciones`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listWeighings: (loteId, token) =>
    request(`/pesajes?lote_id=${encodeURIComponent(loteId)}`, token),
  listConsumptions: (loteId, token) =>
    request(`/consumos?lote_id=${encodeURIComponent(loteId)}`, token),
  summary: (loteId, start, end, token) =>
    request(
      `/lotes/${encodeURIComponent(loteId)}/gdp?fecha_inicio=${encodeURIComponent(start)}&fecha_fin=${encodeURIComponent(end)}`,
      token,
    ),
  reviewWeighing: (id, payload, token) =>
    request(`/pesajes/${encodeURIComponent(id)}/revision`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
