// Builds the immutable captured event from the form (data-model.md `events`).
// The timestamp is always the device instant when saving (FR-006): any time
// present in the form is ignored.
import { fieldsForType, ORIGIN, SYNC_STATUS, VALIDATION_STATUS } from './eventTypes.js';
import { normalizeDin } from './eventValidation.js';

const cleanText = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

const cleanNumber = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isNaN(number) ? null : number;
};

export const buildCapturedEvent = ({
  form,
  session,
  animal = null,
  now = () => new Date(),
  uuid = () => globalThis.crypto.randomUUID(),
}) => {
  const savedAt = now().toISOString();
  const fields = fieldsForType(form.eventType);
  const keep = (name, value) => (fields.includes(name) ? value : null);

  return {
    clientEventId: uuid(),
    eventType: form.eventType,
    din: normalizeDin(form.din),
    animalName: animal?.name ?? null,
    fieldOccurredAt: savedAt,
    product: keep('product', cleanText(form.product)),
    doseQuantity: keep('doseQuantity', cleanNumber(form.doseQuantity)),
    doseUnit: keep('doseUnit', cleanText(form.doseUnit)),
    reason: keep('reason', cleanText(form.reason)),
    finding: keep('finding', cleanText(form.finding)),
    notes: cleanText(form.notes),
    authorEmail: session.authorEmail,
    farmId: session.farmId,
    authorVerificationPending: Boolean(session.authorVerificationPending),
    syncStatus: SYNC_STATUS.PENDING,
    validationStatus: VALIDATION_STATUS.PENDING,
    savedAt,
    origin: ORIGIN.OFFLINE_CAPTURE,
  };
};
