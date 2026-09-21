import { expect, test } from '@playwright/test';

const fixtureUrl = new URL('./fixture.html', import.meta.url).href;

test('the CDN bundle exposes a reactive cart backed by standard actions', async ({ page }) => {
  await page.goto(fixtureUrl);

  await expect(page.locator('[data-ready]')).toHaveText('true');
  await expect(page.locator('[data-quantity]')).toHaveText('0');

  await page.locator('[data-add]').click();
  await expect(page.locator('[data-quantity]')).toHaveText('2');
  await expect(page.locator('[data-pending]')).toHaveText('false');

  await page.locator('[data-open]').click();
  await expect.poll(() => page.evaluate(() => window.__openedCart)).toBe(1);

  const globals = await page.evaluate(() => ({
    plugin: typeof window.AlpineShopifyCart,
    registered: window.__alpineJsShopifyCartRegistered,
  }));

  expect(globals).toEqual({ plugin: 'function', registered: true });
});
