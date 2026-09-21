const STORE_NAME = 'shopifyCart';
const OPERATION_DETAIL_KEY = 'alpineShopifyCartOperationId';

const MUTATION_EVENTS = Object.freeze([
  'shopify:cart:lines-update',
  'shopify:cart:note-update',
  'shopify:cart:attributes-update',
  'shopify:cart:discount-update',
]);

const ALL_EVENTS = Object.freeze([
  ...MUTATION_EVENTS,
  'shopify:cart:error',
  'shopify:cart:view',
]);

function defaultGetWindow() {
  return typeof window === 'undefined' ? undefined : window;
}

function defaultGetDocument() {
  return typeof document === 'undefined' ? undefined : document;
}

function normalizeError(error, operationId) {
  if (error && typeof error === 'object') {
    return {
      name: error.name ?? 'Error',
      message: error.message ?? String(error),
      code: error.code,
      detail: error.detail,
      operationId,
      cause: error,
    };
  }

  return {
    name: 'Error',
    message: String(error),
    code: undefined,
    detail: undefined,
    operationId,
    cause: error,
  };
}

function normalizeLines(lines) {
  return Array.isArray(lines) ? lines : [lines];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function createActionsAdapter(getWindow) {
  const getActions = () => {
    const actions = getWindow()?.Shopify?.actions;

    if (
      !actions ||
      typeof actions.getCart !== 'function' ||
      typeof actions.updateCart !== 'function' ||
      typeof actions.openCart !== 'function'
    ) {
      throw new Error(
        'Shopify standard storefront actions are unavailable. Use this plugin on a Shopify Liquid storefront after DOMContentLoaded.',
      );
    }

    return actions;
  };

  return {
    getCart(payload, options) {
      return getActions().getCart(payload, options);
    },

    updateCart(payload, options) {
      return getActions().updateCart(payload, options);
    },

    openCart() {
      return getActions().openCart();
    },
  };
}

function createCartStore({ getWindow, getDocument }) {
  const adapter = createActionsAdapter(getWindow);
  const operations = new Map();
  const listeners = new Map();
  let store;
  let initialized = false;
  let disposed = false;
  let operationNumber = 0;
  let revision = 0;
  let appliedRevision = 0;
  let queue = Promise.resolve();
  let removeReadyListener = () => {};

  const beginOperation = (type, id = `cart-operation-${++operationNumber}`) => {
    const operation = { id, type, revision: undefined };
    operations.set(id, operation);
    syncPendingState();
    return operation;
  };

  const syncPendingState = () => {
    if (!store) return;

    const pending = Array.from(operations.values());
    store.pendingCount = pending.length;
    store.pendingOperation = pending.at(-1)?.type ?? null;
  };

  const finishOperation = (id) => {
    operations.delete(id);
    syncPendingState();
  };

  const clearMessages = () => {
    store.error = null;
    store.userErrors = [];
    store.warnings = [];
  };

  const applyResult = (result, resultRevision, onSuccess) => {
    if (disposed || !result || resultRevision < appliedRevision) return result;

    appliedRevision = resultRevision;

    if (Object.prototype.hasOwnProperty.call(result, 'cart')) {
      store.cart = result.cart;
    }

    store.userErrors = result.userErrors ?? [];
    store.warnings = result.warnings ?? [];
    store.detail = result.detail;
    store.error = null;

    if (store.userErrors.length === 0) onSuccess?.(result);

    return result;
  };

  const applyError = (error, resultRevision, operationId) => {
    if (disposed || resultRevision < appliedRevision) return;

    appliedRevision = resultRevision;

    if (operationId && store.error?.operationId === operationId) return;

    store.error = normalizeError(error, operationId);
  };

  const enqueue = (type, callback) => {
    if (disposed) {
      return Promise.reject(new Error('The Alpine Shopify cart store has been disposed.'));
    }

    const operation = beginOperation(type);
    const task = queue.then(async () => {
      operation.revision = ++revision;
      clearMessages();

      try {
        return await callback(operation);
      } catch (error) {
        applyError(error, operation.revision, operation.id);
        throw error;
      }
    });

    queue = task.catch(() => {});

    return task.finally(() => finishOperation(operation.id));
  };

  const actionOptions = (options, operationId) => {
    const event = {
      ...(options.event ?? {}),
      ...compactObject({ context: options.context }),
      detail: {
        ...(options.event?.detail ?? {}),
        ...(options.detail ?? {}),
        [OPERATION_DETAIL_KEY]: operationId,
      },
    };

    return compactObject({ signal: options.signal, event });
  };

  const runUpdate = (type, payload, options = {}, onSuccess) =>
    enqueue(type, async (operation) => {
      const result = await adapter.updateCart(
        payload,
        actionOptions(options, operation.id),
      );

      return applyResult(result, operation.revision, onSuccess);
    });

  const eventOperationType = (event) => {
    if (event.type === 'shopify:cart:lines-update') {
      return `external:${event.action ?? 'lines'}`;
    }

    return `external:${event.type.replace('shopify:cart:', '').replace('-update', '')}`;
  };

  const updateLocalEventState = (event, result) => {
    if ((result.userErrors?.length ?? 0) > 0) return;

    if (event.type === 'shopify:cart:note-update') store.note = event.note;
    if (event.type === 'shopify:cart:attributes-update') store.attributes = event.attributes;
  };

  const handleMutationEvent = (event) => {
    const operationId = event.detail?.[OPERATION_DETAIL_KEY];

    if (operationId && operations.has(operationId)) return;
    if (!event.promise || typeof event.promise.then !== 'function') return;

    const operation = beginOperation(eventOperationType(event));
    operation.revision = ++revision;
    clearMessages();

    Promise.resolve(event.promise)
      .then((result) =>
        applyResult(result, operation.revision, () => updateLocalEventState(event, result)),
      )
      .catch((error) => applyError(error, operation.revision, operation.id))
      .finally(() => finishOperation(operation.id));
  };

  const handleErrorEvent = (event) => {
    const operationId = event.detail?.[OPERATION_DETAIL_KEY];
    const operation = operationId ? operations.get(operationId) : undefined;
    const eventRevision = operation?.revision ?? ++revision;

    applyError(
      {
        name: 'ShopifyCartError',
        message: event.error,
        code: event.code,
        detail: event.detail,
      },
      eventRevision,
      operationId,
    );
  };

  const handleViewEvent = (event) => {
    const eventRevision = ++revision;

    applyResult({ cart: event.cart }, eventRevision);
  };

  const attachListeners = () => {
    const target = getDocument();
    if (!target?.addEventListener) return;

    MUTATION_EVENTS.forEach((eventName) => {
      target.addEventListener(eventName, handleMutationEvent);
      listeners.set(eventName, handleMutationEvent);
    });

    target.addEventListener('shopify:cart:error', handleErrorEvent);
    listeners.set('shopify:cart:error', handleErrorEvent);

    target.addEventListener('shopify:cart:view', handleViewEvent);
    listeners.set('shopify:cart:view', handleViewEvent);
  };

  const detachListeners = () => {
    const target = getDocument();

    listeners.forEach((listener, eventName) => {
      target?.removeEventListener?.(eventName, listener);
    });

    listeners.clear();
  };

  const initialize = (reactiveStore) => {
    if (initialized) return;

    initialized = true;
    store = reactiveStore;
    attachListeners();

    const refresh = () => {
      removeReadyListener();
      removeReadyListener = () => {};
      store.refresh().catch(() => {});
    };

    const target = getDocument();

    if (target?.readyState === 'loading') {
      target.addEventListener('DOMContentLoaded', refresh, { once: true });
      removeReadyListener = () => target.removeEventListener('DOMContentLoaded', refresh);
    } else {
      queueMicrotask(refresh);
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
      return this.cart?.lines ?? [];
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

      return enqueue('refresh', async (operation) => {
        try {
          const result = await adapter.getCart(payload, requestOptions);
          return applyResult(result, operation.revision);
        } finally {
          this.ready = true;
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
      return enqueue('open', () => adapter.openCart());
    },

    dispose() {
      disposed = true;
      removeReadyListener();
      detachListeners();
      operations.clear();
      syncPendingState();
    },
  };
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

export { ALL_EVENTS, MUTATION_EVENTS, STORE_NAME };
export default AlpineShopifyCart;
