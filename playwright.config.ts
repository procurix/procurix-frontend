import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 5173);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: {
    timeout: 7_500,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      },
    },
  ],
});
