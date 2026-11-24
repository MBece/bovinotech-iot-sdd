// Downloads the active farm catalog when there is connection (research R7).
// On any failure the previous local copy is kept untouched.

export const createCatalogService = ({
  repository,
  apiUrl,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => new Date(),
}) => ({
  async refresh(token, farmId) {
    try {
      const response = await fetchImpl(`${apiUrl}/offline-capture/catalog`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { updated: false, status: response.status };
      const body = await response.json();
      // The server answers for the token farm; never store it under another farm.
      if (body.farmId !== farmId || !Array.isArray(body.animals)) return { updated: false };
      await repository.replaceFarm(farmId, body.animals, now().toISOString());
      return { updated: true, count: body.animals.length };
    } catch {
      return { updated: false, offline: true };
    }
  },
});
