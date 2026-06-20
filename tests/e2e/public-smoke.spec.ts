import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('redirects protected pages to login without exposing content', async ({ page }) => {
  await page.goto('/clients');

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Parola')).toBeVisible();
});

test('supports keyboard navigation through the login form', async ({ page }) => {
  await page.goto('/login');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /mergi la autentificare/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Parola')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Ai uitat parola/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Conecteaza-te/i })).toBeFocused();
});

test('keeps public legal pages readable without horizontal overflow', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
  }
});

test('has no detectable WCAG A or AA violations on public entry pages', async ({ page }) => {
  for (const path of ['/login', '/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, `${path} accessibility violations`).toEqual([]);
  }
});

test('serves baseline browser security headers', async ({ request }) => {
  const response = await request.get('/login');

  expect(response.ok()).toBe(true);
  expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.headers()['permissions-policy']).toBe(
    'camera=(), microphone=(), geolocation=()'
  );
  expect(response.headers()['strict-transport-security']).toContain('max-age=63072000');

  const csp = response.headers()['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
});
