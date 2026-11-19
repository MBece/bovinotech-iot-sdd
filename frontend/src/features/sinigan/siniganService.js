const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || 'No fue posible consultar la referencia SINIGAN');
  }
  return data;
};

export const siniganService = {
  async getStatus(token) {
    const response = await fetch(`${API_URL}/integrations/sinigan/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseResponse(response);
  },

  async findAnimalByDin(din, token) {
    const response = await fetch(
      `${API_URL}/integrations/sinigan/animals/${encodeURIComponent(din.trim())}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return parseResponse(response);
  },
};
