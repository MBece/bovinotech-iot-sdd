import { useAuth } from '../auth/AuthContext';
import { countUnconfirmed } from './syncStateLabels.js';
import { useSyncStatus } from './useSyncStatus.js';

/**
 * Connectivity monitor (constitution §2.1, FR-027): Online/Offline as text and
 * icon, events not yet confirmed by the server and an in-flight indicator.
 */
export function SyncStatusBadge() {
  const { user, canCapture } = useAuth();
  const { online, running, events, statusMap } = useSyncStatus();
  if (!canCapture) return null;

  const unconfirmed = countUnconfirmed(events, statusMap, user?.email);

  return (
    <div role="status" aria-live="polite" style={styles.wrapper}>
      <span style={online ? styles.online : styles.offline}>
        {online ? '🟢 Online' : '🔴 Offline (Modo Campo)'}
      </span>
      <span style={styles.counter}>
        {unconfirmed === 0 ? 'Todo sincronizado' : `${unconfirmed} sin sincronizar`}
      </span>
      {running && <span style={styles.running}>Enviando…</span>}
    </div>
  );
}

const pill = { padding: '6px 10px', borderRadius: 999, fontSize: 14, fontWeight: 800 };
const styles = {
  wrapper: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  online: { ...pill, background: '#dcfce7', color: '#14532d' },
  offline: { ...pill, background: '#fee2e2', color: '#7f1d1d' },
  counter: { ...pill, background: '#fff', color: '#10261d', border: '2px solid #10261d' },
  running: { ...pill, background: '#dbeafe', color: '#1e3a8a' },
};
