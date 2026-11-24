// In-memory animal search over the active farm catalog (FR-009b, research R8).
// It only suggests: an animal is chosen when the operator taps a suggestion.

export const SUGGESTION_LIMIT = 10;

export const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const rank = (animal, query) => {
  const din = normalizeText(animal.din);
  const name = normalizeText(animal.name);
  if (din.startsWith(query) || name.startsWith(query)) return 0;
  if (din.includes(query) || name.includes(query)) return 1;
  return -1;
};

export const searchAnimals = (animals, rawQuery, { limit = SUGGESTION_LIMIT } = {}) => {
  const query = normalizeText(rawQuery);
  if (!query) return [];
  const starts = [];
  const contains = [];
  for (const animal of animals) {
    const score = rank(animal, query);
    if (score === 0) starts.push(animal);
    else if (score === 1) contains.push(animal);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
};
