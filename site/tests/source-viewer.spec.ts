import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('source viewer shows actual cart sources without resetting the cart', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Cart subtotal' })).toHaveText('£48.00');
  const trigger = page.getByRole('button', { name: 'View code', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Under the hood' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await expect(dialog.locator('.code-block')).toHaveCount(4);
  const html = dialog.locator('.code-block').first();
  await expect(html.locator('code')).toContainText('x-for="line in lines"');
  await expect(html.locator('code')).toContainText('@click="remove(line.id)"');
  await expect(html.locator('code')).not.toContainText('data-source-viewer');
  await expect(dialog.locator('.code-block').nth(1).locator('code')).toContainText('export function installDemo');
  await expect(dialog.locator('.code-block').nth(2).locator('code')).toContainText('export function createDemoRuntime');
  await expect(dialog.locator('.code-block').nth(3).locator('code')).toContainText('Alpine.start()');
  await dialog.getByRole('button', { name: 'Copy Cart HTML', exact: true }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('x-for="line in lines"');
  expect(clipboard).toContain('Add to cart');
  expect(clipboard).not.toContain('data-source-viewer');
  await expect(html.getByRole('status')).toHaveText('Copied to clipboard.');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await expect(page.getByRole('status', { name: 'Cart subtotal' })).toHaveText('£48.00');
  await trigger.click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`source viewer ${colorScheme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.getByRole('button', { name: 'View code', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Under the hood' });
      await expect(dialog.locator('.code-block')).toHaveCount(4);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(800);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath('source-viewer.png') });
      await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-cart-action="add"]')!.focus());
      expect(await page.evaluate(() => document.querySelector('dialog')!.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
