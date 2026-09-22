import { expect, test } from '@playwright/test';
import { createDemoRuntime } from '../src/demo-runtime';

test('example transport separates properties, merges matching lines, and preserves snapshots', async () => {
  const runtime = createDemoRuntime();
  const initial = await runtime.actions.getCart();
  expect(initial.cart.totalQuantity).toBe(1);
  await runtime.actions.updateCart({ lines: [{ merchandiseId: 'demo-variant', quantity: 1 }] });
  const two = await runtime.actions.getCart();
  expect(two.cart.lines).toHaveLength(1);
  expect(two.cart.totalQuantity).toBe(2);
  const attributes = [{ key: 'Gift wrap', value: 'Yes' }];
  await runtime.actions.updateCart({ lines: [{ merchandiseId: 'demo-variant', quantity: 1, attributes }] });
  const split = await runtime.actions.getCart();
  expect(split.cart.lines).toHaveLength(2);
  expect(split.cart.totalQuantity).toBe(3);
  expect(split.cart.lines[0]).not.toHaveProperty('attributes');
  const id = split.cart.lines[0].id;
  await runtime.actions.updateCart({ lines: [{ id, quantity: 2, attributes }] });
  const merged = await runtime.actions.getCart();
  expect(merged.cart.lines).toHaveLength(1);
  expect(merged.cart.lines[0].quantity).toBe(3);
  expect(merged.cart.cost.totalAmount.amount).toBe('72.00');
  expect(runtime.attributes(merged.cart.lines[0].id)).toEqual(attributes);
  expect(initial.cart.totalQuantity).toBe(1);
  expect(initial.cart.lines[0].quantity).toBe(1);
});

test('example transport rejects stale and invalid inputs without changing the cart', async () => {
  const runtime = createDemoRuntime();
  await expect(runtime.actions.updateCart({ lines: [{ id: 'missing', quantity: 1 }] })).rejects.toThrow('no longer exists');
  await expect(runtime.actions.updateCart({ lines: [{ id: 'demo-line-1', quantity: -1 }] })).rejects.toThrow('valid cart operation');
  const limited = await runtime.actions.updateCart({ lines: [{ merchandiseId: 'demo-variant', quantity: 9 }] });
  expect(limited).toHaveProperty('userErrors');
  expect(limited.cart.totalQuantity).toBe(1);
});

test('example updates emit a promise that resolves to the returned snapshot', async () => {
  const runtime = createDemoRuntime();
  let event: Event & { promise: Promise<unknown>; detail: unknown; action: string };
  runtime.events.addEventListener('shopify:cart:lines-update', value => {
    event = value as typeof event;
  });
  const detail = { source: 'example' };
  const result = runtime.actions.updateCart({ lines: [{ id: 'demo-line-1', quantity: 0 }] }, { event: { detail } });
  expect(event!.action).toBe('remove');
  expect(event!.detail).toEqual(detail);
  expect(await event!.promise).toEqual(await result);
  expect((await runtime.actions.getCart()).cart.lines).toEqual([]);
});
