// UX-only pre-validation before enqueuing a link; the server remains the
// authority (including the full anti-cycle check).
const ok = Object.freeze({ valid: true, code: null, message: null });

const fail = (code, message) => ({ valid: false, code, message });

export const validateParentLink = ({ offspring, parent, parentRole }) => {
  if (!offspring || !parent) return ok;
  if (offspring.din === parent.din) {
    return fail('GENEALOGY_CYCLE', 'Un animal no puede ser su propio padre o madre.');
  }
  if (parentRole === 'SIRE' && parent.sex !== 'MACHO') {
    return fail('PARENT_SEX_MISMATCH', 'El padre debe ser macho.');
  }
  if (parentRole === 'DAM' && parent.sex !== 'HEMBRA') {
    return fail('PARENT_SEX_MISMATCH', 'La madre debe ser hembra.');
  }
  // ISO dates (YYYY-MM-DD) compare correctly as strings.
  if (!(parent.birthDate < offspring.birthDate)) {
    return fail(
      'PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING',
      'La fecha de nacimiento del progenitor debe ser anterior a la de la cría.',
    );
  }
  return ok;
};

// Field search with a numeric keypad: "119" -> "DIN-DEMO-000119".
export const resolveDin = (text) => {
  const value = String(text ?? '').trim();
  if (/^\d{1,6}$/.test(value)) return `DIN-DEMO-${value.padStart(6, '0')}`;
  return value.toUpperCase();
};
