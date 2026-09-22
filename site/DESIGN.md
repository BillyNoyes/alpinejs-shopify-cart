# Site design

## Product and audience

Alpine Shopify Cart is an independent, MIT-licensed plugin for Shopify Liquid theme developers. The package is in development, not published on npm. The home page introduces the API through a local interactive demonstration; the docs explain integration and its limits. Do not represent this as an official Shopify, Alpine, or Vercel product.

## Direction

A precise, monochrome developer site. Use typography, alignment, working examples, and space instead of decorative imagery, gradients, or promotional metrics. The home page is a single reading moment: two-line introduction on the left and the actual plugin running with a local transport on the right. The primary action leads into setup documentation.

## References and overrides

- Easel: https://github.com/BillyNoyes/Easel/tree/main/site and https://easel.billynoyes.co.uk/
- Design judgment: https://vercel.com/design.md
- Use Easel's Inter fonts, Alpine, Tailwind, Vite, and spacing rather than the reference's Geist fonts or Vercel authorship shell.
- Design variance 5, motion 2, density 3. Motion only confirms control interaction; no decorative loops or entrance gating.

## Tokens and composition

- Self-host Inter 400 and 700 from Easel with its included license. System monospace is reserved for code.
- Outer gutters: 12px, becoming 20px at 768px. Main content: 1152px maximum, matching Easel's max-w-6xl.
- Desktop home: two equal tracks with a 64px gutter; vertically centered between the header and footer.
- Home uses min-height: 100dvh and fits normal desktop heights without hiding overflow. Short or zoomed viewports can scroll instead of losing content. Mobile stacks content and scrolls naturally.
- Docs: 208px navigation at the far-left outer gutter, 48px column gap, main content up to 1152px centered in the remaining track. Prose stays at a readable 68ch while code and tables can fill the content container. Native disclosure for mobile navigation, static links without JavaScript.
- Inter heading: 700, negative tracking no tighter than -0.035em. Body: 16px. Code: 13px. Controls: 14px.
- Light: #fafafa canvas, #202020 text. Dark: #111111 canvas, #ededed text. Secondary text and borders are semantic CSS variables.
- Corners: 6px controls and code blocks, 8px demo grouping. No shadows, gradients, brand imitation, or theme toggle.

## Interaction and accessibility

The home demo uses the real plugin with fake actions and an isolated EventTarget. It never calls a store. Start with one illustrative tote so the per-line controls are immediately visible. Display actual lines, quantities, properties, line totals, and a subtotal, not operation tabs. Add/remove buttons show the Alpine API expressions they invoke; thin controller wrappers handle status messages and focus. Keep the example product labelled, preserve empty/pending/disabled/success/failure states, and restore keyboard focus when a line is removed or merged. The cart region grows up to a bounded height on desktop while mobile content flows naturally.

Docs filtering only filters section navigation, not article content. Native links own URLs and browser history. Copy buttons report success and failure through a live region. Retain selectable code when clipboard access fails. All docs remain readable without JavaScript.

Semantic landmarks, one h1, visible keyboard focus, skip link, semantic tables, and system light/dark support are required. Never hide global overflow to achieve the desktop viewport requirement.

## Validation

Playwright checks the production output served at /alpinejs-shopify-cart/, not just the Vite root. Test 320px through desktop, compact laptop heights, light/dark, reduced motion, no-JS navigation, clipboard states, and demo interactions. Axe checks representative routes and themes. Verify actual screenshots before handoff.
