import { expect, test } from '@playwright/test';

/**
 * Phase 0 smoke test: the app boots, the PWA shell loads, and the primary
 * interactive control works. Deeper flows arrive in later phases.
 */
test('app boots and the counter increments', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /MonetaFox Reborn/i, level: 1 }),
  ).toBeVisible();

  const counter = page.getByRole('button', { name: /Count: 0/i });
  await expect(counter).toBeVisible();
  await counter.click();
  await counter.click();
  await expect(
    page.getByRole('button', { name: /Count: 2/i }),
  ).toBeVisible();
});

test('theme toggle switches dark class on <html>', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByTestId('theme-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await toggle.click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});
