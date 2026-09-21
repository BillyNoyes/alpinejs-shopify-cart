import assert from 'node:assert/strict';
import test from 'node:test';
import { createCartStore } from '../src/store.js';
import { createCartOperations } from '../src/operations.js';
import { createCartEvents } from '../src/events.js';
import { OPERATION_DETAIL_KEY } from '../src/constants.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const nextTurn = () => new Promise(resolve => setTimeout(resolve, 0));
const result = quantity => ({ cart: { id: 'cart-1', totalQuantity: quantity, lines: [], discountCodes: [] } });
const emit = (target, name, fields) => target.dispatchEvent(Object.assign(new Event(name), fields));

function setup(actions = {}, document = new EventTarget()) {
  const window = { Shopify: { actions: {
    getCart: async () => result(0),
    updateCart: async () => result(1),
    openCart: async () => {},
    ...actions,
  } } };
  const store = createCartStore({ getWindow: () => window, getDocument: () => document });
  store.init();
  return { store, document, window };
}

test('disposal skips queued mutations and prevents later reactive writes', async () => {
  const running = deferred();
  let writes = 0;
  const { store } = setup({ updateCart: () => { writes++; return running.promise; } });
  await nextTurn();
  const before = store.cart;
  const first = store.add({ merchandiseId: '1', quantity: 1 });
  const second = store.add({ merchandiseId: '2', quantity: 1 });
  const rejected = assert.rejects(second, /disposed/);
  await nextTurn();
  assert.equal(writes, 1);
  store.dispose();
  running.resolve(result(1));
  await first;
  await rejected;
  assert.equal(writes, 1);
  assert.equal(store.pendingCount, 0);
  assert.equal(store.cart, before);
});

test('disposing an in-flight initial read does not set ready after teardown', async () => {
  const reading = deferred();
  const { store } = setup({ getCart: () => reading.promise });
  await nextTurn();
  store.dispose();
  reading.resolve(result(3));
  await nextTurn();
  assert.equal(store.ready, false);
  assert.equal(store.cart, null);
});

test('disposing before DOMContentLoaded cancels initialization and detaches listeners', async () => {
  const document = Object.assign(new EventTarget(), { readyState: 'loading' });
  let reads = 0;
  const { store } = setup({ getCart: async () => { reads++; return result(1); } }, document);
  store.dispose();
  document.readyState = 'interactive';
  document.dispatchEvent(new Event('DOMContentLoaded'));
  emit(document, 'shopify:cart:view', result(4));
  await nextTurn();
  assert.equal(reads, 0);
  assert.equal(store.cart, null);
});

test('interactive documents wait for a late Shopify runtime before the initial read', async () => {
  const document = Object.assign(new EventTarget(), { readyState: 'interactive' });
  const window = { Shopify: {} };
  const store = createCartStore({ getWindow: () => window, getDocument: () => document });
  store.init();
  await nextTurn();
  assert.equal(store.ready, false);
  assert.equal(store.error, null);
  window.Shopify.actions = {
    getCart: async () => result(0), updateCart: async () => result(1), openCart: async () => {},
  };
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await nextTurn();
  assert.equal(store.ready, true);
  assert.equal(store.error, null);
});

test('primitive rejections produce usable error messages', async () => {
  const { store } = setup({ updateCart: async () => { throw 'Connection lost'; } });
  await nextTurn();
  await assert.rejects(store.add({ merchandiseId: '1', quantity: 1 }), error => error === 'Connection lost');
  assert.equal(store.error.name, 'Error');
  assert.equal(store.error.message, 'Connection lost');
  store.dispose();
});

test('mutate preserves clearing inputs, signals, and result metadata', async () => {
  const signal = new AbortController().signal;
  const payload = { note: '', attributes: [], discountCodes: [] };
  const detail = { origin: 'handler' };
  const { store } = setup({ updateCart: async (input, options) => {
    assert.equal(input, payload);
    assert.equal(options.signal, signal);
    return { ...result(0), detail };
  } });
  await nextTurn();
  const response = await store.mutate(payload, { signal });
  assert.equal(store.note, '');
  assert.deepEqual(store.attributes, []);
  assert.deepEqual(store.discountCodes, []);
  assert.equal(store.cost, null);
  assert.equal(store.detail, detail);
  assert.equal(response.detail, detail);
  store.dispose();
});

test('a newer failure does not discard an earlier successful cart update', () => {
  const state = { cart: null, error: null };
  const operations = createCartOperations(() => state);
  const earlier = operations.nextRevision();
  const later = operations.nextRevision();
  operations.applyError(new Error('Second operation failed'), later, 'second');
  operations.applyResult(result(1), earlier);
  assert.equal(state.cart?.totalQuantity, 1);
  assert.equal(state.error.message, 'Second operation failed');
});

test('operation identities cannot collide across store instances', () => {
  const first = createCartOperations(() => ({}));
  const second = createCartOperations(() => ({}));
  assert.notEqual(first.begin('add').id, second.begin('add').id);
});

