import { defineConfig } from '@playwright/test';

const BASE_URL_RENDER = 'https://bovinotech-iot-sdd.onrender.com';

export default defineConfig({
  testDir: './security',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: BASE_URL_RENDER,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
});