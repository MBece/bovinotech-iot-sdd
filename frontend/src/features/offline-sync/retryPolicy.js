// Exponential backoff with jitter (research R9). Pure.
// base = min(15 min, 2 s × 2^(attempt − 1)); delay = base × (0.5 + random()).

export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 15 * 60_000;

export const baseDelay = (attempt) =>
  Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));

export const computeRetryDelay = (attempt, random = Math.random) => {
  const base = baseDelay(attempt);
  return Math.min(MAX_DELAY_MS * 1.5, Math.round(base * (0.5 + random())));
};
