import { STORE_NAME } from './constants.js';
import { createCartStore } from './store.js';

function defaultGetWindow() {
  return typeof window === 'undefined' ? undefined : window;
}

function defaultGetDocument() {
  return typeof document === 'undefined' ? undefined : document;
}

/** @param {import('../index').PluginEnvironment} [environment] */
export function createPlugin({
  getWindow = defaultGetWindow,
  getDocument = defaultGetDocument,
} = {}) {
  const registeredAlpines = new WeakSet();

  return function AlpineShopifyCart(Alpine) {
    if (registeredAlpines.has(Alpine)) return;

    if (Alpine.store(STORE_NAME) !== undefined) {
      throw new Error(`Alpine store "${STORE_NAME}" is already registered.`);
    }

    Alpine.store(STORE_NAME, createCartStore({ getWindow, getDocument }));
    Alpine.magic('cart', () => Alpine.store(STORE_NAME));
    registeredAlpines.add(Alpine);
  };
}

const AlpineShopifyCart = createPlugin();

export { ALL_EVENTS, MUTATION_EVENTS, STORE_NAME } from './constants.js';
export default AlpineShopifyCart;
