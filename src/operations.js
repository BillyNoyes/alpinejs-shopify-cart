function normalizeError(error, operationId) {
  const source = error && typeof error === 'object' ? error : {};

  return {
    name: source.name ?? 'Error',
    message: source.message ?? String(error),
    code: source.code,
    detail: source.detail,
    operationId,
    cause: error,
  };
}

export function createCartOperations(getStore) {
  const operations = new Map();
  const instanceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const operationPrefix = `cart-operation-${instanceId}-`;
  let disposed = false;
  let operationNumber = 0;
  let revision = 0;
  let appliedRevision = 0;
  let messageRevision = 0;
  let queue = Promise.resolve();

  const nextRevision = () => ++revision;

  const syncPendingState = () => {
    const store = getStore();
    if (!store) return;

    const pending = Array.from(operations.values());
    store.pendingCount = pending.length;
    store.pendingOperation = pending.at(-1)?.type ?? null;
  };

  const begin = (type, id = `${operationPrefix}${++operationNumber}`) => {
    const operation = { id, type, revision: undefined };
    operations.set(id, operation);
    syncPendingState();
    return operation;
  };

  const finish = (id) => {
    operations.delete(id);
    syncPendingState();
  };

  const clearMessages = () => {
    messageRevision = revision;
    const store = getStore();
    store.error = null;
    store.userErrors = [];
    store.warnings = [];
  };

  const applyResult = (result, resultRevision, onSuccess) => {
    if (disposed || !result || resultRevision < appliedRevision) return result;

    const store = getStore();
    appliedRevision = resultRevision;

    if (Object.prototype.hasOwnProperty.call(result, 'cart')) {
      if (store.cart?.id !== result.cart?.id) {
        store.note = undefined;
        store.attributes = undefined;
      }
      store.cart = result.cart;
    }

    if (resultRevision >= messageRevision) {
      messageRevision = resultRevision;
      store.userErrors = result.userErrors ?? [];
      store.warnings = result.warnings ?? [];
      store.detail = result.detail;
      store.error = null;
    }

    if (!result.userErrors?.length) onSuccess?.(result);

    return result;
  };

  const applyError = (error, resultRevision, operationId) => {
    if (disposed || resultRevision < messageRevision) return;

    const store = getStore();
    // A failed operation can update diagnostics without invalidating an earlier successful cart response.
    messageRevision = resultRevision;

    if (operationId && store.error?.operationId === operationId) return;

    store.error = normalizeError(error, operationId);
  };

  const enqueue = (type, callback) => {
    if (disposed) {
      return Promise.reject(new Error('The Alpine Shopify cart store has been disposed.'));
    }

    const operation = begin(type);
    const task = queue.then(async () => {
      if (disposed) throw new Error('The Alpine Shopify cart store has been disposed.');

      operation.revision = nextRevision();
      clearMessages();

      try {
        return await callback(operation);
      } catch (error) {
        applyError(error, operation.revision, operation.id);
        throw error;
      }
    });

    queue = task.catch(() => {});

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
    owns: (id) => typeof id === 'string' && id.startsWith(operationPrefix),
    get disposed() { return disposed; },
    dispose() {
      disposed = true;
      operations.clear();
      syncPendingState();
    },
  };
}
