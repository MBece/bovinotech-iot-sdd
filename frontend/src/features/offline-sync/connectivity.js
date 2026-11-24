// "Connectivity recovered" means the server answers, not just that the
// browser reports a network: rural wifi without internet is common (R10).

export const PROBE_TIMEOUT_MS = 5_000;

export const createConnectivity = ({
  apiUrl,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = PROBE_TIMEOUT_MS,
  navigatorImpl = globalThis.navigator,
}) => ({
  browserOnline: () => navigatorImpl?.onLine !== false,

  async probe() {
    if (navigatorImpl?.onLine === false) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${apiUrl}/health`, { signal: controller.signal, cache: 'no-store' });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  },
});
