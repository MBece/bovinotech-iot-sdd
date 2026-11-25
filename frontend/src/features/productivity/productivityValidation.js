export const validateWeighing = ({ loteId, din, weightKg }) => {
  const errors = {};
  if (!String(loteId || '').trim()) errors.loteId = 'Indique el lote.';
  if (!String(din || '').trim()) errors.din = 'Indique el DIN del animal.';
  if (!Number.isFinite(Number(weightKg)) || Number(weightKg) <= 0) {
    errors.weightKg = 'El peso debe ser mayor que cero.';
  }
  return errors;
};

export const validateConsumption = ({ loteId, quantityKg }) => {
  const errors = {};
  if (!String(loteId || '').trim()) errors.loteId = 'Indique el lote.';
  if (!Number.isFinite(Number(quantityKg)) || Number(quantityKg) <= 0) {
    errors.quantityKg = 'La cantidad debe ser mayor que cero.';
  }
  return errors;
};
