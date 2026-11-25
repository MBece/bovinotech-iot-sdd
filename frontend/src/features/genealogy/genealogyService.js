const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000';

export class GenealogyNetworkError extends Error {
  constructor(cause) {
    super('No fue posible conectar con el servidor.', { cause });
    this.name = 'GenealogyNetworkError';
  }
}

const request = async (path, token, options = {}) => {
  let response;
  try {
    response = await fetch(`${API_URL}/genealogy${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) throw new GenealogyNetworkError(error);
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
    const message =
      (typeof detail === 'string' && detail) ||
      detail?.message ||
      (Array.isArray(detail) && 'Los datos enviados no son válidos.') ||
      `La solicitud fue rechazada (HTTP ${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = detail?.code ?? null;
    throw error;
  }
  return response.json();
};

const post = (path, body, token) =>
  request(path, token, { method: 'POST', body: JSON.stringify(body) });

const din = (value) => encodeURIComponent(value);

export const genealogyService = {
  listAnimals: ({ q, sex } = {}, token) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sex) params.set('sex', sex);
    const query = params.toString();
    return request(`/animals${query ? `?${query}` : ''}`, token);
  },
  createAnimal: (body, token) => post('/animals', body, token),
  createLink: (body, token) => post('/links', body, token),
  correctLink: (linkId, body, token) =>
    post(`/links/${encodeURIComponent(linkId)}/corrections`, body, token),
  validateLink: (linkId, body, token) =>
    post(`/links/${encodeURIComponent(linkId)}/validations`, body, token),
  getTree: (value, token) => request(`/animals/${din(value)}/tree`, token),
  getLinks: (value, token) => request(`/animals/${din(value)}/links`, token),
  getInbreeding: (value, token) => request(`/animals/${din(value)}/inbreeding`, token),
  evaluateMating: (sireDin, damDin, token) =>
    request(
      `/matings/evaluation?sire_din=${din(sireDin)}&dam_din=${din(damDin)}`,
      token,
    ),
};

// Dispatches a queued Offline Hub payload to its endpoint.
export const sendQueuedGenealogyPayload = (payload, token) => {
  if (payload.kind === 'ANIMAL') return genealogyService.createAnimal(payload.body, token);
  if (payload.kind === 'LINK') return genealogyService.createLink(payload.body, token);
  if (payload.kind === 'LINK_CORRECTION') {
    return genealogyService.correctLink(payload.linkId, payload.body, token);
  }
  return Promise.reject(Object.assign(new Error('Tipo de registro desconocido.'), { status: 400 }));
};
