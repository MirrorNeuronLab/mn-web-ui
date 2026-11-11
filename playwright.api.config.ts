import { defineConfig, devices } from "@playwright/test";

// Exercise the actual REST and native runtime routes with a deterministic Core.
const python = process.env.MN_WEB_E2E_PYTHON || "python3";
const webServer =
  process.env.MN_WEB_E2E_PROXY === "compose" ? "compose" : "web";
const env = {
  PYTHONDONTWRITEBYTECODE: "1",
  MN_ENV: "test",
  MN_WEB_API_BASE_URL: "/api/v1",
  MN_WEB_API_TOKEN: "",
};

export default defineConfig({
  testDir: "./e2e/api",
  timeout: 30_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  webServer: [
    {
      command: '"' + python + '" e2e/api-server.py runtime',
      url: "http://127.0.0.1:54011/health",
      env,
      timeout: 30_000,
    },
    {
      command: '"' + python + '" e2e/api-server.py api',
      url: "http://127.0.0.1:54009/api/v1/health",
      env,
      timeout: 30_000,
    },
    {
      command: `npm run build && "${python}" e2e/api-server.py ${webServer}`,
      url: "http://127.0.0.1:4174/health",
      env,
      stdout: "pipe",
      timeout: 60_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
