# Development plan

## Objective

Build a small Alpine.js plugin that exposes Shopify's standard cart actions and events through a reactive `$cart` magic.

The plugin should let theme authors read cart state, perform cart operations, and receive cart updates without intercepting network requests, depending on theme-specific markup, or implementing the cart protocol themselves.

## Current progress

The initial implementation now includes:

- ESM, CommonJS, and CDN builds
- A shared `shopifyCart` Alpine store exposed as `$cart`
- Deferred initialization at `DOMContentLoaded`
- `getCart`, `updateCart`, and `openCart` adapters
- Read, add, update, remove, note, attribute, and discount methods
- Standard cart event synchronization
- Serialized local mutations and stale-result protection
- Separate rejected errors, user errors, and warnings
- Unit, package, and Playwright browser tests
- TypeScript declarations and CI configuration

The implementation was validated on a development store through `shopify theme dev --standard-events-inspector`. The live test covered cart initialization, add, update, external action synchronization, note, attributes, discount codes, removal, and `openCart()`, with no invalid standard-event payloads. It also identified and corrected action-readiness timing and the live runtime's `{ nodes }` cart-line connection shape.

## Product principles

1. **Use Shopify's standard interface.** Delegate reads and writes to `Shopify.actions` and consume standard `shopify:cart:*` events.
2. **Remain headless.** Do not prescribe cart HTML, drawer behavior, styling, animations, or accessibility patterns.
3. **Preserve Shopify's data model.** Keep standard cart, error, and warning shapes intact.
4. **Treat the server as authoritative.** Reconcile every completed operation with the cart returned by Shopify.
5. **Handle concurrency deliberately.** Never allow an older response to overwrite a newer cart state.
6. **Avoid duplicate events.** Standard actions emit their own cart events.
7. **Respect theme configuration.** Do not override theme-configured action handlers by default.
8. **Keep storefront overhead low.** Avoid large dependencies and unnecessary reactive copies.

## Proposed public API

### Installation

```js
import Alpine from 'alpinejs'
import shopifyCart from 'alpinejs-shopify-cart'

Alpine.plugin(shopifyCart)
```

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

### Operations

```js
$cart.refresh()
$cart.add(line, options?)
$cart.update(line, options?)
$cart.remove(lineId, options?)
$cart.setNote(note, options?)
$cart.setAttributes(attributes, options?)
$cart.setDiscountCodes(discountCodes, options?)
$cart.open()
```

The exact argument shapes must be confirmed against Shopify's standard action schemas before implementation is considered stable.

## Architecture

### Alpine integration

Register one reactive Alpine store and expose it through a magic:

```text
Alpine.store('shopifyCart')
        │
        └── Alpine.magic('cart')
```

The store owns state and methods. `$cart` returns the same store from every component so cart state stays synchronized across the page.

### Shopify runtime adapter

Keep direct interaction with `window.Shopify.actions` behind a small adapter:

```text
ShopifyCartStore
        │
        └── StandardActionsAdapter
                ├── getCart
                ├── updateCart
                └── openCart
```

Benefits:

- Unit tests can inject a fake adapter.
- Runtime availability checks stay in one place.
- Future standards changes do not leak throughout the store.
- The plugin does not need to fake a complete `window.Shopify` object in every test.

### Event bridge

Register document listeners for standard cart events as soon as the plugin can safely do so:

```text
shopify:cart:lines-update
shopify:cart:note-update
shopify:cart:attributes-update
shopify:cart:discount-update
shopify:cart:error
shopify:cart:view
```

For mutation events:

1. Read the event payload.
2. Observe its result promise when present.
3. Preserve the event's context and detail for debugging.
4. Reconcile the resolved cart.
5. Surface user errors and warnings without treating them as network failures.

The bridge must not emit a second event for operations already performed through `Shopify.actions.updateCart()`.

### State reconciliation

Use one reconciliation function for action results and event results:

```text
reconcile({ cart, userErrors, warnings, detail })
```

Rules:

- Replace the stored cart only when a cart is present.
- Preserve Shopify's standard cart shape.
- Clear stale fatal errors after a successful operation.
- Expose user errors separately from rejected promises.
- Expose warnings even when the mutation succeeds.
- Make repeated reconciliation with the same result harmless.

### Concurrency model

Start with serialized mutations:

```text
add ──▶ update ──▶ remove
```

