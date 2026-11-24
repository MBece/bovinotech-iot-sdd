import { describeSyncState } from './syncStateLabels.js';

/** Why a sync failed and whether it will be retried (FR-028). */
export function FailedEventDetail({ state }) {
  const described = describeSyncState(state);
  if (described.status !== 'failed' && !described.reviewLabel) return null;

  return (
    <div role="note" style={described.status === 'failed' ? styles.failed : styles.review}>
      {described.status === 'failed' && (
        <>
          <strong>Sincronización fallida.</strong> {described.reason ?? 'Motivo no disponible.'}
          <br />
          {described.retryLabel}
          {described.nextAttemptLabel && <> · próximo intento hacia {described.nextAttemptLabel}</>}
        </>
      )}
      {described.reviewLabel && <div>{described.reviewLabel}</div>}
    </div>
  );
}

const box = { marginTop: 8, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 600 };
const styles = {
  failed: { ...box, background: '#fee2e2', color: '#7f1d1d' },
  review: { ...box, background: '#fff4cc', color: '#5c4100' },
};
