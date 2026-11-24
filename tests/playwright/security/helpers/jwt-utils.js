import jwt from 'jsonwebtoken';

/**
 * Known development secret key used by the Render backend.
 * @type {string}
 */
export const DEV_SECRET_KEY = 'dev-insecure-key-only-for-local-testing';

/**
 * Create a signed JWT token with the development secret.
 * @param {object} payload - Token claims (sub, role, farm_id, etc.)
 * @param {object} [options] - jwt.sign options (expiresIn, algorithm, etc.)
 * @returns {string} Signed JWT string
 */
export function signToken(payload, options = { algorithm: 'HS256', expiresIn: '7d' }) {
  return jwt.sign(payload, DEV_SECRET_KEY, options);
}

/**
 * Create a token with algorithm "none" (no signature).
 * @param {object} payload - Token claims
 * @returns {string} Unsigned JWT string (three segments, last one empty)
 */
export function noneAlgToken(payload = { sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 1 }) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

/**
 * Create a malformed JWT-like string signed with a different (wrong) secret.
 * @param {object} payload - Token claims
 * @param {string} [wrongSecret] - Different secret to sign with
 * @returns {string} JWT signed with wrong secret
 */
export function wrongKeyToken(payload = { sub: 'vet@bovinotech.co', role: 'VETERINARIO', farm_id: 1 }, wrongSecret = 'my-fake-key') {
  return jwt.sign(payload, wrongSecret, { algorithm: 'HS256', expiresIn: '7d' });
}

/**
 * Create a token with a custom header (e.g., for algorithm confusion tests).
 * @param {object} payload - Token claims
 * @param {object} headerOptions - Custom header options (alg, kid, etc.)
 * @returns {string} JWT with custom header
 */
export function customHeaderToken(payload, headerOptions = { alg: 'HS256' }) {
  const header = Buffer.from(JSON.stringify({ ...headerOptions, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from(DEV_SECRET_KEY).toString('base64url');
  return `${header}.${body}.${signature}`;
}

export default {
  DEV_SECRET_KEY,
  signToken,
  noneAlgToken,
  wrongKeyToken,
  customHeaderToken,
};