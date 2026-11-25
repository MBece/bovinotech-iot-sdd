// Spanish texts of the sync state (UI-003, FR-027, FR-028). Pure.
import { FAILURE_KIND, FINAL_STATES, SYNC_STATE } from './syncDbSchema.js';

export const SYNC_STATE_LABELS = {
  [SYNC_STATE.PENDING]: 'Pendiente de sincronización',
  [SYNC_STATE.SYNCING]: 'Enviando',
  [SYNC_STATE.SYNCED]: 'Sincronizado',
  [SYNC_STATE.DUPLICATE]: 'Duplicado (ya estaba en el servidor)',
  [SYNC_STATE.FAILED]: 'Fallido',
};

const timeFormatter = (timeZone) =>
  new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });

/** `{ status, label, reason, retryLabel, nextAttemptLabel, reviewLabel }`. */
export const describeSyncState = (state, { timeZone } = {}) => {
  const status = state?.status ?? SYNC_STATE.PENDING;
  const failed = status === SYNC_STATE.FAILED;
  const transient = failed && state.failure_kind !== FAILURE_KIND.FINAL;
  let retryLabel = null;
  if (failed) retryLabel = transient ? 'Se reintentará automáticamente' : 'No se reintentará automáticamente';

  return {
    status,
    label: SYNC_STATE_LABELS[status] ?? status,
    reason: failed ? state.error_message ?? null : null,
    retryLabel,
    nextAttemptLabel:
      transient && state.next_attempt_at
        ? timeFormatter(timeZone).format(Date.parse(state.next_attempt_at))
        : null,
    reviewLabel: state?.requires_timestamp_review ? 'Hora pendiente de revisión' : null,
  };
};

/** Events of the author not yet confirmed by the server (badge counter). */
export const countUnconfirmed = (events, statusMap, authorEmail) =>
  events.filter(
    (event) =>
      event.authorEmail === authorEmail &&
      !FINAL_STATES.includes(statusMap.get(event.clientEventId)?.status),
  ).length;
