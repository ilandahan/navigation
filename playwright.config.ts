import { defineConfig, devices } from '@playwright/test';

// Two projects — same specs run against localhost (dev server) and prod
// (Firebase Hosting). Gives a clean diff between "works on my machine" and
// "works on the deployed site" with one command.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,            // tests touch Google Maps/Routes, keep generous
  expect: { timeout: 10_000 },
  fullyParallel: false,        // avoid Google Maps quota spikes from parallel loads
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: 'local',
      use: {
        baseURL: 'http://localhost:5173',
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'prod',
      use: {
        baseURL: 'https://navigation-app-493307.web.app',
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
