// Turns a server response into new sync states (research R5). Pure.
//
// | response                         | states                     | outcome      |
// | 200, SINCRONIZADO / DUPLICADO    | synced / duplicate         | ok           |
// | 200, FALLIDO retryable           | failed/transient, backoff  | ok           |
// | 200, FALLIDO not retryable       | failed/final               | ok           |
// | network error / timeout          | failed/transient (batch)   | offline      |
// | 429 / 5xx                        | failed/transient (batch)   | server_error |
// | 401 / 403                        | pending, attempts kept     | auth_paused  |
// | 413 / 422                        | unchanged (engine splits)  | split        |
import { computeRetryDelay } from './retryPolicy.js';
import { FAILURE_KIND, SYNC_STATE } from './syncDbSchema.js';

export const TRANSPORT_MESSAGES = {
  NETWORK: 'Sin conexión con el servidor. Se reintentará.',
  TIMEOUT: 'El servidor tardó demasiado en responder. Se reintentará.',
  SERVER_UNAVAILABLE: 'El servidor no está disponible. Se reintentará.',
  NO_RESULT: 'El servidor no devolvió resultado para este evento. Se reintentará.',
  REQUEST_REJECTED: 'El servidor rechazó el formato del evento. No se reintentará automáticamente.',
};

const baseState = (event, previous, now) => ({
  client_event_id: event.clientEventId,
  author_email: event.authorEmail,
  timestamp_utc: now.toISOString(),
  status: SYNC_STATE.PENDING,
  failure_kind: null,
  error_code: null,
  error_message: null,
  attempts: previous?.attempts ?? 0,
  next_attempt_at: null,
  confirmed_at: null,
  server_received_at: null,
  requires_timestamp_review: false,
});

export const syncingStates = (events, statusMap, now) =>
  events.map((event) => ({
    ...baseState(event, statusMap.get(event.clientEventId), now),
    ...statusMap.get(event.clientEventId),
    status: SYNC_STATE.SYNCING,
    timestamp_utc: now.toISOString(),
  }));

const confirmed = (event, previous, result, now, status) => ({
  ...baseState(event, previous, now),
  status,
  attempts: 0,
  confirmed_at: now.toISOString(),
  server_received_at: result.receivedAt ?? null,
  requires_timestamp_review: Boolean(result.requiresTimestampReview),
});

export const transientFailure = (event, previous, now, random, code, message) => {
  const attempts = (previous?.attempts ?? 0) + 1;
  return {
    ...baseState(event, previous, now),
    status: SYNC_STATE.FAILED,
    failure_kind: FAILURE_KIND.TRANSIENT,
    error_code: code,
    error_message: message,
    attempts,
    next_attempt_at: new Date(now.getTime() + computeRetryDelay(attempts, random)).toISOString(),
  };
};

export const finalFailure = (event, previous, now, code, message) => ({
  ...baseState(event, previous, now),
  status: SYNC_STATE.FAILED,
  failure_kind: FAILURE_KIND.FINAL,
  error_code: code,
  error_message: message,
});

const wholeBatch = (events, statusMap, now, make) =>
  events.map((event) => make(event, statusMap.get(event.clientEventId), now));

/** Returns `{ states, outcome }` for `events` sent in this order. */
export const applyBatchResult = (events, statusMap, response, now, random = Math.random) => {
  if (response?.transportError) {
    const code = response.transportError;
    return {
      outcome: 'offline',
      states: wholeBatch(events, statusMap, now, (event, previous) =>
        transientFailure(event, previous, now, random, code, TRANSPORT_MESSAGES[code] ?? TRANSPORT_MESSAGES.NETWORK),
      ),
    };
  }

  if (!response?.ok) {
    const status = response?.status;
    if (status === 401 || status === 403) {
      return { outcome: 'auth_paused', states: wholeBatch(events, statusMap, now, baseState) };
    }
    if (status === 413 || status === 422) {
      return { outcome: 'split', states: wholeBatch(events, statusMap, now, baseState) };
    }
    return {
      outcome: 'server_error',
      states: wholeBatch(events, statusMap, now, (event, previous) =>
        transientFailure(event, previous, now, random, 'SERVER_UNAVAILABLE', TRANSPORT_MESSAGES.SERVER_UNAVAILABLE),
      ),
    };
  }

  const results = response.body?.results ?? [];
  const states = events.map((event, index) => {
    const previous = statusMap.get(event.clientEventId);
    const result = results.find((item) => item.index === index);
    if (result?.status === 'SINCRONIZADO') return confirmed(event, previous, result, now, SYNC_STATE.SYNCED);
    if (result?.status === 'DUPLICADO') return confirmed(event, previous, result, now, SYNC_STATE.DUPLICATE);
    if (result?.status === 'FALLIDO' && result.retryable === false) {
      return finalFailure(event, previous, now, result.errorCode, result.detail);
    }
    if (result?.status === 'FALLIDO') {
      return transientFailure(event, previous, now, random, result.errorCode, result.detail);
    }
    return transientFailure(event, previous, now, random, 'NO_RESULT', TRANSPORT_MESSAGES.NO_RESULT);
  });
  return { states, outcome: 'ok' };
};

/** On start, anything left in flight returns to pending (FR-005). */
export const recoverInterrupted = (states) =>
  states
    .filter((state) => state.status === SYNC_STATE.SYNCING)
    .map((state) => ({ ...state, status: SYNC_STATE.PENDING }));
