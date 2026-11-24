// Device-wide sync controller: triggers (reconnect, 30 s timer, manual,
// login), single run lock and an observable snapshot for the UI.
// Framework-free so React only subscribes to it (useSyncExternalStore).

export const TIMER_MS = 30_000;

export const createSyncController = ({
  engine,
  connectivity,
  lock,
  captureRepository,
  stateRepository,
  timerMs = TIMER_MS,
  windowImpl = globalThis.window,
}) => {
  let session = null;
  let timer = null;
  let started = false;
  let authPaused = false;
  let snapshot = { online: connectivity.browserOnline(), running: false, lastRun: null, events: [], statusMap: new Map() };
  const listeners = new Set();

  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  const refresh = async () => {
    try {
      const [events, statusMap] = await Promise.all([captureRepository.getAll(), stateRepository.getStatusMap()]);
      publish({ events, statusMap });
    } catch {
      // Storage unavailable: keep the previous snapshot.
    }
  };

  const run = async (trigger, { manual = false } = {}) => {
    if (!session?.token) return null;
    const online = await connectivity.probe();
    publish({ online });
    if (!online) return null;
    publish({ running: true });
    try {
      const outcome = await lock.run(() => engine.runSync({ session, trigger, manual }));
      if (outcome.skipped) return null;
      authPaused = outcome.value.stop_reason === 'auth_paused';
      publish({ lastRun: outcome.value });
      return outcome.value;
    } finally {
      publish({ running: false });
      await refresh();
    }
  };

  const onOnline = () => run('reconnect');
  const onOffline = () => publish({ online: false });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,

    /** Called whenever the signed-in user changes; null stops syncing. */
    async setSession(next) {
      const previousToken = session?.token;
      session = next;
      if (!next) return;
      if (!started) {
        started = true;
        await engine.recoverInterrupted();
        windowImpl?.addEventListener?.('online', onOnline);
        windowImpl?.addEventListener?.('offline', onOffline);
        timer = setInterval(() => run('timer'), timerMs);
        await refresh();
        await run('reconnect');
      } else if (next.token !== previousToken) {
        // New login: resume a sync paused by 401/403 (FR-020).
        await run(authPaused ? 'login' : 'reconnect');
      }
    },

    syncNow: () => run('manual', { manual: true }),
    refresh,

    stop() {
      clearInterval(timer);
      windowImpl?.removeEventListener?.('online', onOnline);
      windowImpl?.removeEventListener?.('offline', onOffline);
      started = false;
      session = null;
    },
  };
};
