// Pure view model of an event detail (FR-012). Each state is plain text, so
// it never depends only on color.
import {
  AUTHOR_VERIFICATION_LABEL,
  eventTypeLabel,
  FIELD_LABELS,
  fieldsForType,
  SYNC_STATUS_LABELS,
  VALIDATION_STATUS_LABELS,
} from './eventTypes.js';
import { createTimeFormatter, LEGACY_LABEL } from './pendingTrayModel.js';

const DISPLAY_FIELDS = ['product', 'doseQuantity', 'reason', 'finding'];

const fieldValue = (event, name) => {
  if (name === 'doseQuantity') {
    if (event.doseQuantity == null) return null;
    return [event.doseQuantity, event.doseUnit].filter((part) => part != null).join(' ');
  }
  return event[name];
};

export const buildEventDetail = (event, { timeZone, syncLabelOf } = {}) => {
  const typeFields = fieldsForType(event.eventType);
  const fields = DISPLAY_FIELDS.filter((name) => typeFields.includes(name))
    .map((name) => ({ label: FIELD_LABELS[name], value: fieldValue(event, name) }))
    .filter((field) => field.value != null && field.value !== '');
  if (event.notes) fields.push({ label: FIELD_LABELS.notes, value: event.notes });

  const states = [
    {
      kind: 'sync',
      title: 'Sincronización',
      // HU-03 provides the real sync state through syncLabelOf.
      label: syncLabelOf?.(event) ?? SYNC_STATUS_LABELS[event.syncStatus] ?? event.syncStatus,
    },
    {
      kind: 'validation',
      title: 'Validación',
      label: VALIDATION_STATUS_LABELS[event.validationStatus] ?? event.validationStatus,
    },
  ];
  if (event.authorVerificationPending) {
    states.push({ kind: 'author', title: 'Autor', label: AUTHOR_VERIFICATION_LABEL });
  }

  return {
    clientEventId: event.clientEventId,
    typeLabel: eventTypeLabel(event.eventType),
    animalLabel: event.animalName ? `${event.din} · ${event.animalName}` : event.din,
    capturedAtLabel: createTimeFormatter(timeZone).format(Date.parse(event.fieldOccurredAt)),
    legacyLabel: event.origin === 'LEGACY' ? LEGACY_LABEL : null,
    states,
    fields,
  };
};
