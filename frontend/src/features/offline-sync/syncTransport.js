// POST /offline-sync/batches with a 30 s timeout (research R5, R11).
// Never throws: network problems come back as `transportError`.

export const REQUEST_TIMEOUT_MS = 30_000;

export const createSyncTransport = ({
  apiUrl,
  getToken,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = REQUEST_TIMEOUT_MS,
}) => ({
  async send(items) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${apiUrl}/offline-sync/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return { transportError: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
    } finally {
      clearTimeout(timer);
    }
  },
});
