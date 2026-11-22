import { buildTicketsQuery } from './siniganSyncUtils.js';

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000';
const BASE_PATH = '/integrations/sinigan-sync';

const STATUS_MESSAGES = {
  400: 'La solicitud no es válida. Verifique el DIN e intente nuevamente.',
  401: 'Su sesión expiró o no está autenticado. Inicie sesión nuevamente.',
  403: 'Solo un veterinario puede resolver tickets de conciliación.',
  404: 'No se encontró el recurso solicitado de conciliación SINIGÁN.',
  409: 'El ticket ya fue cerrado o no existe un registro de campo para este DIN.',
  422: 'Los datos enviados no son válidos. Revise la decisión y el motivo.',
};

const extractDetail = (payload) => {
  if (!payload) return null;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    const messages = payload.detail
      .map((item) => (item && typeof item.msg === 'string' ? item.msg : null))
      .filter(Boolean);
    if (messages.length) return messages.join(' ');
  }
  if (typeof payload.message === 'string') return payload.message;
  return null;
};

const parseResponse = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = extractDetail(payload);
    const statusMessage = STATUS_MESSAGES[response.status];
    throw new Error(detail || statusMessage || fallbackMessage);
  }
  return payload;
};

const buildUrl = (path, query = '') => {
  const suffix = query ? `?${query}` : '';
  return `${API_URL}${BASE_PATH}${path}${suffix}`;
};

const authHeaders = (token, extra = {}) => ({
  ...extra,
  Authorization: `Bearer ${token}`,
});

export const siniganSyncService = {
  async compare(din, token) {
    const response = await fetch(buildUrl('/comparisons'), {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ din: din.trim().toUpperCase() }),
    });
    return parseResponse(
      response,
      'No fue posible comparar la ficha oficial con el registro de campo.',
    );
  },

  async listTickets(filters, token) {
    const query = buildTicketsQuery(filters).toString();
    const response = await fetch(buildUrl('/tickets', query), {
      headers: authHeaders(token),
    });
    return parseResponse(response, 'No fue posible consultar los tickets de conciliación.');
  },

  async getTicket(ticketId, token) {
    const response = await fetch(
      buildUrl(`/tickets/${encodeURIComponent(ticketId)}`),
      { headers: authHeaders(token) },
    );
    return parseResponse(response, 'No fue posible consultar el detalle del ticket.');
  },

  async resolveTicket(ticketId, payload, token) {
    const response = await fetch(
      buildUrl(`/tickets/${encodeURIComponent(ticketId)}/resolution`),
      {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          decision: payload.decision,
          reason: payload.reason.trim(),
        }),
      },
    );
    return parseResponse(response, 'No fue posible resolver el ticket de conciliación.');
  },
};
