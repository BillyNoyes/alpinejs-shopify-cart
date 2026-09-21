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

export function createCartOperations(getStore) {
  const operations = new Map();
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
      return Promise.reject(new Error('The Alpine Shopify cart store has been disposed.'));
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
    get disposed() { return disposed; },
    dispose() {
      disposed = true;
      operations.clear();
      syncPendingState();
    },
  };
}
