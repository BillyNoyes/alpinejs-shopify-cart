# alpinejs-shopify-cart

A headless, reactive `$cart` magic for Alpine.js, powered by Shopify's standard storefront events and actions.

> **Status:** Planning and early development. No package has been published yet, and the proposed API may change before the first release.

## Why

Shopify Liquid storefronts now have a standard communication layer for cart behavior:

- `Shopify.actions.getCart()` reads the current cart.
- `Shopify.actions.updateCart()` changes cart lines, notes, attributes, and discount codes.
- `Shopify.actions.openCart()` lets the storefront decide whether to open a drawer or navigate to the cart page.
- Standard `shopify:cart:*` DOM events notify the page when cart state changes.

That removes the need for Alpine components to intercept `fetch`, scrape theme markup, or implement a separate integration for every theme.

`alpinejs-shopify-cart` will turn those standards into a small reactive Alpine API:

```html
<span x-text="$cart.totalQuantity"></span>

<button
    @click="$cart.add({ merchandiseId: variantId, quantity: 1 })"
    :disabled="$cart.pending"
>
    Add to cart
</button>
```

The plugin will not own cart markup, CSS, analytics, or drawer behavior. It will expose Shopify's cart state and actions in a form that feels native to Alpine.

## Proposed usage

```js
import Alpine from 'alpinejs'
import shopifyCart from 'alpinejs-shopify-cart'

Alpine.plugin(shopifyCart)
Alpine.start()
```

A CDN build is also planned:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs-shopify-cart@VERSION/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@VERSION/dist/cdn.min.js"></script>
```

## Proposed API

### State

```js
$cart.ready
$cart.cart
$cart.lines
$cart.totalQuantity
$cart.cost
$cart.discountCodes
$cart.pending
$cart.pendingOperation
$cart.error
$cart.userErrors
$cart.warnings
```

`$cart.cart` will retain Shopify's standard cart summary shape. Convenience getters such as `lines`, `totalQuantity`, and `cost` will not replace or reshape the underlying response.

### Read and display the cart

```html
<div x-data>
    <p x-show="! $cart.ready">Loading cart…</p>

    <template x-for="line in $cart.lines" :key="line.id">
        <article>
            <span x-text="line.quantity"></span>
            <span x-text="line.cost.totalAmount.amount"></span>
        </article>
    </template>

    <p>
        <span x-text="$cart.totalQuantity"></span>
        items
    </p>
</div>
```

### Refresh

```html
<button @click="$cart.refresh()" :disabled="$cart.pending">
    Refresh cart
</button>
```

`refresh()` will call `Shopify.actions.getCart()` and reconcile the reactive store with the returned cart.

### Add a product variant

```html
<button
    @click="$cart.add({ merchandiseId: variantId, quantity: 1 }, { context: 'product' })"
    :disabled="$cart.pending"
>
    Add to cart
</button>
```

### Change or remove a line

```html
<template x-for="line in $cart.lines" :key="line.id">
    <div>
        <button @click="$cart.update({ id: line.id, quantity: line.quantity - 1 })">
            Decrease
        </button>

        <span x-text="line.quantity"></span>

        <button @click="$cart.update({ id: line.id, quantity: line.quantity + 1 })">
            Increase
        </button>

        <button @click="$cart.remove(line.id)">
            Remove
        </button>
    </div>
</template>
```

### Update other cart data

```js
await $cart.setNote('Leave at the front desk')
await $cart.setAttributes([{ key: 'Gift wrap', value: 'Yes' }])
await $cart.setDiscountCodes(['WELCOME10'])
```

These methods will delegate to `Shopify.actions.updateCart()` rather than maintaining a second cart implementation.

### Open the cart

```html
<button @click="$cart.open()">
    View cart
</button>
```

`open()` will call `Shopify.actions.openCart()`. The theme remains responsible for deciding whether that opens a drawer or navigates to the cart page.

## Standard events and actions

The plugin will use Shopify's standard interface as its source of truth.

### Actions

| Plugin method | Shopify action |
| --- | --- |
| `$cart.refresh()` | `Shopify.actions.getCart()` |
| `$cart.add()` | `Shopify.actions.updateCart()` |
| `$cart.update()` | `Shopify.actions.updateCart()` |
| `$cart.remove()` | `Shopify.actions.updateCart()` |
| `$cart.setNote()` | `Shopify.actions.updateCart()` |
| `$cart.setAttributes()` | `Shopify.actions.updateCart()` |
| `$cart.setDiscountCodes()` | `Shopify.actions.updateCart()` |
| `$cart.open()` | `Shopify.actions.openCart()` |

The plugin will respect action handlers configured by the active theme. It will not replace a theme's `updateCart` or `openCart` configuration by default.

### Events

The reactive store will listen for:

```text
shopify:cart:lines-update
shopify:cart:note-update
shopify:cart:attributes-update
shopify:cart:discount-update
shopify:cart:error
shopify:cart:view
```

When an event carries a result promise, the plugin will reconcile state from the resolved cart. This means cart changes initiated by other apps or theme code can update Alpine consumers without DOM scraping or request interception.

`Shopify.actions.updateCart()` already emits its corresponding standard cart events. The plugin will not dispatch duplicate events after calling the action.

Standard storefront events are for coordinating storefront behavior, not analytics. Analytics integrations should use Shopify Web Pixels so buyer consent is respected.

## Design principles

### Headless

The plugin will provide state and operations, not a cart drawer component or stylesheet. Themes remain free to render carts however they choose.

### Standards-first

The first release will target Shopify Liquid storefronts with standard storefront actions. It will not wrap the legacy Ajax Cart API or require a Storefront API token.

### Server-authoritative

The cart returned by Shopify is canonical. User errors, warnings, inventory adjustments, discounts, and cart transformations must be preserved rather than hidden behind optimistic local state.

### Race-safe

Cart mutations will be coordinated so rapid quantity changes cannot apply stale responses out of order. Pending state will be derived from active operations rather than a fragile single boolean.

### Interoperable

Changes initiated through the plugin, theme code, or another app should converge on the same reactive cart state through Shopify's standard events and action results.

### Small

The plugin should remain focused enough for storefront use, with no UI framework, API client, or generalized state-management dependency.

## Scope

The initial package targets:

- Shopify Liquid storefronts
- Alpine.js 3
- Modern evergreen browsers
- ES module and CDN usage

It does not target:

- Hydrogen storefronts
- Shopify Admin apps
- Checkout UI extensions
- POS UI extensions
- Cart analytics
- Cart drawer markup or styling
- Product option and variant-selection logic

## Documentation

- [Shopify standard storefront events and actions](https://shopify.dev/docs/storefronts/themes/best-practices/standard-events-and-actions)
- [Calling standard actions](https://shopify.dev/docs/api/storefront-events-and-actions/actions/call)
- [`updateCart`](https://shopify.dev/docs/api/storefront-events-and-actions/actions/update-cart)
- [`getCart`](https://shopify.dev/docs/api/storefront-events-and-actions/actions/get-cart)
- [`openCart`](https://shopify.dev/docs/api/storefront-events-and-actions/actions/open-cart)
- [Standard storefront events](https://shopify.dev/docs/api/storefront-events-and-actions/events)

## Development plan

See [PLAN.md](./PLAN.md) for the proposed architecture, milestones, testing strategy, and release criteria.

## Contributing

The project is currently defining its first public API. Issues and discussions about real Shopify theme use cases are welcome, especially around concurrency, standard event interoperability, errors, and theme-configured actions.

## License

MIT
