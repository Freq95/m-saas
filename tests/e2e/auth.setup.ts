import { test as setup } from '@playwright/test';
import path from 'node:path';

/**
 * Logs in once as a clinic owner and persists the session so the authenticated
 * projects can reuse it. Only runs when E2E_AUTH is set (see playwright.config),
 * which keeps the default CI gate public-only until a seeded DB is wired in.
 *
 * Credentials default to the demo-clinic seed (scripts/seed-demo-clinic.js);
 * override with E2E_EMAIL / E2E_PASSWORD against another environment.
 */
export const ownerStorageState = path.join(__dirname, '.auth', 'owner.json');

const email = process.env.E2E_EMAIL || 'owner@test.com';
const password = process.env.E2E_PASSWORD || '11111111';

setup('authenticate as clinic owner', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Parola').fill(password);
  await page.getByRole('button', { name: /Conecteaza-te/i }).click();

  // A successful sign-in lands on an authenticated shell route.
  await page.waitForURL(/\/(dashboard|calendar|clients|inbox)(?:\?|$)/, { timeout: 20_000 });
  await page.context().storageState({ path: ownerStorageState });
});
