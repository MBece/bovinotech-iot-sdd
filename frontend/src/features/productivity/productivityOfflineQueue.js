export const PRODUCTIVITY_QUEUE_KEY = 'bovinotech_offline_productivity_queue';

const readQueue = (storage) => {
  const stored = storage.getItem(PRODUCTIVITY_QUEUE_KEY);
  if (stored === null) return [];
  const value = JSON.parse(stored);
  if (!Array.isArray(value)) {
    throw new Error('La cola local de productividad tiene un formato inválido.');
  }
  return value;
};

const saveQueue = (storage, items) => {
  storage.setItem(PRODUCTIVITY_QUEUE_KEY, JSON.stringify(items));
};

export const createProductivityOfflineQueue = ({
  storage = globalThis.localStorage,
  now = () => new Date(),
  createId = () => globalThis.crypto.randomUUID(),
} = {}) => ({
  list() {
    return readQueue(storage);
  },

  enqueue(payload, clientEventId = createId()) {
    const items = readQueue(storage);
    const existing = items.find((item) => item.client_event_id === clientEventId);
    if (existing) return existing;
    const event = {
      client_event_id: clientEventId,
      timestamp_utc: now().toISOString(),
      status: 'pending',
      payload,
    };
    saveQueue(storage, [...items, event]);
    return event;
  },

  async synchronize(send) {
    const items = readQueue(storage);
    saveQueue(storage, items.map((event) => ({ ...event, status: 'syncing' })));
    const remaining = [];
    for (const event of items) {
      const syncing = { ...event, status: 'syncing' };
      try {
        await send(syncing.payload);
      } catch {
        remaining.push({ ...event, status: 'failed' });
        continue;
      }
    }
    saveQueue(storage, remaining);
    return remaining;
  },
});
