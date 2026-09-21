# Shopify standard cart contract

This document records the Shopify platform contract used by `alpinejs-shopify-cart`. It is an implementation reference, not a replacement for Shopify's documentation.

## Sources

- [Standard storefront events and actions](https://shopify.dev/docs/storefronts/themes/best-practices/standard-events-and-actions)
- [Call actions](https://shopify.dev/docs/api/storefront-events-and-actions/actions/call)
- [`getCart`](https://shopify.dev/docs/api/storefront-events-and-actions/actions/get-cart)
- [`updateCart`](https://shopify.dev/docs/api/storefront-events-and-actions/actions/update-cart)
- [`openCart`](https://shopify.dev/docs/api/storefront-events-and-actions/actions/open-cart)
- [Configure actions](https://shopify.dev/docs/api/storefront-events-and-actions/actions/configure)
- [Listen for events](https://shopify.dev/docs/api/storefront-events-and-actions/events/listen)
- [Dispatch events](https://shopify.dev/docs/api/storefront-events-and-actions/events/dispatch)
- [Shopify standard event declarations](https://cdn.shopify.com/storefront/standard-events.d.ts)

The declaration snapshot reviewed during the initial implementation reported version:

```text
977e4f914dd2b3eca85ad01dee81c2c96eb1b2e5
```

The CDN declarations are versionless and can change. Review them before each package release.

## Runtime availability

`Shopify.actions` is available on Shopify Liquid storefronts after `DOMContentLoaded`. The plugin can register event listeners earlier, but it must not call actions until that lifecycle point.

The standard action runtime is provided by Shopify. The plugin does not load or bundle it.

## Actions

### `getCart`

```ts
Shopify.actions.getCart(
  payload?: { cartId?: string },
  options?: { signal?: AbortSignal },
): Promise<{ cart: CartSummary | null }>
```

Behavior:

- An omitted `cartId` resolves the buyer's cart through the browser cookie.
- `cart` is `null` when the buyer does not have a cart.
- Concurrent callers share the runtime's request.
- `getCart` cannot be configured by a theme.

### `updateCart`

```ts
Shopify.actions.updateCart(
  payload: UpdateCartPayload,
  options?: UpdateCartOptions,
): Promise<UpdateCartResult>
```

Payload:

```ts
interface UpdateCartPayload {
  cartId?: string
  lines?: CartLineInput[]
  note?: string
  discountCodes?: string[]
  attributes?: CartAttributeInput[]
}

interface CartLineInput {
  id?: string | number
  merchandiseId?: string | number
  quantity: number
  attributes?: CartAttributeInput[]
  sellingPlanId?: string | number
}

interface CartAttributeInput {
  key: string
  value: string
}
```

Line semantics:

- Omit `id` and provide `merchandiseId` to add a line.
- Provide `id` to update an existing line.
- Set `quantity` to `0` to remove an existing line.
- Raw numeric IDs, string IDs, and Shopify GIDs are accepted where documented.
- `attributes` and `discountCodes` are complete replacement sets, not patches.

Options:

```ts
interface UpdateCartOptions {
  signal?: AbortSignal
  event?: {
    context?: 'product' | 'cart' | 'dialog' | 'standard-action'
    detail?: Record<string, unknown>
  }
}
```

Result:

```ts
interface UpdateCartResult {
  cart: CartSummary | null
  userErrors?: CartMutationUserError[]
  warnings?: CartMutationWarning[]
  detail?: Record<string, unknown>
}
```

A rejected promise means the operation could not run, such as a network failure, malformed payload, or abort. A cart mutation rejected by Shopify resolves with `userErrors`. A successful mutation can resolve with non-blocking `warnings`.

`updateCart` automatically emits corresponding standard cart events. Callers must not dispatch duplicates.

Themes can configure `updateCart`. The plugin must call the public action rather than bypassing configured handlers.

### `openCart`

```ts
Shopify.actions.openCart(): Promise<void>
```

The storefront decides whether to open a cart drawer or navigate to the cart page. Themes can configure this action. The plugin must not infer cart presentation from theme markup.

## Cart summary

The standard cart summary intentionally contains a subset of full cart data:

```ts
interface CartSummary {
  id: string
  totalQuantity: number
  cost: {
    totalAmount: {
      amount: string
      currencyCode: string
    }
  }
  lines: Array<{
    id: string
    quantity: number
    cost: {
      totalAmount: {
        amount: string
        currencyCode: string
      }
    }
  }> | {
    nodes: Array<{
      id: string
      quantity: number
      cost: {
        totalAmount: {
          amount: string
          currencyCode: string
        }
      }
    }>
  }
  discountCodes: Array<{
    applicable: boolean
    code: string
  }>
}
```

It does not include product titles, images, or full merchandise objects. The plugin must not claim those fields are available from the standard action contract.

Shopify's documentation currently describes `lines` as `CartLine[]`, while the live standard-actions runtime on a development store returned a Storefront-style `{ nodes: CartLine[] }` connection during integration testing. The plugin preserves the raw `cart.lines` value and normalizes both representations through `$cart.lines`.

## Events

All standard storefront events bubble and can be observed on `document`.

### `shopify:cart:lines-update`

Fires when a line add, update, or removal begins.

Required fields:

```ts
{
  action: 'add' | 'remove' | 'update'
  context: 'product' | 'cart' | 'dialog' | 'standard-action'
  lines: CartLinesUpdateLine[]
  promise: Promise<CartLinesUpdateResult>
  detail?: Record<string, unknown>
}
```

The promise rejects when the request fails or is aborted, including when a newer update supersedes it.

### `shopify:cart:note-update`

Carries the complete new note and a promise for the mutation result. An empty string clears the note.

### `shopify:cart:attributes-update`

Carries the complete replacement attribute set and a promise. The resolved cart does not include attributes, so successful consumers retain the event's `attributes` value separately.

### `shopify:cart:discount-update`

Carries the requested discount-code state and a promise. The resolved cart's `discountCodes` report which codes are applicable.

### `shopify:cart:error`

```ts
{
  error: string
  code: CartErrorCode
  detail?: Record<string, unknown>
}
```

This event represents a failed request. Resolved `userErrors` do not produce a cart error event.

### `shopify:cart:view`

```ts
{
  context: 'page' | 'dialog'
  cart: CartSummary | null
  detail?: Record<string, unknown>
}
```

The event contains the cart directly and does not require a follow-up request.

## Plugin implications

1. Register document listeners during plugin initialization.
2. Wait until `DOMContentLoaded` before the initial `getCart` call.
3. Use `Shopify.actions` for every plugin-initiated operation.
4. Reconcile both action results and externally initiated event promises.
5. Mark plugin-initiated action events so the same result is not counted as a second operation.
6. Keep rejected errors, resolved user errors, and warnings separate.
7. Preserve `note` and `attributes` from successful event or method inputs because `CartSummary` omits them.
8. Serialize local mutations and reject stale externally initiated results.
9. Never use standard storefront events for analytics; Shopify Web Pixels handle consent-aware analytics.
10. Validate real payloads with `shopify theme dev --standard-events-inspector` before stable release.
