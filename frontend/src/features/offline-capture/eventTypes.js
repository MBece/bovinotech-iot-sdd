// Event types, dose units and states of HU-02 (data-model.md, research R4).
// Codes stay in English; labels are the Spanish UI texts.

export const EVENT_TYPES = [
  { code: 'VACCINATION', label: 'Vacunación', fields: ['product', 'dose'] },
  { code: 'DEWORMING', label: 'Desparasitación', fields: ['product', 'dose'] },
  { code: 'TREATMENT', label: 'Tratamiento', fields: ['product', 'dose', 'reason'] },
  { code: 'CHECKUP', label: 'Chequeo clínico', fields: ['finding'] },
];

export const EVENT_TYPE_CODES = EVENT_TYPES.map((type) => type.code);

export const PRODUCT_TYPES = ['VACCINATION', 'DEWORMING', 'TREATMENT'];

export const DOSE_UNITS = ['ml', 'mg', 'g', 'unidades'];

export const NOTES_MAX_LENGTH = 500;

export const SYNC_STATUS = {
  PENDING: 'PENDIENTE_SINCRONIZACION',
};

export const VALIDATION_STATUS = {
  PENDING: 'PENDIENTE_VALIDACION',
};

export const ORIGIN = {
  OFFLINE_CAPTURE: 'OFFLINE_CAPTURE',
  LEGACY: 'LEGACY',
};

export const SYNC_STATUS_LABELS = {
  PENDIENTE_SINCRONIZACION: 'Pendiente de sincronización',
};

export const VALIDATION_STATUS_LABELS = {
  PENDIENTE_VALIDACION: 'Pendiente de validación veterinaria',
};

export const AUTHOR_VERIFICATION_LABEL = 'Pendiente de verificación de autor';

export const FIELD_LABELS = {
  product: 'Producto',
  doseQuantity: 'Dosis',
  doseUnit: 'Unidad',
  reason: 'Motivo',
  finding: 'Hallazgo u observación',
  notes: 'Observaciones',
};

export const eventTypeLabel = (code) =>
  EVENT_TYPES.find((type) => type.code === code)?.label ?? code;

/** Fields shown for a type, in display order. */
export const fieldsForType = (code) => {
  const type = EVENT_TYPES.find((item) => item.code === code);
  if (!type) return [];
  const fields = [];
  if (type.fields.includes('product')) fields.push('product');
  if (type.fields.includes('dose')) fields.push('doseQuantity', 'doseUnit');
  if (type.fields.includes('reason')) fields.push('reason');
  if (type.fields.includes('finding')) fields.push('finding');
  return fields;
};
