# alpinejs-shopify-cart

A headless, reactive `$cart` magic for Alpine.js, powered by Shopify's standard storefront events and actions.

[npm](https://www.npmjs.com/package/alpinejs-shopify-cart) · [Documentation](https://alpinejs-cart.billynoyes.co.uk/docs/) · [Demo](https://alpinejs-cart.billynoyes.co.uk/)

## What it does

- Reads the cart with `Shopify.actions.getCart()`.
- Adds, updates, and removes lines through `Shopify.actions.updateCart()`.
- Updates cart notes, attributes, and discount codes.
- Opens the theme's cart through `Shopify.actions.openCart()`.
- Observes standard `shopify:cart:*` events from other theme or app code.
- Shares reactive state across Alpine components, with queued local operations and separate errors, user errors, and warnings.

The plugin does not provide markup, CSS, a cart drawer, analytics, or an Ajax Cart API fallback. It targets Shopify Liquid storefronts, not Admin apps, checkout extensions, POS, or headless storefronts. No API token is needed.

## Installation

Choose one approach. Load Alpine only once; if your theme already initializes it, register this plugin in that existing setup rather than adding another Alpine script or calling `Alpine.start()` again.

### npm

```sh
npm install alpinejs@^3 alpinejs-shopify-cart@1.0.0
```

Register the plugin before starting Alpine:

```js
import Alpine from 'alpinejs'
import shopifyCart from 'alpinejs-shopify-cart'

Alpine.plugin(shopifyCart)
Alpine.start()
```

The package provides ES module and CommonJS entries and TypeScript declarations. Module imports do not auto-register.

### CDN

Load the plugin's auto-registering CDN build **before** Alpine. Both scripts should use `defer`:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs-shopify-cart@1.0.0/dist/alpinejs-shopify-cart.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/cdn.min.js"></script>
```

[Plugin on jsDelivr](https://cdn.jsdelivr.net/npm/alpinejs-shopify-cart@1.0.0/dist/alpinejs-shopify-cart.min.js) · [Package on npm](https://www.npmjs.com/package/alpinejs-shopify-cart)

### Serve the files as theme assets

If you prefer Shopify-hosted assets, copy `node_modules/alpinejs-shopify-cart/dist/alpinejs-shopify-cart.min.js` into your theme's `assets/` directory. Copy `node_modules/alpinejs/dist/cdn.min.js` there as `alpine.js`, then load them in the same order:

```liquid
<script defer src="{{ 'alpinejs-shopify-cart.min.js' | asset_url }}"></script>
<script defer src="{{ 'alpine.js' | asset_url }}"></script>
```

Your theme must provide Shopify's standard storefront actions. This does not turn a standalone HTML page into a Shopify storefront.

## Reactive state

All `$cart` references resolve to `Alpine.store('shopifyCart')`.

```html
<div x-data>
    <span x-text="$cart.totalQuantity"></span>
    <span x-show="$cart.pending">Updating cart…</span>
</div>
```

| Property | Meaning |
| --- | --- |
| `ready` | An initial read attempt completed, including failure. Check `error` separately. |
| `cart` | Raw Shopify cart result, or `null`. |
| `lines` | Line array, normalized from an array or a `{ nodes }` connection. |
| `totalQuantity` | Quantity across all lines, or zero. |
| `cost` | Cart cost, or `null`. Amounts are decimal strings, not integer cents. |
| `discountCodes` | Codes and their applicability, as returned by Shopify. |
| `note`, `attributes` | Last successfully observed values; undefined until known. Cleared when cart identity changes. |
| `pending`, `pendingCount` | Whether operations remain, and how many are tracked, including queued calls. |
| `pendingOperation` | Most recently registered pending operation, or `null`. |
| `error` | Rejected operation details, or `null`. |
| `userErrors`, `warnings` | Resolved validation errors and non-blocking warnings. |
| `detail` | Custom detail from the applied result. |

The standard cart summary omits product titles, images, and full merchandise objects. Render those through Liquid or a separate product-data source.

## Methods

Mutation methods resolve with the complete Shopify result, including `cart`, `userErrors`, and `warnings`. A failed request rejects its promise; callers must catch it.

```js
await cart.add({ merchandiseId: variantId, quantity: 1 })
await cart.update({ id: line.id, quantity: 2 })
await cart.remove(line.id)
await cart.setNote('Leave at the front desk')
await cart.setAttributes([{ key: 'Gift wrap', value: 'Yes' }])
await cart.setDiscountCodes(['WELCOME10'])
await cart.refresh()
await cart.open()
```

Here `cart` is obtained from `Alpine.store('shopifyCart')`, or as `this.$cart` in an Alpine component.

- `add()` and `update()` accept one line or an array. `remove()` accepts one line ID or an array.
- Use `merchandiseId` to add a variant; use a returned cart line `id` to update or remove it.
- Attributes and discount codes are complete replacement sets. An empty array clears the set.
- `mutate(payload, options)` accepts a complete standard `updateCart` payload.
- `refresh({ cartId?, signal? })` returns `{ cart }`.
- `open()` takes no arguments and returns `Promise<void>`.

Mutation options accept `signal`, `context`, `detail`, and standard nested `event` options. Top-level context and detail take precedence over nested values. The plugin reserves `event.detail.alpineShopifyCartOperationId` for correlation.

```js
await cart.mutate({
    lines: [{ id: line.id, quantity: 2 }],
    note: 'Gift order',
}, {
    context: 'cart',
    detail: { source: 'cart-page' },
})
```

Quantities are absolute targets. When deriving a new quantity from current state, disable controls while pending to avoid repeatedly submitting the same target.

For complete examples, see [line-item properties and a gift-wrap form](https://alpinejs-cart.billynoyes.co.uk/docs/#line-properties) and [cart recipes](https://alpinejs-cart.billynoyes.co.uk/docs/#examples), including multi-item adds, selling plans, notes, attributes, and discounts.

## Errors and warnings

```js
try {
    const result = await cart.add({ merchandiseId: variantId, quantity: 1 })
    if (result.userErrors?.length) {
        showMessage(result.userErrors[0].message)
        return
    }
    if (result.warnings?.length) showMessage(result.warnings[0].message)
    await cart.open()
} catch (error) {
    showMessage(error.message ?? 'Could not update the cart. Try again.')
}
```

`showMessage` represents your theme's UI. A resolved `userErrors` array means Shopify declined a change; a warning means it applied with an adjustment. Neither should be treated as a network failure.

## Events and theme behavior

The plugin listens on `document` for:

```text
shopify:cart:lines-update
shopify:cart:note-update
shopify:cart:attributes-update
shopify:cart:discount-update
shopify:cart:error
shopify:cart:view
```

Mutation events carry a result promise. Their properties are directly on the event, not all inside `event.detail`. The plugin waits for the result and reconciles the cart. Events belonging to its own actions are consumed without duplicate reconciliation.

`Shopify.actions.updateCart()` already emits standard events. Do not emit another event after calling `$cart`. Changes outside standard actions are observable only when the theme or app dispatches standard events; the plugin does not intercept `fetch` or poll.

**Shopify's default action can reload the page.** For in-place updates, your theme must configure the appropriate `updateCart` handler and event target. `openCart` may open a drawer or navigate to the cart page. The plugin respects those decisions and does not configure actions itself.

Standard events are not a consent-aware analytics channel. Use Shopify Web Pixels for analytics.

## Initialization and cleanup

Register before `Alpine.start()`. The plugin attaches listeners immediately and defers its initial read while the document and Shopify action runtime initialize. An unavailable runtime is recorded in `error`; `refresh()` can retry later.

The store and listeners belong to the page. Do not dispose when just one widget is removed. At application teardown:

```js
Alpine.store('shopifyCart').dispose()
```

Disposal removes listeners, cancels initialization, rejects new calls, skips queued calls that have not started, and prevents late results from writing reactive state. It does not abort a request already sent or undo a server-side mutation. There is no restart API.

Local requests are serialized, and stale responses do not replace newer successful cart snapshots. A newer failed operation does not discard an earlier successful cart result. This is not distributed concurrency control: unrelated writers and events without a server revision still require integration testing.

## Development and validation

Requires Node.js 20 or newer for the package; Node.js 24 for the site.

```sh
git clone https://github.com/BillyNoyes/alpinejs-shopify-cart.git
cd alpinejs-shopify-cart
npm ci
npx playwright install chromium firefox webkit
npm test

npm --prefix site ci
npm --prefix site run check
```

Tests cover lifecycle and race regressions, packed ESM/CommonJS consumers, CDN tree-shaking, public types, and browser integration with standard and CSP Alpine builds. The browser runtime is a controlled test double, not a live Shopify store. Live-store validation requires separate authorization and a real development theme.

The source is split into registration (`index.js`), Shopify transport (`actions.js`), event observation (`events.js`), operation ordering and reconciliation (`operations.js`), and reactive state/methods (`store.js`).

See [the site guide](https://github.com/BillyNoyes/alpinejs-shopify-cart/blob/main/site/README.md), [the development plan](https://github.com/BillyNoyes/alpinejs-shopify-cart/blob/main/PLAN.md), and [the Shopify contract](https://github.com/BillyNoyes/alpinejs-shopify-cart/blob/main/docs/SHOPIFY_STANDARD_CONTRACT.md).

## Publishing

Maintainers: follow the [release guide](https://github.com/BillyNoyes/alpinejs-shopify-cart/blob/main/docs/RELEASING.md) for first-package bootstrapping, npm trusted publishing, and tagged releases. Pushing to `main` does not publish the package.

## References

- [Shopify standard events and actions](https://shopify.dev/docs/storefronts/themes/best-practices/standard-events-and-actions)
- [Calling actions](https://shopify.dev/docs/api/storefront-events-and-actions/actions/call)
- [Configuring actions](https://shopify.dev/docs/api/storefront-events-and-actions/actions/configure)
- [Alpine plugin authoring](https://alpinejs.dev/advanced/extending)

## License

MIT. Independent project by Billy Noyes, with no Shopify sponsorship or endorsement.
