import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlugin, STORE_NAME } from '../src/index.js';

class FakeDocument extends EventTarget {
  constructor(readyState = 'complete') {
    super();
    this.readyState = readyState;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function cart(totalQuantity = 0, lines = []) {
  return {
    id: 'gid://shopify/Cart/1',
    totalQuantity,
    cost: {
      totalAmount: {
        amount: String(totalQuantity * 10),
        currencyCode: 'USD',
      },
    },
    lines,
    discountCodes: [],
  };
}

function standardEvent(type, payload) {
  const event = new Event(type);
  Object.assign(event, payload);
  return event;
}

function createAlpine() {
  const stores = new Map();
  const magics = new Map();

  return {
    magics,
    store(name, value) {
      if (arguments.length === 2) {
        stores.set(name, value);
        value?.init?.call(value);
      }

      return stores.get(name);
    },
    magic(name, callback) {
      magics.set(name, callback);
    },
  };
}

async function nextTurn() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function setup(overrides = {}) {
  const document = new FakeDocument(overrides.readyState);
  const calls = {
    getCart: [],
    updateCart: [],
    openCart: 0,
  };
  const actions = {
    async getCart(payload, options) {
      calls.getCart.push({ payload, options });

      return overrides.actions?.getCart
        ? overrides.actions.getCart(payload, options)
        : { cart: cart() };
    },
    async updateCart(payload, options) {
      calls.updateCart.push({ payload, options });

      return overrides.actions?.updateCart
        ? overrides.actions.updateCart(payload, options)
        : { cart: cart() };
    },
    async openCart() {
      calls.openCart += 1;

      return overrides.actions?.openCart?.();
    },
  };
  const window = { Shopify: { actions } };
  const Alpine = createAlpine();
  const plugin = createPlugin({
    getWindow: () => window,
    getDocument: () => document,
  });

  plugin(Alpine);
  plugin(Alpine);

  if (document.readyState === 'loading') {
    document.readyState = 'interactive';
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }

  await nextTurn();

  return {
    Alpine,
    calls,
    document,
    store: Alpine.store(STORE_NAME),
    window,
  };
}

test('registers an idempotent $cart magic and loads the initial cart', async () => {
  const { Alpine, store } = await setup({
    actions: {
      async getCart() {
        return { cart: cart(2) };
      },
    },
  });

  assert.equal(Alpine.magics.size, 1);
  assert.equal(Alpine.magics.get('cart')(), store);
  assert.equal(store.ready, true);
  assert.equal(store.totalQuantity, 2);
  assert.equal(store.pending, false);
});

test('normalizes the runtime cart line connection for Alpine consumers', async () => {
  const line = {
    id: 'gid://shopify/CartLine/1',
    quantity: 1,
    cost: { totalAmount: { amount: '10', currencyCode: 'USD' } },
  };
  const { store } = await setup({
    actions: {
      async getCart() {
        return { cart: cart(1, { nodes: [line] }) };
      },
    },
  });

  assert.deepEqual(store.cart.lines, { nodes: [line] });
  assert.deepEqual(store.lines, [line]);
});

test('waits until DOMContentLoaded before using Shopify actions', async () => {
  const document = new FakeDocument('loading');
  let reads = 0;
  const window = {
    Shopify: {
      actions: {
        async getCart() {
          reads += 1;
          return { cart: cart(1) };
        },
        async updateCart() {
          return { cart: cart(1) };
        },
        async openCart() {},
      },
    },
  };
  const Alpine = createAlpine();

  createPlugin({
    getWindow: () => window,
    getDocument: () => document,
  })(Alpine);

  await nextTurn();
  assert.equal(reads, 0);

  document.readyState = 'interactive';
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await nextTurn();

  assert.equal(reads, 1);
  assert.equal(Alpine.store(STORE_NAME).ready, true);
});

test('waits for later DOMContentLoaded listeners to install Shopify actions', async () => {
  const document = new FakeDocument('loading');
  const window = { Shopify: {} };
  const Alpine = createAlpine();

  createPlugin({
    getWindow: () => window,
    getDocument: () => document,
  })(Alpine);

  document.addEventListener('DOMContentLoaded', () => {
    window.Shopify.actions = {
      async getCart() {
        return { cart: cart(1) };
      },
      async updateCart() {
        return { cart: cart(1) };
      },
      async openCart() {},
    };
  });

  document.readyState = 'interactive';
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await nextTurn();
  await nextTurn();

  assert.equal(Alpine.store(STORE_NAME).ready, true);
  assert.equal(Alpine.store(STORE_NAME).totalQuantity, 1);
  assert.equal(Alpine.store(STORE_NAME).error, null);
});

test('adds lines through updateCart without double-counting its standard event', async () => {
  const request = deferred();
  let document;
  const environment = await setup({
    actions: {
      updateCart(payload, options) {
        const event = standardEvent('shopify:cart:lines-update', {
          action: 'add',
          context: options.event.context ?? 'standard-action',
          lines: payload.lines,
          promise: request.promise,
          detail: options.event.detail,
        });
        document.dispatchEvent(event);
        return request.promise;
      },
    },
  });
  document = environment.document;

  const promise = environment.store.add(
    { merchandiseId: 123, quantity: 1 },
    { context: 'product', detail: { source: 'product-form' } },
  );
  await Promise.resolve();

  assert.equal(environment.store.pendingCount, 1);
  assert.equal(environment.store.pendingOperation, 'add');

  const call = environment.calls.updateCart[0];
  assert.deepEqual(call.payload, {
    lines: [{ merchandiseId: 123, quantity: 1 }],
  });
  assert.equal(call.options.event.context, 'product');
  assert.equal(call.options.event.detail.source, 'product-form');
  assert.equal(typeof call.options.event.detail.alpineShopifyCartOperationId, 'string');

  request.resolve({ cart: cart(1) });
  await promise;

  assert.equal(environment.store.totalQuantity, 1);
  assert.equal(environment.store.pendingCount, 0);
});

test('reconciles cart changes initiated outside the plugin', async () => {
  const { document, store } = await setup();
  const request = deferred();

  document.dispatchEvent(
    standardEvent('shopify:cart:lines-update', {
      action: 'update',
      context: 'cart',
      lines: [{ id: 'gid://shopify/CartLine/1', quantity: 3 }],
      promise: request.promise,
    }),
  );

  assert.equal(store.pending, true);
  assert.equal(store.pendingOperation, 'external:update');

  request.resolve({ cart: cart(3) });
  await nextTurn();

  assert.equal(store.totalQuantity, 3);
  assert.equal(store.pending, false);
});

test('serializes local mutations in call order', async () => {
  const first = deferred();
  const second = deferred();
  let mutation = 0;
  const environment = await setup({
    actions: {
      updateCart() {
        mutation += 1;
        return mutation === 1 ? first.promise : second.promise;
      },
    },
  });

  const add = environment.store.add({ merchandiseId: 123, quantity: 1 });
  const update = environment.store.update({ id: 'line-1', quantity: 2 });
  await Promise.resolve();

  assert.equal(mutation, 1);
  assert.equal(environment.store.pendingCount, 2);

  first.resolve({ cart: cart(1) });
  await add;
  await Promise.resolve();

  assert.equal(mutation, 2);

  second.resolve({ cart: cart(2) });
  await update;

  assert.equal(environment.store.totalQuantity, 2);
  assert.equal(environment.store.pending, false);
});

test('ignores an older external result that settles after a newer one', async () => {
  const { document, store } = await setup();
  const older = deferred();
  const newer = deferred();

  document.dispatchEvent(
    standardEvent('shopify:cart:lines-update', {
      action: 'update',
      context: 'cart',
      lines: [{ id: 'line-1', quantity: 1 }],
      promise: older.promise,
    }),
  );
  document.dispatchEvent(
    standardEvent('shopify:cart:lines-update', {
      action: 'update',
      context: 'cart',
      lines: [{ id: 'line-1', quantity: 2 }],
      promise: newer.promise,
    }),
  );

  newer.resolve({ cart: cart(2) });
  await nextTurn();
  older.resolve({ cart: cart(1) });
  await nextTurn();

  assert.equal(store.totalQuantity, 2);
  assert.equal(store.pending, false);
});

test('tracks note and attribute values from external standard events', async () => {
  const { document, store } = await setup();
  const note = deferred();
  const attributes = deferred();

  document.dispatchEvent(
    standardEvent('shopify:cart:note-update', {
      context: 'cart',
      note: 'Gift order',
      promise: note.promise,
    }),
  );
  note.resolve({ cart: cart() });
  await nextTurn();

  document.dispatchEvent(
    standardEvent('shopify:cart:attributes-update', {
      context: 'cart',
      attributes: [{ key: 'Gift wrap', value: 'Yes' }],
      promise: attributes.promise,
    }),
  );
  attributes.resolve({ cart: cart() });
  await nextTurn();

  assert.equal(store.note, 'Gift order');
  assert.deepEqual(store.attributes, [{ key: 'Gift wrap', value: 'Yes' }]);
});

test('records standard cart error events', async () => {
  const { document, store } = await setup();

  document.dispatchEvent(
    standardEvent('shopify:cart:error', {
      error: 'Cart service unavailable',
      code: 'SERVICE_UNAVAILABLE',
      detail: { source: 'theme' },
    }),
  );

  assert.equal(store.error.name, 'ShopifyCartError');
  assert.equal(store.error.message, 'Cart service unavailable');
  assert.equal(store.error.code, 'SERVICE_UNAVAILABLE');
  assert.deepEqual(store.error.detail, { source: 'theme' });
});

test('preserves user errors and warnings from resolved mutations', async () => {
  const userErrors = [{ code: 'MAXIMUM_EXCEEDED', message: 'Too many items.' }];
  const warnings = [{ code: 'MERCHANDISE_NOT_ENOUGH_STOCK', message: 'Quantity adjusted.' }];
  const { store } = await setup({
    actions: {
      async updateCart() {
        return { cart: cart(), userErrors, warnings };
      },
    },
  });

  const result = await store.add({ merchandiseId: 123, quantity: 100 });

  assert.equal(result.userErrors, userErrors);
  assert.deepEqual(store.userErrors, userErrors);
  assert.deepEqual(store.warnings, warnings);
  assert.equal(store.error, null);
});

test('records rejected actions and keeps their promises rejected', async () => {
  const failure = new Error('Network unavailable');
  failure.code = 'SERVICE_UNAVAILABLE';
  const { store } = await setup({
    actions: {
      async updateCart() {
        throw failure;
      },
    },
  });

  await assert.rejects(
    store.add({ merchandiseId: 123, quantity: 1 }),
    failure,
  );

  assert.equal(store.error.message, 'Network unavailable');
  assert.equal(store.error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(store.pending, false);
});

test('maps convenience methods to standard updateCart payloads', async () => {
  const { calls, store } = await setup();

  await store.remove(['line-1', 'line-2']);
  await store.setNote('Gift order');
  await store.setAttributes([{ key: 'Gift wrap', value: 'Yes' }]);
  await store.setDiscountCodes(['WELCOME10']);

  assert.deepEqual(
    calls.updateCart.map(({ payload }) => payload),
    [
      {
        lines: [
          { id: 'line-1', quantity: 0 },
          { id: 'line-2', quantity: 0 },
        ],
      },
      { note: 'Gift order' },
      { attributes: [{ key: 'Gift wrap', value: 'Yes' }] },
      { discountCodes: ['WELCOME10'] },
    ],
  );
  assert.equal(store.note, 'Gift order');
  assert.deepEqual(store.attributes, [{ key: 'Gift wrap', value: 'Yes' }]);
});

test('uses cart view events as an immediate source of cart state', async () => {
  const { document, store } = await setup();

  document.dispatchEvent(
    standardEvent('shopify:cart:view', {
      context: 'dialog',
      cart: cart(4),
    }),
  );

  assert.equal(store.totalQuantity, 4);
});

test('opens the storefront cart and removes event listeners on disposal', async () => {
  const { calls, document, store } = await setup();

  await store.open();
  assert.equal(calls.openCart, 1);

  store.dispose();
  document.dispatchEvent(
    standardEvent('shopify:cart:view', {
      context: 'page',
      cart: cart(9),
    }),
  );

  assert.notEqual(store.totalQuantity, 9);
  await assert.rejects(store.refresh(), /disposed/);
});
