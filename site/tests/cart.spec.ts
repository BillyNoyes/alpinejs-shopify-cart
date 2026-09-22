import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('cart controls update plugin state, totals, and empty state without store requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  const count = page.getByRole('status', { name: 'Cart item count' });
  const total = page.getByRole('status', { name: 'Cart subtotal' });
  const add = page.getByRole('button', { name: /^Add to cart:/ });
  await expect(count).toHaveText('1 item');
  await expect(total).toHaveText('£24.00');
  await expect(page.locator('.demo-tabs')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Remove line:/ })).toHaveText('@click="$cart.remove(line.id)"');
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await expect(count).toHaveText('2 items');
  await expect(total).toHaveText('£48.00');
  await expect(page.locator('.line-price')).toHaveText('£48.00');
  await page.getByRole('button', { name: 'Decrease quantity', exact: true }).click();
  await expect(total).toHaveText('£24.00');
  await add.click();
  await expect(count).toHaveText('2 items');
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await page.getByRole('button', { name: /^Remove line:/ }).click();
  await expect(count).toHaveText('0 items');
  await expect(total).toHaveText('£0.00');
  await expect(page.getByText('Your cart is empty.', { exact: false })).toBeVisible();
  await expect(add).toBeFocused();
  await add.click();
  await expect(count).toHaveText('1 item');
  await page.getByRole('button', { name: 'Decrease quantity', exact: true }).click();
  await expect(count).toHaveText('0 items');
  await expect(add).toBeFocused();
  expect(requests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
});

test('gift wrap, quantity, and removal operate on the selected line', async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('./');
  const rows = page.locator('.cart-line');
  const count = page.getByRole('status', { name: 'Cart item count' });
  const total = page.getByRole('status', { name: 'Cart subtotal' });
  await rows.first().getByRole('checkbox', { name: 'Gift wrap', exact: true }).check();
  await expect(rows.first()).toContainText('Natural / Gift wrapped');
  await page.getByRole('button', { name: /^Add to cart:/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(count).toHaveText('2 items');
  await rows.nth(1).getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await expect(total).toHaveText('£72.00');
  await expect(rows.first().getByRole('status', { name: 'Line quantity', exact: true })).toHaveText('1');
  await expect(rows.nth(1).getByRole('status', { name: 'Line quantity', exact: true })).toHaveText('2');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  expect(await page.locator('.cart-lines').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('cart-with-two-lines.png'), fullPage: true });
  await rows.first().getByRole('button', { name: /^Remove line:/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(total).toHaveText('£48.00');
  await expect(rows.first().getByRole('checkbox')).not.toBeChecked();
  await expect(rows.first().getByRole('button', { name: /^Remove line:/ })).toBeFocused();
});

test('merging matching properties preserves quantity and keyboard focus', async ({ page }) => {
  await page.goto('./');
  const rows = page.locator('.cart-line');
  await rows.first().getByRole('checkbox').check();
  await expect(rows.first()).toContainText('Gift wrapped');
  await page.getByRole('button', { name: /^Add to cart:/ }).click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByRole('checkbox').check();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('status', { name: 'Line quantity', exact: true })).toHaveText('2');
  await expect(rows.first().getByRole('checkbox')).toBeFocused();
  await rows.first().getByRole('checkbox').uncheck();
  await expect(rows.first()).not.toContainText('Gift wrapped');
  await expect(page.getByRole('status', { name: 'Cart subtotal' })).toHaveText('£48.00');
});

test('demo prevents repeated pending actions and explains its quantity limit', async ({ page }) => {
  await page.goto('./');
  const add = page.getByRole('button', { name: /^Add to cart:/ });
  const count = page.getByRole('status', { name: 'Cart item count' });
  await expect(add).toBeEnabled();
  await add.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(count).toHaveText('2 items');
  for (let quantity = 3; quantity <= 9; quantity++) {
    await add.click();
    await expect(count).toHaveText(`${quantity} items`);
  }
  await expect(add).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Increase quantity', exact: true })).toBeDisabled();
  await expect(page.locator('.demo-status')).toHaveText('Demo limit reached: 9 items.');
  await page.getByRole('button', { name: 'Decrease quantity', exact: true }).click();
  await expect(count).toHaveText('8 items');
  await expect(add).toBeEnabled();
});
