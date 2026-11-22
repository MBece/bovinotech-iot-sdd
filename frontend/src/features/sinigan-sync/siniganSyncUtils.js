export const SIMULATION_LABEL = 'MODO SIMULADO (SINIGÁN V6 MOCK)';

export const FIELD_LABELS = Object.freeze({
  species: 'Especie',
  sex: 'Sexo',
  age_group: 'Grupo etario',
  sit_code: 'Predio',
});

export const STATUS_LABELS = Object.freeze({
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
});

export const DECISION_LABELS = Object.freeze({
  OFICIAL_PREVALECE: 'Prevalece la ficha oficial',
  CAMPO_PREVALECE: 'Prevalece el registro de campo',
});

export const SOURCE_LABELS = Object.freeze({
  REGISTRO_DE_CAMPO: 'REGISTRO DE CAMPO',
});

export function formatSourceLabel(source) {
  if (source === undefined || source === null || source === '') {
    return source;
  }
  return SOURCE_LABELS[source] || source;
}

export function canResolveTicket(role, ticket) {
  return role === 'VETERINARIO' && ticket?.status === 'OPEN';
}

export function buildTicketsQuery(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.din) {
    params.set('din', filters.din);
  }
  if (filters.limit !== undefined && filters.limit !== null && filters.limit !== '') {
    params.set('limit', String(filters.limit));
  }
  return params;
}

/**
 * Etiqueta visible de la finca activa (D10). Sin finca se muestra un guion
 * para dejar explícito que el backend responderá 403.
 */
export function formatActiveFarm(farmId) {
  if (farmId === undefined || farmId === null || farmId === '') {
    return '—';
  }
  return String(farmId);
}

/**
 * Clave de recarga de tickets. Incluye el token y la finca activa porque la
 * frontera de tenant vive en el JWT (D10): al cambiar cualquiera de los dos
 * debe volver a consultarse el listado, aunque los filtros no cambien.
 */
export function buildTicketsLoadKey({ token, farmId, filters } = {}) {
  return JSON.stringify([
    token ?? null,
    farmId ?? null,
    String(buildTicketsQuery(filters || {})),
  ]);
}
