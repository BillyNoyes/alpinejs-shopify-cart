import plugin, {
  createPlugin,
  type AlpineInstance,
  type ShopifyActions,
  type ShopifyCartStore,
  type UpdateCartResult,
} from 'alpinejs-shopify-cart';

declare const Alpine: AlpineInstance;
declare const actions: ShopifyActions;
declare const cart: ShopifyCartStore;

plugin(Alpine);
createPlugin()(Alpine);
createPlugin({
  getWindow: () => ({ Shopify: { actions } }),
  getDocument: () => new EventTarget(),
})(Alpine);

// @ts-expect-error Alpine registration requires store and magic methods.
plugin({});
// @ts-expect-error Cart actions must return the standard result, not a primitive.
createPlugin({ getWindow: () => ({ Shopify: { actions: { getCart: async () => 1 } } }) });

const result: Promise<UpdateCartResult> = cart.add(
  {
    merchandiseId: 123,
    quantity: 1,
    attributes: [{ key: 'Gift wrap', value: 'Yes' }],
  },
  {
    context: 'product',
    detail: { source: 'product-form' },
  },
);

cart.update({ id: 'gid://shopify/CartLine/1', quantity: 2 });
cart.remove('gid://shopify/CartLine/1');
cart.setNote('Gift order');
cart.setAttributes([{ key: 'Gift wrap', value: 'Yes' }]);
cart.setDiscountCodes(['WELCOME10']);
cart.refresh({ signal: new AbortController().signal });
cart.open();

void result;
