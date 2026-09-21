import { OPERATION_DETAIL_KEY } from './constants.js';

export function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

export function actionOptions(options, operationId) {
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
}

export function createActionsAdapter(getWindow) {
  const available = (actions) => ['getCart', 'updateCart', 'openCart']
    .every(name => typeof actions?.[name] === 'function');

  const getActions = () => {
    const actions = getWindow()?.Shopify?.actions;

    if (!available(actions)) {
      throw new Error(
        'Shopify standard storefront actions are unavailable. Use this plugin on a Shopify Liquid storefront after DOMContentLoaded.',
      );
    }

    return actions;
  };

  return {
    isReady() {
      return available(getWindow()?.Shopify?.actions);
    },

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
