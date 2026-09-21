import plugin, {
  createPlugin,
  type ShopifyCartStore,
  type UpdateCartResult,
} from 'alpinejs-shopify-cart';

declare const Alpine: unknown;
declare const cart: ShopifyCartStore;

plugin(Alpine);
createPlugin()(Alpine);

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
