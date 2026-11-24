import { defineConfig, devices } from '@playwright/test';

const BASE_URL_LOCAL = 'http://localhost:8000';
const BASE_URL_RENDER = 'https://bovinotech-iot-sdd.onrender.com';

export default defineConfig({
  testDir: './qa',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.TARGET === 'render' ? BASE_URL_RENDER : BASE_URL_LOCAL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: '**/functional/*.api.test.js',
    },
    {
      name: 'e2e',
      testMatch: '**/e2e/*.e2e.test.js',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});