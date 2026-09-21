import { expect, test } from '@playwright/test';
import { createPlugin } from '../../src/index.js';
import type { ShopifyCartStore, UpdateCartPayload } from '../../index';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('documented recipes send the intended standard-action payloads', async ({ page }) => {
  await page.goto('./docs/');
  const calls: UpdateCartPayload[] = [];
  let store: ShopifyCartStore & { init(): void };
  let discounts = [{ code: 'FIRST', applicable: true }];
  const result = () => ({ cart: {
    id: 'demo-cart', totalQuantity: 1, lines: [{ id: 'demo-line', quantity: 1, cost: { totalAmount: { amount: '24.00', currencyCode: 'GBP' } } }],
    cost: { totalAmount: { amount: '24.00', currencyCode: 'GBP' } }, discountCodes: discounts,
  } });
  const actions = {
    async getCart() { return result(); },
    async updateCart(payload: UpdateCartPayload) {
      calls.push(structuredClone(payload));
      if (payload.discountCodes) discounts = payload.discountCodes.map(code => ({ code, applicable: true }));
      return result();
    },
    async openCart() {},
  };
  createPlugin({ getWindow: () => ({ Shopify: { actions } }), getDocument: () => new EventTarget() })({
    store(_name: string, value?: typeof store) {
      if (value) { store = value; store.init(); }
      return store;
    },
    magic() {},
  });
  await store!.refresh();
  const data = {
    cart: store!, variantId: 'demo-variant', engraving: ' BN ',
    line: { id: 'demo-line', quantity: 1 },
    retainedAttributes: [{ key: 'Engraving', value: 'BN' }, { key: 'Gift wrap', value: 'No' }],
    firstVariantId: 'demo-first', secondVariantId: 'demo-second', selectedSellingPlanId: 'demo-plan',
    giftMessage: ' Happy birthday ',
    existingCartAttributes: [{ key: 'Keep', value: 'Yes' }, { key: 'Delivery date', value: 'Old date' }],
    deliveryDate: '2026-12-01', discountCode: ' NEW ', codeToRemove: 'FIRST',
    selectedLineIds: ['demo-first-line', 'demo-second-line'],
    showMessage() { throw new Error('No user errors expected in these recipe fixtures'); },
  };
  const run = async (id: string) => {
    const code = await page.locator(`[data-example="${id}"]`).textContent();
    expect(code).toBeTruthy();
    calls.length = 0;
    await new AsyncFunction(...Object.keys(data), code!)(...Object.values(data));
    return calls;
  };
  try {
    expect(await run('add-properties')).toEqual([{ lines: [{
      merchandiseId: 'demo-variant', quantity: 1,
      attributes: [{ key: 'Gift wrap', value: 'Yes' }, { key: 'Engraving', value: 'BN' }],
    }] }]);
    expect(await run('update-properties')).toEqual([{ lines: [{
      id: 'demo-line', quantity: 1,
      attributes: [{ key: 'Engraving', value: 'BN' }, { key: 'Gift wrap', value: 'Yes' }],
    }] }]);
    expect(await run('clear-properties')).toEqual([{ lines: [{ id: 'demo-line', quantity: 1, attributes: [] }] }]);
    expect(await run('multiple-items')).toEqual([{ lines: [
      { merchandiseId: 'demo-first', quantity: 1 },
      { merchandiseId: 'demo-second', quantity: 2, attributes: [{ key: 'Gift wrap', value: 'Yes' }] },
    ] }]);
    expect(await run('selling-plan')).toEqual([{ lines: [{ merchandiseId: 'demo-variant', quantity: 1,
      sellingPlanId: 'demo-plan', attributes: [{ key: 'Gift wrap', value: 'Yes' }],
    }] }]);
    expect(await run('cart-note')).toEqual([{ note: 'Happy birthday' }, { note: '' }]);
    expect(await run('cart-attributes')).toEqual([{ attributes: [{ key: 'Keep', value: 'Yes' }, { key: 'Delivery date', value: '2026-12-01' }] }]);
    expect(await run('apply-discount')).toEqual([{ discountCodes: ['FIRST', 'NEW'] }]);
    expect(await run('remove-discount')).toEqual([{ discountCodes: ['NEW'] }]);
    expect(await run('combined-mutation')).toEqual([{
      lines: [{ id: 'demo-line', quantity: 1, attributes: [{ key: 'Gift wrap', value: 'Yes' }] }], note: ' Happy birthday ',
    }]);
    expect(await run('remove-lines')).toEqual([{ lines: [{ id: 'demo-first-line', quantity: 0 }, { id: 'demo-second-line', quantity: 0 }] }]);

    let factory: () => { giftWrap: boolean; engraving: string; message: string; add(id: string): Promise<void> };
    const component = await page.locator('[data-example="gift-component"]').textContent();
    new Function('Alpine', component!)({ data(_name: string, provider: typeof factory) { factory = provider; } });
    const form = Object.assign(factory!(), { $cart: store!, giftWrap: true, engraving: ' BN ' });
    calls.length = 0;
    await form.add('demo-variant');
    expect(calls).toEqual([{ lines: [{ merchandiseId: 'demo-variant', quantity: 1,
      attributes: [{ key: 'Gift wrap', value: 'Yes' }, { key: 'Engraving', value: 'BN' }],
    }] }]);
    expect(form.message).toBe('Added to cart.');
  } finally {
    store!.dispose();
  }
});

test('line-item properties are discoverable and copyable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./docs/');
  await page.getByRole('searchbox').fill('properties');
  await page.locator('.docs-nav').getByRole('link', { name: 'Line-item properties' }).click();
  await expect(page).toHaveURL(/#line-properties$/);
  const block = page.locator('.code-block').filter({ has: page.locator('[data-example="add-properties"]') });
  await block.getByRole('button', { name: 'Copy Add line-item properties' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("{ key: 'Gift wrap', value: 'Yes' }");
  expect(text).not.toContain('properties:');
});
