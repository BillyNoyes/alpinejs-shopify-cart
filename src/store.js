import { actionOptions, compactObject, createActionsAdapter } from './actions.js';
import { createCartEvents } from './events.js';
import { createCartOperations } from './operations.js';

function normalizeLines(lines) {
  return Array.isArray(lines) ? lines : [lines];
}

export function createCartStore({ getWindow, getDocument }) {
  const adapter = createActionsAdapter(getWindow);
  let store;
  let initialized = false;
  let removeReadyListener = () => {};

  // Async callbacks must mutate Alpine's reactive proxy, not the pre-registration object.
  const operations = createCartOperations(() => store);
  const events = createCartEvents(getDocument, () => store, operations);

  const runUpdate = (type, payload, options = {}, onSuccess) =>
    operations.enqueue(type, async (operation) => {
      const result = await adapter.updateCart(
        payload,
        actionOptions(options, operation.id),
      );

      return operations.applyResult(result, operation.revision, onSuccess);
    });

  const initialize = (reactiveStore) => {
    if (initialized) return;

    initialized = true;
    store = reactiveStore;
    events.attach();

    const refresh = () => {
      removeReadyListener();

      const timer = setTimeout(() => {
        removeReadyListener = () => {};
        if (!operations.disposed) store.refresh().catch(() => {});
      }, 0);

      removeReadyListener = () => clearTimeout(timer);
    };

    const target = getDocument();

    if (target?.readyState === 'loading' || (target?.readyState === 'interactive' && !adapter.isReady())) {
      const complete = () => { if (target.readyState === 'complete') refresh(); };
      target.addEventListener('DOMContentLoaded', refresh, { once: true });
      target.addEventListener('readystatechange', complete);
      removeReadyListener = () => {
        target.removeEventListener('DOMContentLoaded', refresh);
        target.removeEventListener('readystatechange', complete);
      };
    } else {
      refresh();
    }
  };

  return {
    ready: false,
    cart: null,
    note: undefined,
    attributes: undefined,
    pendingCount: 0,
    pendingOperation: null,
    error: null,
    userErrors: [],
    warnings: [],
    detail: undefined,

    get lines() {
      const lines = this.cart?.lines;

      if (Array.isArray(lines)) return lines;

      return lines?.nodes ?? [];
    },

    get totalQuantity() {
      return this.cart?.totalQuantity ?? 0;
    },

    get cost() {
      return this.cart?.cost ?? null;
    },

    get discountCodes() {
      return this.cart?.discountCodes ?? [];
    },

    get pending() {
      return this.pendingCount > 0;
    },

    init() {
      initialize(this);
    },

    refresh(options = {}) {
      const payload = compactObject({ cartId: options.cartId });
      const requestOptions = compactObject({ signal: options.signal });

      return operations.enqueue('refresh', async (operation) => {
        try {
          const result = await adapter.getCart(payload, requestOptions);
          return operations.applyResult(result, operation.revision);
        } finally {
          if (!operations.disposed) this.ready = true;
        }
      });
    },

    mutate(payload, options = {}) {
      return runUpdate('update', payload, options, () => {
        if (Object.prototype.hasOwnProperty.call(payload, 'note')) this.note = payload.note;
        if (Object.prototype.hasOwnProperty.call(payload, 'attributes')) this.attributes = payload.attributes;
      });
    },

    add(lines, options = {}) {
      return runUpdate('add', { lines: normalizeLines(lines) }, options);
    },

    update(lines, options = {}) {
      return runUpdate('update', { lines: normalizeLines(lines) }, options);
    },

    remove(lineIds, options = {}) {
      const lines = normalizeLines(lineIds).map((id) => ({ id, quantity: 0 }));
      return runUpdate('remove', { lines }, options);
    },

    setNote(note, options = {}) {
      return runUpdate('note', { note }, options, () => {
        this.note = note;
      });
    },

    setAttributes(attributes, options = {}) {
      return runUpdate('attributes', { attributes }, options, () => {
        this.attributes = attributes;
      });
    },

    setDiscountCodes(discountCodes, options = {}) {
      return runUpdate('discounts', { discountCodes }, options);
    },

    open() {
      return operations.enqueue('open', () => adapter.openCart());
    },

    dispose() {
      operations.dispose();
      removeReadyListener();
      events.detach();
    },
  };
}
