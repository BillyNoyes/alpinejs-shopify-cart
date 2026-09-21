/*! Alpine.js Shopify Cart v0.1.0 | MIT License */
"use strict";
(() => {
  // src/constants.js
  var STORE_NAME = "shopifyCart";
  var OPERATION_DETAIL_KEY = "alpineShopifyCartOperationId";
  var MUTATION_EVENTS = Object.freeze([
    "shopify:cart:lines-update",
    "shopify:cart:note-update",
    "shopify:cart:attributes-update",
    "shopify:cart:discount-update"
  ]);
  var ALL_EVENTS = Object.freeze([
    ...MUTATION_EVENTS,
    "shopify:cart:error",
    "shopify:cart:view"
  ]);

  // src/actions.js
  function compactObject(value) {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0)
    );
  }
  function actionOptions(options, operationId) {
    const event = {
      ...options.event ?? {},
      ...compactObject({ context: options.context }),
      detail: {
        ...options.event?.detail ?? {},
        ...options.detail ?? {},
        [OPERATION_DETAIL_KEY]: operationId
      }
    };
    return compactObject({ signal: options.signal, event });
  }
  function createActionsAdapter(getWindow) {
    const getActions = () => {
      const actions = getWindow()?.Shopify?.actions;
      if (!actions || typeof actions.getCart !== "function" || typeof actions.updateCart !== "function" || typeof actions.openCart !== "function") {
        throw new Error(
          "Shopify standard storefront actions are unavailable. Use this plugin on a Shopify Liquid storefront after DOMContentLoaded."
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
      }
    };
  }

  // src/events.js
  function eventOperationType(event) {
    if (event.type === "shopify:cart:lines-update") {
      return `external:${event.action ?? "lines"}`;
    }
    return `external:${event.type.replace("shopify:cart:", "").replace("-update", "")}`;
  }
  function createCartEvents(getDocument, getStore, operations) {
    const listeners = /* @__PURE__ */ new Map();
    const updateLocalEventState = (event, result) => {
      if ((result.userErrors?.length ?? 0) > 0) return;
      const store = getStore();
      if (event.type === "shopify:cart:note-update") store.note = event.note;
      if (event.type === "shopify:cart:attributes-update") store.attributes = event.attributes;
    };
    const handleMutationEvent = (event) => {
      const operationId = event.detail?.[OPERATION_DETAIL_KEY];
      if (operationId && operations.get(operationId)) return;
      if (!event.promise || typeof event.promise.then !== "function") return;
      const operation = operations.begin(eventOperationType(event));
      operation.revision = operations.nextRevision();
      operations.clearMessages();
      Promise.resolve(event.promise).then(
        (result) => operations.applyResult(result, operation.revision, () => updateLocalEventState(event, result))
      ).catch((error) => operations.applyError(error, operation.revision, operation.id)).finally(() => operations.finish(operation.id));
    };
    const handleErrorEvent = (event) => {
      const operationId = event.detail?.[OPERATION_DETAIL_KEY];
      const operation = operationId ? operations.get(operationId) : void 0;
      const eventRevision = operation?.revision ?? operations.nextRevision();
      operations.applyError(
        {
          name: "ShopifyCartError",
          message: event.error,
          code: event.code,
          detail: event.detail
        },
        eventRevision,
        operationId
      );
    };
    const handleViewEvent = (event) => {
      const eventRevision = operations.nextRevision();
      operations.applyResult({ cart: event.cart }, eventRevision);
    };
    return {
      attach() {
        const target = getDocument();
        if (!target?.addEventListener) return;
        MUTATION_EVENTS.forEach((eventName) => {
          target.addEventListener(eventName, handleMutationEvent);
          listeners.set(eventName, handleMutationEvent);
        });
        target.addEventListener("shopify:cart:error", handleErrorEvent);
        listeners.set("shopify:cart:error", handleErrorEvent);
        target.addEventListener("shopify:cart:view", handleViewEvent);
        listeners.set("shopify:cart:view", handleViewEvent);
      },
      detach() {
        const target = getDocument();
        listeners.forEach((listener, eventName) => {
          target?.removeEventListener?.(eventName, listener);
        });
        listeners.clear();
      }
    };
  }

  // src/operations.js
  function normalizeError(error, operationId) {
    if (error && typeof error === "object") {
      return {
        name: error.name ?? "Error",
        message: error.message ?? String(error),
        code: error.code,
        detail: error.detail,
        operationId,
        cause: error
      };
    }
    return {
      name: "Error",
      message: String(error),
      code: void 0,
      detail: void 0,
      operationId,
      cause: error
    };
  }
  function createCartOperations(getStore) {
    const operations = /* @__PURE__ */ new Map();
    let disposed = false;
    let operationNumber = 0;
    let revision = 0;
    let appliedRevision = 0;
    let queue = Promise.resolve();
    const nextRevision = () => ++revision;
    const syncPendingState = () => {
      const store = getStore();
      if (!store) return;
      const pending = Array.from(operations.values());
      store.pendingCount = pending.length;
      store.pendingOperation = pending.at(-1)?.type ?? null;
    };
    const begin = (type, id = `cart-operation-${++operationNumber}`) => {
      const operation = { id, type, revision: void 0 };
      operations.set(id, operation);
      syncPendingState();
      return operation;
    };
    const finish = (id) => {
      operations.delete(id);
      syncPendingState();
    };
    const clearMessages = () => {
      const store = getStore();
      store.error = null;
      store.userErrors = [];
      store.warnings = [];
    };
    const applyResult = (result, resultRevision, onSuccess) => {
      if (disposed || !result || resultRevision < appliedRevision) return result;
      const store = getStore();
      appliedRevision = resultRevision;
      if (Object.prototype.hasOwnProperty.call(result, "cart")) {
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
      const store = getStore();
      appliedRevision = resultRevision;
      if (operationId && store.error?.operationId === operationId) return;
      store.error = normalizeError(error, operationId);
    };
    const enqueue = (type, callback) => {
      if (disposed) {
        return Promise.reject(new Error("The Alpine Shopify cart store has been disposed."));
      }
      const operation = begin(type);
      const task = queue.then(async () => {
        operation.revision = nextRevision();
        clearMessages();
        try {
          return await callback(operation);
        } catch (error) {
          applyError(error, operation.revision, operation.id);
          throw error;
        }
      });
      queue = task.catch(() => {
      });
      return task.finally(() => finish(operation.id));
    };
    return {
      begin,
      finish,
      clearMessages,
      nextRevision,
      applyResult,
      applyError,
      enqueue,
      get: (id) => operations.get(id),
      get disposed() {
        return disposed;
      },
      dispose() {
        disposed = true;
        operations.clear();
        syncPendingState();
      }
    };
  }

  // src/store.js
  function normalizeLines(lines) {
    return Array.isArray(lines) ? lines : [lines];
  }
  function createCartStore({ getWindow, getDocument }) {
    const adapter = createActionsAdapter(getWindow);
    let store;
    let initialized = false;
    let removeReadyListener = () => {
    };
    const operations = createCartOperations(() => store);
    const events = createCartEvents(getDocument, () => store, operations);
    const runUpdate = (type, payload, options = {}, onSuccess) => operations.enqueue(type, async (operation) => {
      const result = await adapter.updateCart(
        payload,
        actionOptions(options, operation.id)
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
          removeReadyListener = () => {
          };
          if (!operations.disposed) store.refresh().catch(() => {
          });
        }, 0);
        removeReadyListener = () => clearTimeout(timer);
      };
      const target = getDocument();
      if (target?.readyState === "loading") {
        target.addEventListener("DOMContentLoaded", refresh, { once: true });
        removeReadyListener = () => target.removeEventListener("DOMContentLoaded", refresh);
      } else {
        refresh();
      }
    };
    return {
      ready: false,
      cart: null,
      note: void 0,
      attributes: void 0,
      pendingCount: 0,
      pendingOperation: null,
      error: null,
      userErrors: [],
      warnings: [],
      detail: void 0,
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
        return operations.enqueue("refresh", async (operation) => {
          try {
            const result = await adapter.getCart(payload, requestOptions);
            return operations.applyResult(result, operation.revision);
          } finally {
            this.ready = true;
          }
        });
      },
      mutate(payload, options = {}) {
        return runUpdate("update", payload, options, () => {
          if (Object.prototype.hasOwnProperty.call(payload, "note")) this.note = payload.note;
          if (Object.prototype.hasOwnProperty.call(payload, "attributes")) this.attributes = payload.attributes;
        });
      },
      add(lines, options = {}) {
        return runUpdate("add", { lines: normalizeLines(lines) }, options);
      },
      update(lines, options = {}) {
        return runUpdate("update", { lines: normalizeLines(lines) }, options);
      },
      remove(lineIds, options = {}) {
        const lines = normalizeLines(lineIds).map((id) => ({ id, quantity: 0 }));
        return runUpdate("remove", { lines }, options);
      },
      setNote(note, options = {}) {
        return runUpdate("note", { note }, options, () => {
          this.note = note;
        });
      },
      setAttributes(attributes, options = {}) {
        return runUpdate("attributes", { attributes }, options, () => {
          this.attributes = attributes;
        });
      },
      setDiscountCodes(discountCodes, options = {}) {
        return runUpdate("discounts", { discountCodes }, options);
      },
      open() {
        return operations.enqueue("open", () => adapter.openCart());
      },
      dispose() {
        operations.dispose();
        removeReadyListener();
        events.detach();
      }
    };
  }

  // src/index.js
  function defaultGetWindow() {
    return typeof window === "undefined" ? void 0 : window;
  }
  function defaultGetDocument() {
    return typeof document === "undefined" ? void 0 : document;
  }
  function createPlugin({
    getWindow = defaultGetWindow,
    getDocument = defaultGetDocument
  } = {}) {
    const registeredAlpines = /* @__PURE__ */ new WeakSet();
    return function AlpineShopifyCart2(Alpine) {
      if (registeredAlpines.has(Alpine)) return;
      if (Alpine.store(STORE_NAME) !== void 0) {
        throw new Error(`Alpine store "${STORE_NAME}" is already registered.`);
      }
      registeredAlpines.add(Alpine);
      Alpine.store(STORE_NAME, createCartStore({ getWindow, getDocument }));
      Alpine.magic("cart", () => Alpine.store(STORE_NAME));
    };
  }
  var AlpineShopifyCart = createPlugin();
  var index_default = AlpineShopifyCart;

  // src/cdn.js
  var REGISTRATION_KEY = "__alpineJsShopifyCartRegistered";
  function register() {
    if (!window.Alpine || window[REGISTRATION_KEY]) return;
    window[REGISTRATION_KEY] = true;
    window.Alpine.plugin(index_default);
  }
  if (typeof window !== "undefined") {
    window.AlpineShopifyCart = index_default;
    if (window.Alpine) {
      register();
    } else {
      document.addEventListener("alpine:init", register, { once: true });
    }
  }
})();
