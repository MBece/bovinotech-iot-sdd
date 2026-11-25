const REVIEW_ROLES = ['ADMINISTRADOR', 'VETERINARIO'];

export const formatProductivityIndicator = (value, status) =>
  status === 'SUFFICIENT' && value != null ? value : 'DATOS_INSUFICIENTES';

export const canReviewProductivity = (role) => REVIEW_ROLES.includes(role);
