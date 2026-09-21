import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    test(`home ${colorScheme} ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await expect(page.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('16px Inter'))).toBe(true);
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        innerWidth, innerHeight,
      }));
      expect(size.width).toBeLessThanOrEqual(size.innerWidth);
      if (viewport.width >= 1024) expect(size.height).toBeLessThanOrEqual(size.innerHeight + 1);
      expect(errors).toEqual([]);
      if (viewport.width === 1440 || viewport.width === 390) {
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
      }
    });
  }
}

test('header, footer, and homepage links match the site copy', async ({ page }) => {
  for (const route of ['./', './docs/']) {
    await page.goto(route);
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(navigation.getByRole('link')).toHaveCount(1);
    await expect(navigation.getByRole('link', { name: 'GitHub', exact: true })).toBeVisible();
    await expect(page.locator('footer')).toContainText('Built by Billy Noyes. An independent project with no Shopify sponsorship or endorsement.');
    await expect(page.locator('footer').getByRole('link', { name: 'Billy Noyes', exact: true })).toHaveAttribute('href', 'https://billynoyes.co.uk/');
  }
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Get started', exact: true })).toHaveAttribute('href', './docs/');
  await expect(page.getByText('Built on Shopify standards', { exact: true })).toHaveCount(0);
  await expect(page.locator('.demo-status')).toBeEmpty();
});

test('demo runs the real plugin with local data and never contacts a store', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  const count = page.getByRole('status', { name: 'Cart item count' });
  await expect(count).toHaveText('0 items');
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(count).toHaveText('1 item');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.locator('.demo-code code')).toContainText('$cart.update');
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await expect(count).toHaveText('2 items');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove item', exact: true }).click();
  await expect(count).toHaveText('0 items');
  await expect(page.getByRole('button', { name: 'Remove item', exact: true })).toBeDisabled();
  expect(requests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`docs ${colorScheme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./docs/');
      await expect(page.getByRole('heading', { name: 'Documentation', exact: true })).toBeVisible();
      await expect(page.getByText('Development preview.', { exact: true })).toHaveCount(0);
      if (width >= 1024) {
        const sidebar = await page.locator('.docs-sidebar').boundingBox();
        expect(sidebar!.x).toBe(20);
        expect(await page.locator('#main').evaluate(el => getComputedStyle(el).maxWidth)).toBe('1152px');
      }
      if (width < 1024) await page.getByText('On this page', { exact: true }).click();
      const links = page.locator('.docs-nav a');
      const first = await links.nth(0).boundingBox();
      const second = await links.nth(1).boundingBox();
      expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
      await page.getByRole('searchbox', { name: 'Find a section' }).fill('errors');
      await expect(page.locator('.docs-nav a:visible')).toHaveCount(1);
      await page.getByRole('searchbox').fill('not-a-section');
      await expect(page.getByText('No matching sections.')).toBeVisible();
      await page.getByRole('searchbox').fill('');
      await page.locator('.docs-nav').getByRole('link', { name: 'Errors & warnings' }).click();
      await expect(page).toHaveURL(/#errors$/);
      await expect(page.locator('#errors')).toBeFocused();
      await page.goto('./docs/');
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath('docs.png') });
    });
  }
}

test('copy controls support success and failure', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./docs/#installation');
  const block = page.locator('.code-block').first();
  await block.getByRole('button', { name: 'Copy Terminal' }).click();
  await expect(block.getByRole('status')).toHaveText('Copied to clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('git clone');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Denied')) } });
  });
  await block.getByRole('button').click();
  await expect(block.getByRole('status')).toHaveText('Could not copy. Select the code to copy it.');
});

test('navigation works under the GitHub project prefix and without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4175/alpinejs-shopify-cart/');
  await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(/\/alpinejs-shopify-cart\/docs\/$/);
  await expect(page.locator('#installation')).toBeVisible();
  await expect(page.locator('.docs-nav').getByRole('link', { name: 'Errors & warnings' })).toBeVisible();
  await page.getByRole('link', { name: 'Alpine Shopify Cart home' }).click();
  await expect(page.getByRole('heading', { name: 'Shopify cart. Alpine simplicity.' })).toBeVisible();
  await context.close();
});

test('docs navigation retains keyboard focus across responsive changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./docs/');
  await page.getByRole('searchbox', { name: 'Find a section' }).focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.docs-sidebar summary')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#getting-started')).toBeFocused();
});

test('keyboard access and narrow zoom reflow', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
