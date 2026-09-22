import type { CartAttributeInput, CartOperationOptions, UpdateCartPayload } from '../../index';

interface DemoLine {
  id: string;
  quantity: number;
  attributes: CartAttributeInput[];
}

export function createDemoRuntime() {
  let lines: DemoLine[] = [{ id: 'demo-line-1', quantity: 1, attributes: [] }];
  let nextId = 1;
  const events = new EventTarget();
  const snapshot = () => {
    const quantity = lines.reduce((total, line) => total + line.quantity, 0);
    return { cart: {
      id: 'demo-cart', totalQuantity: quantity,
      cost: { totalAmount: { amount: (quantity * 24).toFixed(2), currencyCode: 'GBP' } },
      lines: lines.map(({ id, quantity }) => ({
        id, quantity,
        cost: { totalAmount: { amount: (quantity * 24).toFixed(2), currencyCode: 'GBP' } },
      })),
      discountCodes: [],
    } };
  };

  return {
    events,
    // Standard cart summaries omit properties; a theme supplies its own product data too.
    attributes(id: string) { return lines.find(line => line.id === id)?.attributes ?? []; },
    actions: {
      async getCart() { return snapshot(); },
      updateCart(payload: UpdateCartPayload, options: CartOperationOptions = {}) {
        const input = payload.lines?.[0];
        if (!input || !Number.isInteger(input.quantity) || input.quantity < 0) {
          return Promise.reject(new Error('Choose a valid cart operation.'));
        }
        const next = lines.map(line => ({ ...line, attributes: line.attributes.map(attribute => ({ ...attribute })) }));
        const existing = next.find(line => line.id === input.id);
        if (input.id && !existing) return Promise.reject(new Error('That line no longer exists.'));
        const attributes = (input.attributes ?? existing?.attributes ?? []).map(attribute => ({ ...attribute }));
        if (existing) {
          existing.quantity = input.quantity;
          existing.attributes = attributes;
        } else {
          next.push({ id: `demo-line-${++nextId}`, quantity: input.quantity, attributes });
        }

        const merged = new Map<string, DemoLine>();
        next.filter(line => line.quantity > 0).forEach(line => {
          const key = JSON.stringify(line.attributes);
          const match = merged.get(key);
          if (match) match.quantity += line.quantity;
          else merged.set(key, line);
        });
        const pending = [...merged.values()];
        if (pending.reduce((total, line) => total + line.quantity, 0) > 9) {
          return Promise.resolve({ ...snapshot(), userErrors: [{ message: 'This demo allows up to 9 items.' }] });
        }
        const promise = new Promise<ReturnType<typeof snapshot>>(resolve => {
          setTimeout(() => { lines = pending; resolve(snapshot()); }, 180);
        });
        events.dispatchEvent(Object.assign(new Event('shopify:cart:lines-update'), {
          action: input.id ? (input.quantity === 0 ? 'remove' : 'update') : 'add',
          context: options.event?.context ?? 'standard-action',
          lines: [input], promise, detail: options.event?.detail,
        }));
        return promise;
      },
      async openCart() {},
    },
  };
}
