import { createPlugin } from '../../src/index.js';
import type { Alpine } from 'alpinejs';
import type { CartOperationOptions, UpdateCartPayload, ShopifyCartStore } from '../../index';

export function installDemo(Alpine: Alpine) {
  let quantity = 0;
  const target = new EventTarget();
  const snapshot = () => ({
    cart: {
      id: 'demo-cart',
      totalQuantity: quantity,
      cost: { totalAmount: { amount: (quantity * 24).toFixed(2), currencyCode: 'GBP' } },
      lines: quantity ? [{
        id: 'demo-line', quantity,
        cost: { totalAmount: { amount: (quantity * 24).toFixed(2), currencyCode: 'GBP' } },
      }] : [],
      discountCodes: [],
    },
  });
  const actions = {
    async getCart() { return snapshot(); },
    async updateCart(payload: UpdateCartPayload, options: CartOperationOptions = {}) {
      const line = payload.lines?.[0];
      if (!line) throw new Error('Choose a cart operation.');
      const next = line.id ? line.quantity : quantity + line.quantity;
      let settle!: (value: ReturnType<typeof snapshot>) => void;
      const promise = new Promise<ReturnType<typeof snapshot>>(resolve => { settle = resolve; });
      target.dispatchEvent(Object.assign(new Event('shopify:cart:lines-update'), {
        action: line.id ? (next === 0 ? 'remove' : 'update') : 'add',
        context: 'product', lines: [line], promise, detail: options.event?.detail,
      }));
      await new Promise(resolve => setTimeout(resolve, 180));
      quantity = Math.max(0, Math.min(9, next));
      const result = snapshot();
      settle(result);
      return result;
    },
    async openCart() {},
  };

  // Only the transport is simulated; the demo exercises the package's actual store and magic.
  Alpine.plugin(createPlugin({
    getWindow: () => ({ Shopify: { actions } }) as unknown as Window & typeof globalThis,
    getDocument: () => target as unknown as Document,
  }));

  Alpine.data('cartDemo', () => ({
    action: 'add',
    message: '',
    get snippet() {
      const snippets: Record<string, string> = {
        add: '<button\n  @click="$cart.add({\n    merchandiseId: variantId, quantity: 1\n  })"\n>Add to cart</button>',
        update: '<button\n  @click="$cart.update({\n    id: line.id, quantity: line.quantity + 1\n  })"\n>Increase quantity</button>',
        remove: '<button\n  @click="$cart.remove(line.id)"\n>Remove from cart</button>',
      };
      return snippets[this.action];
    },
    get label() {
      return this.action === 'add' ? 'Add to cart' : this.action === 'update' ? 'Increase quantity' : 'Remove item';
    },
    get disabled() {
      const store = Alpine.store('shopifyCart') as ShopifyCartStore;
      return !store.ready || store.pending ||
        (this.action !== 'add' && store.totalQuantity === 0) ||
        (this.action !== 'remove' && store.totalQuantity >= 9);
    },
    async run() {
      const store = Alpine.store('shopifyCart') as ShopifyCartStore;
      if (this.disabled) return;
      this.message = 'Updating the local cart…';
      try {
        if (this.action === 'add') await store.add({ merchandiseId: 'demo-variant', quantity: 1 });
        else if (this.action === 'update') await store.update({ id: 'demo-line', quantity: store.totalQuantity + 1 });
        else await store.remove('demo-line');
        this.message = store.totalQuantity ? 'Cart updated. Every Alpine consumer has the same state.' : 'Item removed. The cart is empty.';
      } catch {
        this.message = 'The demo could not update. Reload the page and try again.';
      }
    },
    destroy() { (Alpine.store('shopifyCart') as ShopifyCartStore).dispose(); },
  }));
}
