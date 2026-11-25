// POST /offline-sync/batches with a 30 s timeout (research R5, R11).
// Never throws: network problems come back as `transportError`.
// The token comes with every call: the engine passes the one of the session
// that started the run. It is never read from shared state (QA-02).

export const REQUEST_TIMEOUT_MS = 30_000;

export const createSyncTransport = ({
  apiUrl,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = REQUEST_TIMEOUT_MS,
}) => ({
  async send(items, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${apiUrl}/offline-sync/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
