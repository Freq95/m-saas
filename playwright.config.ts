import { defineConfig, devices } from '@playwright/test';

const port = 3199;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_SECRET: process.env.AUTH_SECRET || 'local-playwright-auth-secret-at-least-32-characters',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'local-playwright-auth-secret-at-least-32-characters',
      AUTH_URL: baseURL,
      NEXTAUTH_URL: baseURL,
    },
  },
});
