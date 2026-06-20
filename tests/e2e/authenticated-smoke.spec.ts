import { expect, test } from '@playwright/test';

/**
 * Authenticated critical-flow smoke tests. These run only in the authenticated
 * projects (E2E_AUTH=1), which reuse the session from auth.setup.ts. Assertions
 * are viewport-agnostic and read-only (no records are created) so the tests are
 * safe against a shared seeded database.
 */

async function openFirstPatient(page: import('@playwright/test').Page) {
  await page.goto('/clients');
  // Desktop renders patients as clickable table rows; the mobile view renders
  // button cards with the seed phone numbers. Open the first one either way.
  const width = page.viewportSize()?.width ?? 1280;
  const firstPatient = width < 700
    ? page.getByRole('button').filter({ hasText: /\+\d{6,}/ }).first()
    : page.locator('tbody tr').first();
  await expect(firstPatient).toBeVisible();
  await firstPatient.click();
  await page.waitForURL(/\/clients\/\d+/, { timeout: 15_000 });
}

test('authenticated shell loads without bouncing to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page).not.toHaveURL(/\/login/);
});

test('dental tab: tapping a tooth opens its detail view', async ({ page }) => {
  await openFirstPatient(page);

  await page.getByRole('button', { name: 'Dental' }).click();
  const firstTooth = page.locator('g[data-fdi]').first();
  await expect(firstTooth).toBeVisible();
  await firstTooth.click();

  // The detail view (desktop panel or mobile modal) names the selected tooth.
  await expect(page.getByText(/Dinte \d+/).first()).toBeVisible();
});

test('treatment plan: the builder opens from the plan tab', async ({ page }) => {
  await openFirstPatient(page);

  await page.getByRole('button', { name: 'Plan de tratament' }).click();
  await page.getByRole('button', { name: /Plan nou/i }).first().click();

  // The builder renders its procedures section in both desktop and mobile layouts.
  await expect(page.getByText(/Proceduri/i).first()).toBeVisible();
});
