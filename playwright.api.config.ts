import { defineConfig, devices } from '@playwright/test';

// Optional integration gate against the sibling mn-api's actual HTTP routes.
// The supplied Python must already have mn-api's dependencies installed.
const python = process.env.MN_WEB_E2E_PYTHON || 'python3';
const env = {
  PYTHONDONTWRITEBYTECODE: '1',
  MN_ENV: 'test',
  MN_API_HOST: '127.0.0.1',
  MN_API_PORT: '54009',
  MN_API_TOKEN: 'web-ui-contract-test',
  MN_WEB_API_TOKEN: 'web-ui-contract-test',
  MN_WEB_API_BASE_URL: '/api/v1',
  MN_WEB_UI_API_BASE_URL: 'http://127.0.0.1:54009/api/v1',
};

export default defineConfig({
  testDir: './e2e/api',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: [
    { command: '"' + python + '" e2e/api-server.py api', url: 'http://127.0.0.1:54009/api/v1/health', env, timeout: 30_000 },
    { command: 'npm run build && "' + python + '" e2e/api-server.py web', url: 'http://127.0.0.1:4174/health', env, timeout: 60_000 },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