`getCart()` reads may run independently, but a stale read must not replace state produced by a newer mutation.

Track monotonically increasing operation revisions:

```text
requested revision
completed revision
applied revision
```

Before applying a result, confirm it is not older than the latest authoritative result already applied.

Questions to resolve during implementation:

- Should separate line updates be queued globally or per cart line?
- Should a refresh wait for pending mutations?
- Can standard action implementations already serialize updates?
- How should externally dispatched event results rank against local revisions?

Prefer correctness and predictable ordering over optimistic speed in the first release.

### Pending state

Use an operation counter or operation registry rather than toggling a boolean:

```js
pendingOperations = new Map()
```

Derived values:

```js
pending = pendingOperations.size > 0
pendingOperation = mostRecentPendingOperation?.type ?? null
```

A later release can expose per-line pending state if real theme use cases require it.

### Error model

Keep three categories separate:

1. **Rejected operation:** malformed payload, unavailable runtime, network failure, or handler exception.
2. **User error:** Shopify processed the request but rejected the requested cart mutation.
3. **Warning:** Shopify applied the mutation with a non-blocking adjustment.

Proposed state:

```js
{
    error: null,
    userErrors: [],
    warnings: [],
}
```

Do not convert every user error into a thrown exception. The standard action contract intentionally resolves with user errors and warnings.

## Milestones

### Milestone 0: validate the contract

- [ ] Confirm every `updateCart` input shape used by the proposed methods.
- [ ] Confirm `getCart`, `updateCart`, and `openCart` readiness timing.
- [ ] Document all relevant standard event payloads and result promises.
- [ ] Build a minimal Liquid storefront spike using real standard actions.
- [ ] Verify how theme-configured action handlers affect results and events.
- [ ] Decide the minimum supported Shopify runtime behavior.
- [ ] Open an API-design issue for feedback before publishing a package.

**Exit criteria:** The README examples match tested Shopify behavior and the proposed API can map to standard actions without private or legacy APIs.

### Milestone 1: project foundation

- [ ] Add package metadata and an MIT license.
- [ ] Configure ES module and CDN builds.
- [ ] Add TypeScript declarations or author the package in TypeScript.
- [ ] Configure unit tests and browser integration tests.
- [ ] Add formatting and linting with minimal project-specific configuration.
- [ ] Add GitHub Actions for tests, build verification, and package-size reporting.
- [ ] Add a small development fixture that boots Alpine against a fake Shopify runtime.

**Exit criteria:** A no-op Alpine plugin builds in every intended format and CI is green.

### Milestone 2: read-only reactive cart

- [ ] Register the shared Alpine cart store.
- [ ] Register the `$cart` magic.
- [ ] Wait for standard actions to become available.
- [ ] Implement `$cart.refresh()` with `Shopify.actions.getCart()`.
- [ ] Populate `ready`, `cart`, `lines`, `totalQuantity`, `cost`, and `discountCodes`.
- [ ] Handle an absent cart without inventing fake line data.
- [ ] Listen for standard cart mutation events.
- [ ] Provide deterministic listener cleanup for tests, hot reload, and explicit plugin disposal.

**Exit criteria:** Two independent Alpine components stay synchronized when the cart is refreshed or a standard cart event resolves.

### Milestone 3: cart mutations

- [ ] Implement `$cart.add()`.
- [ ] Implement `$cart.update()`.
- [ ] Implement `$cart.remove()` as a quantity-zero line update.
- [ ] Implement `$cart.setNote()`.
- [ ] Implement `$cart.setAttributes()`.
- [ ] Implement `$cart.setDiscountCodes()`.
- [ ] Pass standard action context and detail options through without reshaping them.
- [ ] Reconcile action results and emitted event results idempotently.
- [ ] Preserve `userErrors`, `warnings`, and result `detail`.
- [ ] Add serialized mutation handling and stale-result protection.

**Exit criteria:** Rapid and overlapping operations always settle on the latest Shopify cart, with no duplicated standard events.

### Milestone 4: cart presentation interoperability

- [ ] Implement `$cart.open()` with `Shopify.actions.openCart()`.
- [ ] Verify compatibility with a configured cart drawer action.
- [ ] Verify the default cart-page fallback remains Shopify's responsibility.
- [ ] React to `shopify:cart:view` without forcing cart presentation state into the plugin.
- [ ] Document how themes can configure `updateCart` and `openCart` handlers.

