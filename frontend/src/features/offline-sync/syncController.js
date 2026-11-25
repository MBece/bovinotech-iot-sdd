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
  // Token rejected by 401/403; runs with it are skipped until a new token.
  let pausedToken = null;
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

  const sameSession = (a, b) => a?.token === b?.token && a?.authorEmail === b?.authorEmail;

  const run = async (trigger, { manual = false } = {}) => {
    // Each run keeps the session it started with (QA-02).
    const runSession = session;
    if (!runSession?.token) return null;
    // Paused by 401/403: nothing is sent until a new token arrives (FR-020, QA-06).
    if (pausedToken !== null && runSession.token === pausedToken) return null;
    const online = await connectivity.probe();
    publish({ online });
    if (!online) return null;
    publish({ running: true });
    let summary;
    try {
      const outcome = await lock.run(() =>
        engine.runSync({ session: runSession, trigger, manual, isCurrent: () => sameSession(session, runSession) }),
      );
      if (outcome.skipped) return null;
      summary = outcome.value;
      pausedToken = summary.stop_reason === 'auth_paused' ? runSession.token : null;
      publish({ lastRun: summary });
    } finally {
      publish({ running: false });
      await refresh();
    }
    // Another user signed in mid-run: their own run was skipped by the lock,
    // so it starts now with their session.
    if (summary.stop_reason === 'session_changed' && session?.token && !sameSession(session, runSession)) {
      await run('login');
    }
    return summary;
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
        await run(pausedToken !== null ? 'login' : 'reconnect');
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
      pausedToken = null;
    },
  };
};
