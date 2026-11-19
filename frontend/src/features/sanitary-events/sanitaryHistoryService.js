const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || 'No fue posible consultar el historial sanitario');
  }
  return data;
};

export const sanitaryHistoryService = {
  async getByDin(din, token) {
    const response = await fetch(
      `${API_URL}/sanitary-events/by-din/${encodeURIComponent(din)}/history`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return parseResponse(response);
  },

  async correct(eventId, correction, token) {
    const response = await fetch(`${API_URL}/sanitary-events/${eventId}/corrections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(correction),
    });
    return parseResponse(response);
  },
};