**Exit criteria:** The plugin opens the cart without knowing whether the storefront uses a drawer or page.

### Milestone 5: hardening

- [ ] Test rejected action promises.
- [ ] Test resolved user errors.
- [ ] Test successful warnings.
- [ ] Test external theme-initiated cart events.
- [ ] Test app-initiated `updateCart` events.
- [ ] Test action results arriving out of order.
- [ ] Test initialization before and after `DOMContentLoaded`.
- [ ] Test multiple Alpine roots consuming `$cart`.
- [ ] Test component removal during pending work.
- [ ] Test CSP-compatible Alpine usage.
- [ ] Measure the minified and compressed bundle.
- [ ] Audit comments, public names, and error messages.

**Exit criteria:** All documented behavior has browser-level coverage and the bundle meets the agreed size budget.

### Milestone 6: first release

- [ ] Publish an alpha for real-theme testing.
- [ ] Test against at least one Shopify reference theme and one independently structured theme.
- [ ] Collect feedback from theme and app developers using standard actions.
- [ ] Finalize the public API and TypeScript declarations.
- [ ] Publish migration notes for alpha users if the API changes.
- [ ] Publish `1.0.0` only after the standard action contract has been exercised in real storefronts.

## Testing strategy

### Unit tests

Use a fake standard-actions adapter to verify:

- Reactive state transitions
- Payload construction
- Error classification
- Warning preservation
- Pending operation accounting
- Mutation ordering
- Stale result rejection
- Idempotent reconciliation

### Browser tests

Run Alpine in a real browser with a controllable fake `Shopify.actions` runtime:

- Multiple elements read the same `$cart` store.
- Action completion updates every consumer.
- Standard DOM events update the store.
- Event promises resolve asynchronously.
- Repeated plugin setup and disposal does not leak document listeners.
- Theme-configured handlers remain in control.

### Real storefront tests

Before stable release, exercise the package through Shopify's development runtime:

- Validate standard payloads during `shopify theme dev`.
- Use the standard events inspector.
- Add, update, and remove real cart lines.
- Apply a rejected quantity and confirm user errors.
- Trigger an inventory warning.
- Open both a drawer-based cart and a page-based cart.
- Confirm no duplicate events are emitted.

## Documentation plan

- [ ] Installation through npm and CDN
- [ ] Theme script ordering
- [ ] `$cart` state reference
- [ ] Method reference
- [ ] Standard context and detail options
- [ ] Loading, errors, user errors, and warnings
- [ ] Product-form example
- [ ] Cart-count example
- [ ] Cart-lines example
- [ ] Theme-configured action integration
- [ ] Events interoperability guide
- [ ] Explicit analytics and consent warning
- [ ] Troubleshooting standard action availability

## Release boundaries

The first stable release will not include:

- Legacy Ajax Cart API fallback
- Storefront API authentication
- Cart section rendering or DOM morphing
- A prebuilt cart drawer
- Product variant selection
- Product recommendations
- Collection filtering
- Analytics
- Cross-tab synchronization
- Optimistic line updates

These can be evaluated after the standards-first core is proven. Keeping them out of `1.0` protects bundle size and leaves room for separate plugins where appropriate.

## Open questions

1. Should `$cart.add()` accept only the standard line shape, or provide convenience overloads for numeric variant IDs?
2. Should methods return the complete standard action result or only its cart?
3. Should `userErrors` and `warnings` persist until the next operation or require explicit dismissal?
4. Should reads performed while mutations are pending wait, execute immediately, or be ignored?
5. How should externally initiated event results interact with local operation revisions?
6. Should the plugin expose the latest event context and detail?
7. Is an explicit `dispose()` API useful outside tests?
8. What compressed bundle-size budget should block release?
9. Should section rendering become a separate plugin rather than a later feature here?

## Definition of done for 1.0

- The `$cart` API is documented and covered by tests.
- All operations use Shopify standard actions.
- Standard cart events keep Alpine consumers synchronized.
- Theme action configuration is respected.
- Concurrent operations cannot apply stale state.
- Errors, user errors, and warnings remain distinguishable.
- No duplicate standard events are emitted.
- ESM and CDN builds are available.
- TypeScript consumers receive complete public types.
- CI verifies tests, builds, and package size.
- The package has been exercised on real Liquid storefronts.
