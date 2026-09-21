import { MUTATION_EVENTS, OPERATION_DETAIL_KEY } from './constants.js';

function eventOperationType(event) {
  if (event.type === 'shopify:cart:lines-update') {
    return `external:${event.action ?? 'lines'}`;
  }

  return `external:${event.type.replace('shopify:cart:', '').replace('-update', '')}`;
}

export function createCartEvents(getDocument, getStore, operations) {
  const listeners = new Map();

  const updateLocalEventState = (event, result) => {
    if ((result.userErrors?.length ?? 0) > 0) return;

    const store = getStore();
    if (event.type === 'shopify:cart:note-update') store.note = event.note;
    if (event.type === 'shopify:cart:attributes-update') store.attributes = event.attributes;
  };

  const handleMutationEvent = (event) => {
    const operationId = event.detail?.[OPERATION_DETAIL_KEY];

    if (operationId && operations.get(operationId)) return;
    if (!event.promise || typeof event.promise.then !== 'function') return;

    const operation = operations.begin(eventOperationType(event));
    operation.revision = operations.nextRevision();
    operations.clearMessages();

    Promise.resolve(event.promise)
      .then((result) =>
        operations.applyResult(result, operation.revision, () => updateLocalEventState(event, result)),
      )
      .catch((error) => operations.applyError(error, operation.revision, operation.id))
      .finally(() => operations.finish(operation.id));
  };

  const handleErrorEvent = (event) => {
    const operationId = event.detail?.[OPERATION_DETAIL_KEY];
    const operation = operationId ? operations.get(operationId) : undefined;
    const eventRevision = operation?.revision ?? operations.nextRevision();

    operations.applyError(
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

      target.addEventListener('shopify:cart:error', handleErrorEvent);
      listeners.set('shopify:cart:error', handleErrorEvent);

      target.addEventListener('shopify:cart:view', handleViewEvent);
      listeners.set('shopify:cart:view', handleViewEvent);
    },

    detach() {
      const target = getDocument();

      listeners.forEach((listener, eventName) => {
        target?.removeEventListener?.(eventName, listener);
      });

      listeners.clear();
    },
  };
}
