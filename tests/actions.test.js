import assert from 'node:assert/strict';
import test from 'node:test';
import { actionOptions, compactObject, createActionsAdapter } from '../src/actions.js';
import { OPERATION_DETAIL_KEY } from '../src/constants.js';

test('action options preserve signals and give top-level context and detail precedence', () => {
  const signal = new AbortController().signal;
  const options = {
    signal,
    context: 'product',
    detail: { source: 'button', [OPERATION_DETAIL_KEY]: 'caller-supplied' },
    event: { context: 'cart', detail: { source: 'nested', retain: true } },
  };
  const result = actionOptions(options, 'operation-1');

  assert.deepEqual(result, {
    signal,
    event: {
      context: 'product',
      detail: { source: 'button', retain: true, [OPERATION_DETAIL_KEY]: 'operation-1' },
    },
  });
  assert.equal(options.event.context, 'cart');
  assert.equal(options.event.detail.source, 'nested');
});

test('request compaction preserves null, zero, false, and empty replacement values', () => {
  assert.deepEqual(compactObject({ unset: undefined, cart: null, quantity: 0, flag: false, note: '', attributes: [] }), {
    cart: null, quantity: 0, flag: false, note: '', attributes: [],
  });
});

test('adapter resolves actions lazily and preserves their receiver and exact arguments', async () => {
  const window = {};
  const adapter = createActionsAdapter(() => window);
  assert.throws(() => adapter.getCart(), /actions are unavailable/);

  const calls = [];
  const actions = {
    getCart(...args) { calls.push({ name: 'getCart', receiver: this, args }); return Promise.resolve({ cart: null }); },
    updateCart(...args) { calls.push({ name: 'updateCart', receiver: this, args }); return Promise.resolve({ cart: null }); },
    openCart(...args) { calls.push({ name: 'openCart', receiver: this, args }); return Promise.resolve(); },
  };
  window.Shopify = { actions };
  const payload = { note: '' };
  const options = { signal: new AbortController().signal };
  await adapter.getCart({}, options);
  await adapter.updateCart(payload, options);
  await adapter.openCart();

  assert.deepEqual(calls.map(call => call.name), ['getCart', 'updateCart', 'openCart']);
  assert.ok(calls.every(call => call.receiver === actions));
  assert.equal(calls[1].args[0], payload);
  assert.equal(calls[1].args[1], options);
  assert.deepEqual(calls[2].args, []);

  actions.getCart = async () => ({ cart: { id: 'replacement' } });
  assert.deepEqual(await adapter.getCart(), { cart: { id: 'replacement' } });
});
