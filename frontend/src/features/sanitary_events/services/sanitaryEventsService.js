const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const QUEUE_KEY = 'bovinotech_offline_sanitary_events_queue';

const farmIdFromToken = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).farm_id ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : data.detail?.message;
    throw new Error(detail || 'No fue posible completar la operación sanitaria.');
  }
  return data;
};

const readQueue = () => {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    throw new Error('No fue posible guardar la corrección para sincronizarla después.');
  }
};

const historyCacheKey = (din, token) =>
  `bovinotech_sanitary_events_history_${farmIdFromToken(token)}_${din}`;

const isNetworkError = (error) => error instanceof TypeError;

const requestCorrection = async (eventId, correction, token) => {
  const response = await fetch(`${API_URL}/sanitary-events/${eventId}/correct`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(correction),
  });
  return parseResponse(response);
};

export const sanitaryEventsService = {
  async getByDin(din, token) {
    const cacheKey = historyCacheKey(din, token);
    try {
      const response = await fetch(
        `${API_URL}/sanitary-events/animals/${encodeURIComponent(din)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await parseResponse(response);
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return { ...data, stale: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const cached = localStorage.getItem(cacheKey);
      if (!cached) {
        throw new Error(
          'Sin conexión y no hay un historial local disponible.',
          { cause: error },
        );
      }
      return { ...JSON.parse(cached), stale: true };
    }
  },

  async correct(eventId, correction, token) {
    try {
      const event = await requestCorrection(eventId, correction, token);
      return { event, queued: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const queue = readQueue();
      const existing = queue.find(
        (entry) => entry.client_event_id === correction.clientEventId,
      );
      if (!existing) {
        queue.push({
          client_event_id: correction.clientEventId,
          timestamp_utc: new Date().toISOString(),
          status: 'pending',
          payload: { event_id: eventId, request: correction },
        });
        writeQueue(queue);
      }
      return { event: null, queued: true };
    }
  },

  async syncPendingCorrections(token) {
    const queue = readQueue();
    const remaining = [];
    for (const entry of queue) {
      try {
        await requestCorrection(entry.payload.event_id, entry.payload.request, token);
      } catch {
        remaining.push({ ...entry, status: 'failed' });
      }
    }
    writeQueue(remaining);
    return queue.length - remaining.length;
  },
};

export { QUEUE_KEY };
