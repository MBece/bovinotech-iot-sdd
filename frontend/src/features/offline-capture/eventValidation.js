// Pure validator of captured events (FR-007, FR-008, FR-015; research R5).
// Same rules and codes as the backend CapturedEvent schema, driven by the
// shared file contracts/captured-event.cases.json.
import {
  DOSE_UNITS,
  EVENT_TYPE_CODES,
  NOTES_MAX_LENGTH,
  ORIGIN,
  PRODUCT_TYPES,
} from './eventTypes.js';

export const ERROR_MESSAGES = {
  ANIMAL_NOT_IN_CATALOG: 'El animal no existe en el catálogo de esta finca.',
  FUTURE_TIMESTAMP: 'La fecha del evento no puede ser futura.',
  INVALID_EVENT_TYPE: 'Tipo de evento no válido.',
  PRODUCT_REQUIRED: 'Indique el producto aplicado.',
  DOSE_REQUIRED: 'Indique la dosis.',
  DOSE_NOT_POSITIVE: 'La dosis debe ser mayor que cero.',
  DOSE_UNIT_REQUIRED: 'Elija la unidad de la dosis.',
  REASON_REQUIRED: 'Indique el motivo del tratamiento.',
  FINDING_REQUIRED: 'Indique el hallazgo u observación.',
  NOTES_TOO_LONG: `Las observaciones no pueden superar ${NOTES_MAX_LENGTH} caracteres.`,
  STORAGE_WRITE_FAILED:
    'No se pudo guardar el evento en el dispositivo. Libere espacio e intente de nuevo.',
};

/** Form field each error belongs to, to show it next to that field. */
export const ERROR_FIELDS = {
  ANIMAL_NOT_IN_CATALOG: 'din',
  INVALID_EVENT_TYPE: 'eventType',
  PRODUCT_REQUIRED: 'product',
  DOSE_REQUIRED: 'doseQuantity',
  DOSE_NOT_POSITIVE: 'doseQuantity',
  DOSE_UNIT_REQUIRED: 'doseUnit',
  REASON_REQUIRED: 'reason',
  FINDING_REQUIRED: 'finding',
  NOTES_TOO_LONG: 'notes',
};

export const normalizeDin = (din) => String(din ?? '').trim().toUpperCase();

const isBlank = (value) => value == null || String(value).trim() === '';

/**
 * Returns the error codes of an event, in contract order (empty when valid).
 * `catalog` is anything with `has(din)` (a Set of normalized DINs works).
 * The device clock is strict: no tolerance (contracts/captured-event.md).
 */
export const validateCapturedEvent = (event, { now = new Date(), catalog } = {}) => {
  const codes = [];
  if (catalog && !catalog.has(normalizeDin(event.din))) codes.push('ANIMAL_NOT_IN_CATALOG');

  const occurredAt = Date.parse(event.fieldOccurredAt);
  if (Number.isNaN(occurredAt) || occurredAt > now.getTime()) codes.push('FUTURE_TIMESTAMP');

  const validType = EVENT_TYPE_CODES.includes(event.eventType);
  if (!validType) codes.push('INVALID_EVENT_TYPE');

  if (validType) {
    // Legacy events keep what the preliminary capture stored (FR-019): only
    // the required-field rules are skipped; dose and unit are still checked
    // when present, as the server does (HU-03 QA-01).
    const legacy = event.origin === ORIGIN.LEGACY;
    const hasDose = event.doseQuantity != null && event.doseQuantity !== '';
    if (!legacy && PRODUCT_TYPES.includes(event.eventType)) {
      if (isBlank(event.product)) codes.push('PRODUCT_REQUIRED');
      if (!hasDose) codes.push('DOSE_REQUIRED');
    }
    if (hasDose) {
      const quantity = Number(event.doseQuantity);
      // NaN and Infinity are rejected too (HU-03 QA-11): the server treats
      // them as INVALID_FIELD, so the device must never queue them.
      if (!Number.isFinite(quantity) || quantity <= 0) codes.push('DOSE_NOT_POSITIVE');
      const unitToleratedMissing = legacy && event.doseUnit == null;
      if (!DOSE_UNITS.includes(event.doseUnit) && !unitToleratedMissing) codes.push('DOSE_UNIT_REQUIRED');
    }
    if (!legacy && event.eventType === 'TREATMENT' && isBlank(event.reason)) codes.push('REASON_REQUIRED');
    if (!legacy && event.eventType === 'CHECKUP' && isBlank(event.finding)) codes.push('FINDING_REQUIRED');
  }

  if (event.notes != null && String(event.notes).length > NOTES_MAX_LENGTH) {
    codes.push('NOTES_TOO_LONG');
  }
  return codes;
};
