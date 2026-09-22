import { createPlugin } from '../../src/index.js';
import type { Alpine } from 'alpinejs';
import type { ShopifyCartStore, UpdateCartResult } from '../../index';
import { createDemoRuntime } from './demo-runtime';

export function installDemo(Alpine: Alpine) {
  const runtime = createDemoRuntime();
  // Only the transport is simulated; every control uses the package's real store and magic.
  Alpine.plugin(createPlugin({
    getWindow: () => ({ Shopify: { actions: runtime.actions } }),
    getDocument: () => runtime.events,
  }));
  const cart = () => Alpine.store('shopifyCart') as ShopifyCartStore;
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  Alpine.data('cartDemo', (root: HTMLElement) => {
    let disposed = false;
    return {
      item: { merchandiseId: 'demo-variant', quantity: 1 },
      message: '',
      failed: false,
      get lines() {
        return cart().lines.map(line => ({
          ...line,
          giftWrap: runtime.attributes(line.id).some(attribute => attribute.key === 'Gift wrap' && attribute.value === 'Yes'),
        }));
      },
      get disabled() { return !cart().ready || cart().pending; },
      get canAdd() { return !this.disabled && cart().totalQuantity < 9; },
      money(amount: string | undefined) { return formatter.format(Number(amount ?? 0)); },
      async perform(operation: () => Promise<UpdateCartResult>, success: string) {
        if (this.disabled) return;
        const focused = document.activeElement as HTMLElement | null;
        const focusAction = focused?.dataset.cartAction;
        this.message = 'Updating cart…';
        this.failed = false;
        try {
          const result = await operation();
          if (disposed) return;
          this.failed = Boolean(result.userErrors?.length);
          this.message = result.userErrors?.[0]?.message ?? result.warnings?.[0]?.message ??
            (cart().totalQuantity >= 9 ? 'Demo limit reached: 9 items.' : success);
        } catch {
          if (disposed) return;
          this.failed = true;
          this.message = 'Could not update this example. Try again.';
        }
        await Alpine.nextTick();
        if (disposed) return;
        // Removing or merging a line must not strand keyboard focus on the document body.
        if (focused && !focused.isConnected && document.activeElement === document.body) {
          const controls = [...root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-cart-action]')];
          const replacement = controls.find(control => control.dataset.cartAction === focusAction && !control.disabled)
            ?? root.querySelector<HTMLButtonElement>('[data-cart-action="add"]');
          replacement?.focus({ preventScroll: true });
        }
      },
      async add() {
        if (!this.canAdd) return;
        await this.perform(() => cart().add(this.item), 'Canvas tote added.');
      },
      async updateQuantity(id: string, delta: number) {
        if (this.disabled || (delta > 0 && !this.canAdd)) return;
        const line = cart().lines.find(line => line.id === id);
        if (!line) return;
        await this.perform(() => cart().update({ id, quantity: line.quantity + delta }), 'Quantity updated.');
      },
      async wrap(id: string, input: HTMLInputElement) {
        const checked = input.checked;
        const line = cart().lines.find(line => line.id === id);
        if (!line || this.disabled) return;
        await this.perform(() => cart().update({
          id, quantity: line.quantity,
          attributes: checked ? [{ key: 'Gift wrap', value: 'Yes' }] : [],
        }), checked ? 'Gift wrap added to this line.' : 'Gift wrap removed from this line.');
        if (!disposed && input.isConnected) {
          input.checked = this.lines.find(item => item.id === id)?.giftWrap ?? false;
        }
      },
      async remove(id: string) {
        await this.perform(() => cart().remove(id), 'Line removed.');
      },
      destroy() { disposed = true; cart().dispose(); },
    };
  });
}
