// Domain constants mirrored from backend/app/features/genealogy/pedigree.py (data-model.md).
export const GENERATION_WINDOW = 3;

export const CALCULATION_COMPLETE = 'CÁLCULO_COMPLETO';
export const CALCULATION_PARTIAL = 'CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES';

export const LINK_STATUS = Object.freeze({
  VALIDATED: 'VALIDADO',
  PENDING: 'PENDIENTE_VALIDACION',
  NOT_REGISTERED: 'NO_REGISTRADO',
  CORRECTED: 'CORREGIDO',
  REJECTED: 'RECHAZADO',
});

export const RISK_HIGH_MIN = 0.125;
export const RISK_MODERATE_MIN = 0.0625;

export const GENEALOGY_QUEUE_KEY = 'bovinotech_offline_genealogy_queue';
export const GENEALOGY_REJECTED_KEY = 'bovinotech_offline_genealogy_rejected';

export const ANIMAL_WRITE_ROLES = ['VETERINARIO'];
export const LINK_CAPTURE_ROLES = ['OPERARIO', 'VETERINARIO'];
export const LINK_CURATION_ROLES = ['VETERINARIO'];
export const ASSESSMENT_ROLES = ['VETERINARIO', 'ADMINISTRADOR', 'DIRECTIVO'];
