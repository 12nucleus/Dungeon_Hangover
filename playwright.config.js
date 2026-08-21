import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  timeout: 120000,
  expect: { timeout: 10000 },
  use: { headless: true, viewport: { width: 1280, height: 720 } },
  webServer: {
    command: `npx vite --port ${process.env.PW_PORT || 3000} --host 127.0.0.1`,
    url: `http://127.0.0.1:${process.env.PW_PORT || 3000}`,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
