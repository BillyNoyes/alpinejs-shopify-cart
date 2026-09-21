window.__openedCart = 0
window.__cartQuantity = 0

function cart() {
  return {
    id: 'gid://shopify/Cart/browser-test',
    totalQuantity: window.__cartQuantity,
    cost: {
      totalAmount: {
        amount: String(window.__cartQuantity * 10),
        currencyCode: 'USD',
      },
    },
    lines: window.__cartQuantity
      ? [{
          id: 'gid://shopify/CartLine/1',
          quantity: window.__cartQuantity,
          cost: {
            totalAmount: {
              amount: String(window.__cartQuantity * 10),
              currencyCode: 'USD',
            },
          },
        }]
      : [],
    discountCodes: [],
  }
}

window.Shopify = {
  actions: {
    async getCart() {
      return { cart: cart() }
    },
    updateCart(payload, options) {
      const line = payload.lines?.[0]
      if (line) window.__cartQuantity = line.quantity

      const result = Promise.resolve({ cart: cart() })
      const event = new Event('shopify:cart:lines-update', { bubbles: true })
      Object.assign(event, {
        action: line?.id ? 'update' : 'add',
        context: options.event.context ?? 'standard-action',
        detail: options.event.detail,
        lines: payload.lines,
        promise: result,
      })
      document.dispatchEvent(event)

      return result
    },
    async openCart() {
      window.__openedCart += 1
    },
  },
}
