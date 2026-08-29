import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the customer transition contract.
 *
 * Blueprint §10 makes QA_READY depend on the transition window containing no
 * progress UI, no visible click markers and no Technical stage. Until now the
 * only thing checking that was a vitest file that read the component source as
 * a string, so a progress bar added with different wording would have passed.
 * These assertions run against the rendered DOM.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // The transition is a timed sequence; give it room without hiding a hang.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: process.env.DVTG_PREVIEW_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Blueprint §5.1 requires forgiving hit regions on mobile, and §4.3
      // requires desktop and mobile to preserve the same group relationships.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'reduced-motion',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
    },
  ],

  webServer: {
    command: 'npm run preview',
    url: process.env.DVTG_PREVIEW_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
