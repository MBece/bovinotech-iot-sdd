const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const request = async (path, token, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'object' ? detail.message : detail || 'No se pudo completar la operación');
  }
  return data;
};

export const alertService = {
  list(token, filters = {}) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
    const suffix = query.toString() ? `?${query}` : '';
    return request(`/telemetry/alerts${suffix}`, token);
  },
  get(token, id) {
    return request(`/telemetry/alerts/${id}`, token);
  },
  close(token, id, observation) {
    return request(`/telemetry/alerts/${id}/close`, token, {
      method: 'POST',
      body: JSON.stringify({ observation }),
    });
  },
};

