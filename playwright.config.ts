import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const port = 3199;
const baseURL = `http://127.0.0.1:${port}`;

// Authenticated coverage is opt-in: it needs a seeded DB + credentials, so the
// default gate (CI) stays public-only until those are wired into the pipeline.
const authEnabled = Boolean(process.env.E2E_AUTH);
const ownerStorageState = path.join(__dirname, 'tests', 'e2e', '.auth', 'owner.json');

const publicProjects = [
  {
    name: 'desktop-chromium',
    testMatch: /public-smoke\.spec\.ts/,
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'mobile-chromium',
    testMatch: /public-smoke\.spec\.ts/,
    use: { ...devices['Pixel 7'] },
  },
];

const authProjects = [
  { name: 'auth-setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'authenticated-desktop',
    testMatch: /authenticated-.*\.spec\.ts/,
    dependencies: ['auth-setup'],
    use: { ...devices['Desktop Chrome'], storageState: ownerStorageState },
  },
  {
    name: 'authenticated-mobile',
    testMatch: /authenticated-.*\.spec\.ts/,
    dependencies: ['auth-setup'],
    use: { ...devices['Pixel 7'], storageState: ownerStorageState },
  },
];

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
  projects: authEnabled ? [...publicProjects, ...authProjects] : publicProjects,
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
