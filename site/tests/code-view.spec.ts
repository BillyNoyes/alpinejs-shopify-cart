import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('short inline examples replace the cart without changing its state or footprint', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Cart subtotal' })).toHaveText('£48.00');
  await page.getByRole('checkbox', { name: 'Gift wrap', exact: true }).check();
  await expect(page.locator('.cart-line')).toContainText('Gift wrapped');
  const frame = page.locator('#cart-demo-panel');
  const before = await frame.boundingBox();
  await page.getByRole('button', { name: 'View code', exact: true }).click();
  const panel = page.locator('.demo-code-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('.demo-live')).toBeHidden();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View cart', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'View cart', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const after = await frame.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 0);
  expect(after!.height).toBeCloseTo(before!.height, 0);
  const code = await panel.locator('code').first().textContent();
  expect(code!.split('\n').length).toBeLessThanOrEqual(12);
  expect(code).not.toContain('function');
  const calls: unknown[] = [];
  const cart = {
    add: (input: unknown) => calls.push(['add', input]),
    update: (input: unknown) => calls.push(['update', input]),
    remove: (input: unknown) => calls.push(['remove', input]),
  };
  new Function('$cart', 'variantId', 'line', code!)(cart, 'demo-variant', { id: 'demo-line', quantity: 1 });
  expect(calls).toEqual([
    ['add', { merchandiseId: 'demo-variant', quantity: 1 }],
    ['update', { id: 'demo-line', quantity: 2 }],
    ['remove', 'demo-line'],
    ['update', { id: 'demo-line', quantity: 1, attributes: [{ key: 'Gift wrap', value: 'Yes' }] }],
  ]);
  await panel.getByRole('button', { name: 'Copy examples', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expect(panel.getByRole('status')).toHaveText('Copied to clipboard.');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await page.getByRole('button', { name: 'View cart', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('status', { name: 'Cart subtotal' })).toHaveText('£48.00');
  await expect(page.getByRole('checkbox', { name: 'Gift wrap', exact: true })).toBeChecked();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
    test(`inline code ${colorScheme} ${viewport.width}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.getByRole('button', { name: 'View code', exact: true }).click();
      await expect(page.locator('.demo-code-panel')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width >= 1024) {
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath('inline-code.png'), fullPage: true });
      await page.getByRole('button', { name: 'View cart', exact: true }).press('Enter');
      await expect(page.locator('.demo-live')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
