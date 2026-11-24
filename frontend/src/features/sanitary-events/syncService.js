const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const STATUS_ALIASES = {
  CREADO: 'SINCRONIZADO',
  RECHAZADO: 'FALLIDO',
};

const buildItem = (event) => ({
  clientEventId: event.clientEventId,
  din: event.din,
  eventType: event.eventType,
  fieldOccurredAt: event.fieldOccurredAt,
  product: event.product,
  dose: event.dose,
  doseUnit: event.doseUnit,
  reason: event.reason,
  finding: event.finding,
  notes: event.notes,
});

const formatApiDetail = (detail, fallback = 'No fue posible sincronizar') => {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item?.type === 'literal_error' || item?.msg?.startsWith('Input should be')) {
          return 'El tipo de evento no es compatible con la versión del servidor';
        }
        return item?.msg || item?.message;
      })
      .filter(Boolean);
    if (messages.length) return [...new Set(messages)].join('. ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.detail || fallback;
  }
  return fallback;
};

const syncOneEvent = async (event, token, options) => {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || wait;
  const maxAttempts = options.maxAttempts || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${API_URL}/sync/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: [buildItem(event)] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = formatApiDetail(data.detail);
        if (response.status === 422) {
          return {
            clientEventId: event.clientEventId,
            status: 'FALLIDO',
            detail: `El evento local requiere revisión: ${detail}`,
          };
        }
        const error = new Error(detail);
        error.retryable = response.status >= 500 || response.status === 429;
        throw error;
      }
      const result = data.results?.[0];
      return result ? {
        ...result,
        status: STATUS_ALIASES[result.status] || result.status,
      } : {
        clientEventId: event.clientEventId,
        status: 'FALLIDO',
        detail: 'La API no devolvió el resultado del evento.',
      };
    } catch (error) {
      lastError = error;
      const retryable = error.retryable !== false;
      if (!retryable || attempt === maxAttempts) break;
      const exponential = 250 * (2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 100);
      await sleep(exponential + jitter);
    }
  }
  throw lastError || new Error('No fue posible sincronizar');
};

export const syncService = {
  async syncEvents(events, token, options = {}) {
    const results = [];
    for (const event of events) {
      results.push(await syncOneEvent(event, token, options));
    }
    return results;
  },
};
