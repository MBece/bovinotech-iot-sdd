import { CALCULATION_PARTIAL, GENERATION_WINDOW } from './genealogyConstants.js';

const STATUS_LABELS = {
  VALIDADO: 'Validado',
  PENDIENTE_VALIDACION: 'Pendiente de validación',
  NO_REGISTRADO: 'No registrado',
  CORREGIDO: 'Corregido',
  RECHAZADO: 'Rechazado',
};

export const linkStatusLabel = (status) => STATUS_LABELS[status] ?? status;

const GENERATION_TITLES = { 1: 'Padres', 2: 'Abuelos', 3: 'Bisabuelos' };

const isMale = (segment) => segment === 'sire';

const side = (firstSegment, male) =>
  firstSegment === 'sire' ? (male ? 'paterno' : 'paterna') : male ? 'materno' : 'materna';

// Kinship label of a pedigree path such as "dam.sire" -> "Abuelo materno".
export const positionLabel = (position) => {
  const segments = position.split('.');
  const last = segments.at(-1);
  if (segments.length === 1) return isMale(last) ? 'Padre' : 'Madre';
  if (segments.length === 2) {
    return `${isMale(last) ? 'Abuelo' : 'Abuela'} ${side(segments[0], isMale(last))}`;
  }
  const grandparent = segments[1];
  const parentWord = isMale(last) ? 'padre' : 'madre';
  const grandWord = isMale(grandparent)
    ? `del abuelo ${side(segments[0], true)}`
    : `de la abuela ${side(segments[0], false)}`;
  return `${isMale(last) ? 'Bisabuelo' : 'Bisabuela'} ${side(segments[0], isMale(last))} (${parentWord} ${grandWord})`;
};

export const groupPositionsByGeneration = (positions) =>
  Array.from({ length: GENERATION_WINDOW }, (_, index) => index + 1).map((generation) => ({
    generation,
    title: GENERATION_TITLES[generation],
    positions: positions
      .filter((item) => item.generation === generation)
      .map((item) => ({ ...item, label: positionLabel(item.position) })),
  }));

// 0.125 -> "12,5" (Spanish decimal comma, no trailing zeros).
export const formatPercent = (fraction) =>
  String(Number((fraction * 100).toFixed(4))).replace('.', ',');

/** Never renders "0 %" when the calculation is partial (UI-005, SC-004). */
export const formatCoefficient = ({ calculationStatus, coefficient }) => {
  if (coefficient === null || coefficient === undefined) return 'Datos insuficientes';
  if (calculationStatus === CALCULATION_PARTIAL) {
    return coefficient > 0
      ? `≥ ${formatPercent(coefficient)} % (mínimo estimado)`
      : 'Datos insuficientes';
  }
  if (coefficient === 0) {
    return `0 % (sin ancestros comunes en ${GENERATION_WINDOW} generaciones)`;
  }
  return `${formatPercent(coefficient)} %`;
};

const RISK_TONES = {
  ALTO: { className: 'genealogy-risk--high', label: 'Riesgo alto' },
  MODERADO: { className: 'genealogy-risk--moderate', label: 'Riesgo moderado' },
  BAJO: { className: 'genealogy-risk--low', label: 'Riesgo bajo' },
};

export const riskTone = (riskLevel) =>
  RISK_TONES[riskLevel] ?? { className: 'genealogy-risk--neutral', label: 'Sin nivel de riesgo' };
