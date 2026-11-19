const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const syncService = {
  async syncEvents(events, token) {
    const items = events.map((event) => ({
      clientEventId: event.clientEventId,
      din: event.din,
      eventType: event.eventType,
      fieldOccurredAt: event.fieldOccurredAt,
      dose: event.dose,
      notes: event.notes,
    }));
    const response = await fetch(`${API_URL}/sync/batches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'No fue posible sincronizar');
    return data.results;
  },
};