test('own standard event promises are handled even when distinct from the action promise', async () => {
  const eventRequest = deferred();
  const actionRequest = deferred();
  let target;
  const { store, document } = setup({
    updateCart(payload, options) {
      emit(target, 'shopify:cart:lines-update', {
        action: 'add', promise: eventRequest.promise, detail: options.event.detail,
      });
      return actionRequest.promise;
    },
  });
  target = document;
  await nextTurn();
  const call = store.add({ merchandiseId: '1', quantity: 1 });
  const rejected = assert.rejects(call, /Network failure/);
  await nextTurn();
  assert.equal(store.pendingCount, 1);
  eventRequest.reject(new Error('Event failed'));
  actionRequest.reject(new Error('Network failure'));
  await rejected;
  await nextTurn();
  assert.equal(store.error.message, 'Network failure');
  store.dispose();
});

test('late own events do not reconcile a completed operation again', async () => {
  let options;
  const { store, document } = setup({
    async updateCart(payload, value) { options = value; return result(1); },
  });
  await nextTurn();
  await store.add({ merchandiseId: '1', quantity: 1 });
  emit(document, 'shopify:cart:view', result(2));
  emit(document, 'shopify:cart:lines-update', {
    action: 'add', promise: Promise.resolve(result(1)), detail: options.event.detail,
  });
  await nextTurn();
  assert.equal(store.totalQuantity, 2);
  store.dispose();
});

test('event cleanup uses the original target even if the document getter changes', () => {
  const first = new EventTarget();
  let current = first;
  const state = {};
  const operations = createCartOperations(() => state);
  const events = createCartEvents(() => current, () => state, operations);
  events.attach();
  current = new EventTarget();
  events.detach();
  emit(first, 'shopify:cart:view', result(8));
  assert.equal(state.cart, undefined);
});

test('other stores do not mistake a remote operation marker for their own', async () => {
  const state = {};
  const remote = createCartOperations(() => ({}));
  const local = createCartOperations(() => state);
  const target = new EventTarget();
  const events = createCartEvents(() => target, () => state, local);
  events.attach();
  const localOperation = local.begin('add');
  const remoteOperation = remote.begin('add');
  emit(target, 'shopify:cart:lines-update', {
    action: 'add', promise: Promise.resolve(result(4)),
    detail: { [OPERATION_DETAIL_KEY]: remoteOperation.id },
  });
  await nextTurn();
  assert.equal(state.cart?.totalQuantity, 4);
  local.finish(localOperation.id);
  events.detach();
});

test('an unavailable runtime fails clearly after document completion and can be retried', async () => {
  const document = Object.assign(new EventTarget(), { readyState: 'interactive' });
  const window = {};
  const store = createCartStore({ getWindow: () => window, getDocument: () => document });
  store.init();
  document.readyState = 'complete';
  document.dispatchEvent(new Event('readystatechange'));
  await nextTurn();
  assert.equal(store.ready, true);
  assert.match(store.error.message, /actions are unavailable/);
  window.Shopify = { actions: {
    getCart: async () => result(5), updateCart: async () => result(5), openCart: async () => {},
  } };
  await store.refresh();
  assert.equal(store.error, null);
  assert.equal(store.totalQuantity, 5);
  store.dispose();
});

test('changing cart identities clears metadata belonging to the previous cart', async () => {
  const { store, document } = setup();
  await nextTurn();
  await store.setNote('Old cart note');
  await store.setAttributes([{ key: 'old', value: 'value' }]);
  emit(document, 'shopify:cart:view', { cart: { ...result(0).cart, id: 'cart-2' } });
  assert.equal(store.note, undefined);
  assert.equal(store.attributes, undefined);
  store.dispose();
});

test('user errors do not apply rejected note and attribute inputs', async () => {
  const { store } = setup({ updateCart: async () => ({ ...result(0), userErrors: [{ message: 'Rejected' }] }) });
  await nextTurn();
  await store.setNote('Rejected note');
  await store.setAttributes([{ key: 'rejected', value: 'value' }]);
  assert.equal(store.note, undefined);
  assert.equal(store.attributes, undefined);
  assert.deepEqual(store.userErrors, [{ message: 'Rejected' }]);
  store.dispose();
});

test('a late own error event cannot replace a newer operation outcome', async () => {
  let marker;
  const { store, document } = setup({ updateCart: async (payload, options) => {
    marker = options.event.detail;
    return result(1);
  } });
  await nextTurn();
  await store.add({ merchandiseId: '1', quantity: 1 });
  emit(document, 'shopify:cart:view', result(2));
  emit(document, 'shopify:cart:error', { error: 'Late failure', code: 'SERVICE_UNAVAILABLE', detail: marker });
  assert.equal(store.error, null);
  assert.equal(store.totalQuantity, 2);
  store.dispose();
});
