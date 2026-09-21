import { STORE_NAME } from './constants.js';
import { createCartStore } from './store.js';

function defaultGetWindow() {
  return typeof window === 'undefined' ? undefined : window;
}

function defaultGetDocument() {
  return typeof document === 'undefined' ? undefined : document;
}

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

    registeredAlpines.add(Alpine);
    Alpine.store(STORE_NAME, createCartStore({ getWindow, getDocument }));
    Alpine.magic('cart', () => Alpine.store(STORE_NAME));
  };
}

const AlpineShopifyCart = createPlugin();

export { ALL_EVENTS, MUTATION_EVENTS, STORE_NAME } from './constants.js';
export default AlpineShopifyCart;
