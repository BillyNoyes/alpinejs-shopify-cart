import { expect, test } from '@playwright/test';

for (const mode of ['standard', 'csp']) {
  test(`${mode}: the CDN bundle initializes and shares reactive cart state`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/tests/fixture.html${mode === 'csp' ? '?csp' : ''}`);
    await expect(page.locator('[data-ready]')).toHaveText('true');
    await expect(page.locator('[data-quantity]')).toHaveText('0');

    await page.locator('[data-add]').click();
    await expect(page.locator('[data-quantity]')).toHaveText('2');
    await expect(page.locator('[data-other-quantity]')).toHaveText('2');
    await expect(page.locator('[data-pending]')).toHaveText('false');
    await page.locator('[data-open]').click();
    await expect.poll(() => page.evaluate(() => window.__openedCart)).toBe(1);

    await page.evaluate(() => document.querySelector('main').remove());
    await page.evaluate(async () => {
      await Shopify.actions.updateCart({ lines: [{ id: 'line', quantity: 3 }] }, { event: {} });
    });
    await expect(page.locator('[data-other-quantity]')).toHaveText('3');
    expect(errors).toEqual([]);
  });
}

test('own event rejection is consumed while the action error reaches its caller', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixture.html');
  await expect(page.locator('[data-ready]')).toHaveText('true');
  const message = await page.evaluate(async () => {
    Shopify.actions.updateCart = (payload, options) => {
      const eventPromise = Promise.reject(new Error('Event failed'));
      document.dispatchEvent(Object.assign(new Event('shopify:cart:lines-update'), {
        action: 'add', promise: eventPromise, detail: options.event.detail,
      }));
      return Promise.reject(new Error('Action failed'));
    };
    try { await Alpine.store('shopifyCart').add({ merchandiseId: '1', quantity: 1 }); }
    catch (error) { return error.message; }
  });
  expect(message).toBe('Action failed');
  // Cross a task boundary so unhandled-rejection reporting has a chance to run.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  expect(errors).toEqual([]);
});
