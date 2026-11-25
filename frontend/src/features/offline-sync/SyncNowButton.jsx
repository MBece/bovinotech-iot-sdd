import { useAuth } from '../auth/AuthContext';
import { useSyncStatus } from './useSyncStatus.js';

/** "Sincronizar ahora" (FR-002): skips the scheduled wait; 48x48 px minimum (UI-001). */
export function SyncNowButton() {
  const { canCapture } = useAuth();
  const { online, running, syncNow } = useSyncStatus();
  if (!canCapture) return null;

  const disabled = !online || running;
  return (
    <button
      type="button"
      onClick={syncNow}
      disabled={disabled}
      title={online ? undefined : 'Sin conexión: se sincronizará al volver la red'}
      style={{ ...styles.button, ...(disabled ? styles.disabled : null) }}
    >
      {running ? 'Sincronizando…' : 'Sincronizar ahora'}
    </button>
  );
}

const styles = {
  button: {
    minHeight: 48,
    minWidth: 48,
    padding: '10px 16px',
    border: 0,
    borderRadius: 8,
    background: '#0f5137',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  disabled: { background: '#6b7c74', cursor: 'not-allowed' },
};
