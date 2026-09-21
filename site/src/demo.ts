import { createPlugin } from '../../src/index.js';
import type { Alpine } from 'alpinejs';
import type { CartAttributeInput, CartOperationOptions, UpdateCartPayload, ShopifyCartStore } from '../../index';

interface DemoLine {
  id: string;
  quantity: number;
  attributes: CartAttributeInput[];
}

type DemoAction = 'add' | 'update' | 'properties' | 'remove';

export function installDemo(Alpine: Alpine) {
  let lines: DemoLine[] = [];
  let nextId = 0;
  const target = new EventTarget();
  const totalQuantity = () => lines.reduce((total, line) => total + line.quantity, 0);
  const sameAttributes = (left: CartAttributeInput[], right: CartAttributeInput[]) =>
    JSON.stringify(left) === JSON.stringify(right);
  const snapshot = () => ({
    cart: {
      id: 'demo-cart',
      totalQuantity: totalQuantity(),
      cost: { totalAmount: { amount: (totalQuantity() * 24).toFixed(2), currencyCode: 'GBP' } },
      lines: lines.map(({ id, quantity }) => ({
        id, quantity,
        cost: { totalAmount: { amount: (quantity * 24).toFixed(2), currencyCode: 'GBP' } },
      })),
      discountCodes: [],
    },
  });
  const actions = {
    async getCart() { return snapshot(); },
    async updateCart(payload: UpdateCartPayload, options: CartOperationOptions = {}) {
      const input = payload.lines?.[0];
      if (!input) throw new Error('Choose a cart operation.');
      const existing = input.id ? lines.find(line => line.id === input.id) : undefined;
      if (input.id && !existing) throw new Error('That example line no longer exists.');
      let settle!: (value: ReturnType<typeof snapshot>) => void;
      const promise = new Promise<ReturnType<typeof snapshot>>(resolve => { settle = resolve; });
      target.dispatchEvent(Object.assign(new Event('shopify:cart:lines-update'), {
        action: input.id ? (input.quantity === 0 ? 'remove' : 'update') : 'add',
        context: 'product', lines: [input], promise, detail: options.event?.detail,
      }));
      await new Promise(resolve => setTimeout(resolve, 180));

      const attributes = (input.attributes ?? existing?.attributes ?? []).map(attribute => ({ ...attribute }));
      if (existing) {
        existing.quantity = input.quantity;
        existing.attributes = attributes;
      } else {
        const matching = lines.find(line => sameAttributes(line.attributes, attributes));
        if (matching) matching.quantity += input.quantity;
        else lines.push({ id: `demo-line-${++nextId}`, quantity: input.quantity, attributes });
      }
      lines = lines.filter(line => line.quantity > 0);
      if (lines.length === 2 && sameAttributes(lines[0].attributes, lines[1].attributes)) {
        lines[0].quantity += lines[1].quantity;
        lines.pop();
      }
      const result = snapshot();
      settle(result);
      return result;
    },
    async openCart() {},
  };

  // Only the transport is simulated; the demo exercises the package's actual store and magic.
  Alpine.plugin(createPlugin({
    getWindow: () => ({ Shopify: { actions } }),
    getDocument: () => target,
  }));
  const cart = () => Alpine.store('shopifyCart') as ShopifyCartStore;

  Alpine.data('cartDemo', () => ({
    action: 'add' as DemoAction,
    giftWrap: false,
    message: '',
    get snippet() {
      const attributes = this.giftWrap ? "[{ key: 'Gift wrap', value: 'Yes' }]" : '[]';
      const snippets: Record<DemoAction, string> = {
        add: `<button @click="$cart.add({\n  merchandiseId: variantId,\n  quantity: 1,\n  attributes: ${attributes}\n})">Add to cart</button>`,
        update: '<button @click="$cart.update({\n  id: line.id,\n  quantity: line.quantity + 1\n})">Increase quantity</button>',
        properties: `<button @click="$cart.update({\n  id: line.id,\n  quantity: line.quantity,\n  attributes: ${attributes}\n})">Save properties</button>`,
        remove: '<button @click="$cart.remove(line.id)">\n  Remove from cart\n</button>',
      };
      return snippets[this.action];
    },
    get label() {
      return { add: 'Add to cart', update: 'Increase quantity', properties: 'Save properties', remove: 'Remove item' }[this.action];
    },
    get giftWrapCount() {
      // The standard summary omits attributes; the simulator supplies its own product-property data.
      return cart().lines.reduce((total, line) => {
        const properties = lines.find(item => item.id === line.id)?.attributes ?? [];
        return total + (properties.some(attribute => attribute.key === 'Gift wrap' && attribute.value === 'Yes') ? line.quantity : 0);
      }, 0);
    },
    selectAction(action: DemoAction) {
      this.action = action;
      this.message = action === 'add' ? '' : 'This operation applies to the first cart line.';
      if (action === 'properties') {
        const first = lines.find(line => line.id === cart().lines[0]?.id);
        this.giftWrap = first?.attributes.some(attribute => attribute.key === 'Gift wrap' && attribute.value === 'Yes') ?? false;
      }
    },
    get disabled() {
      const store = cart();
      return !store.ready || store.pending ||
        (this.action !== 'add' && store.totalQuantity === 0) ||
        (['add', 'update'].includes(this.action) && store.totalQuantity >= 9);
    },
    async run() {
      const store = cart();
      if (this.disabled) return;
      const action = this.action;
      const attributes = this.giftWrap ? [{ key: 'Gift wrap', value: 'Yes' }] : [];
      const first = store.lines[0];
      this.message = 'Updating the local cart…';
      try {
        if (action === 'add') await store.add({ merchandiseId: 'demo-variant', quantity: 1, attributes });
        else if (action === 'update') await store.update({ id: first.id, quantity: first.quantity + 1 });
        else if (action === 'properties') await store.update({ id: first.id, quantity: first.quantity, attributes });
        else await store.remove(first.id);
        this.message = action === 'properties' ? 'Line-item properties saved.' :
          store.totalQuantity ? 'Cart updated. Every Alpine consumer has the same state.' : 'Item removed. The cart is empty.';
      } catch {
        this.message = 'The demo could not update. Reload the page and try again.';
      }
    },
    destroy() { cart().dispose(); },
  }));
}
