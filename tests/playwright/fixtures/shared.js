import { test as base, request } from '@playwright/test';

const DEFAULT_CREDENTIALS = {
  vet: { username: 'vet@bovinotech.co', password: 'password123', farm_id: 1 },
  vet2_farm1: { username: 'vet2@bovinotech.co', password: 'password123', farm_id: 1 },
  vet2_farm2: { username: 'vet2@bovinotech.co', password: 'password123', farm_id: 2 },
  operario: { username: 'operario@bovinotech.co', password: 'password123', farm_id: 1 },
  admin: { username: 'admin@bovinotech.co', password: 'password123', farm_id: 1 },
};

/**
 * Log in and return an access token for the given credentials.
 * Uses the environment's baseURL automatically.
 */
async function apiLogin(requestContext, { username, password, farm_id }) {
  const payload = { username, password };
  if (farm_id !== undefined) payload.farm_id = farm_id;

  const res = await requestContext.post('/auth/login', { data: payload });
  if (res.status() !== 200) {
    throw new Error(`Login failed for ${username}: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Authenticated GET helper.
 */
async function apiGet(requestContext, token, url) {
  return requestContext.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Authenticated POST helper.
 */
async function apiPost(requestContext, token, url, data) {
  return requestContext.post(url, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

export { DEFAULT_CREDENTIALS, apiLogin, apiGet, apiPost };