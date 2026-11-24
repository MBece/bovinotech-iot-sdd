// Pure view model of the pending tray (FR-011). Read-only by design: items
// carry no edit or delete action (FR-016).
import {
  AUTHOR_VERIFICATION_LABEL,
  eventTypeLabel,
  ORIGIN,
  SYNC_STATUS_LABELS,
  VALIDATION_STATUS_LABELS,
} from './eventTypes.js';

export const LEGACY_LABEL = 'Capturado con la versión anterior';

export const createTimeFormatter = (timeZone) =>
  new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });

export const buildPendingTray = (events, { authorEmail, farmId, timeZone } = {}) => {
  const formatter = createTimeFormatter(timeZone);
  return events
    .filter((event) => event.authorEmail === authorEmail && event.farmId === farmId)
    .map((event) => ({ event, time: Date.parse(event.fieldOccurredAt) }))
    .sort((a, b) => b.time - a.time)
    .map(({ event, time }) => ({
      clientEventId: event.clientEventId,
      animalLabel: event.animalName ? `${event.din} · ${event.animalName}` : event.din,
      typeLabel: eventTypeLabel(event.eventType),
      capturedAtLabel: formatter.format(time),
      syncLabel: SYNC_STATUS_LABELS[event.syncStatus] ?? event.syncStatus,
      validationLabel: VALIDATION_STATUS_LABELS[event.validationStatus] ?? event.validationStatus,
      authorLabel: event.authorVerificationPending ? AUTHOR_VERIFICATION_LABEL : null,
      legacyLabel: event.origin === ORIGIN.LEGACY ? LEGACY_LABEL : null,
    }));
};
