# Documentation site

Two static Vite entries: `index.html` for the desktop viewport-height landing page, and `docs/index.html` for the reference. Uses Alpine.js, Tailwind CSS v4, and Easel's self-hosted Inter fonts and container spacing.

## Develop

Requires Node.js 24.

```sh
cd site
npm ci
npm run dev
```

## Verify

```sh
npm run build
npx playwright install chromium
npm test
```

`npm run check` runs the build, type check, local-link checks, and browser tests. Browser tests mount the built site at `/alpinejs-shopify-cart/` to exercise real GitHub Pages subpath behavior. Screenshots are saved under ignored `test-results/` and uploaded by CI.

The home demo imports the repository's actual plugin source and supplies an in-memory runtime via `createPlugin`. It never contacts Shopify and does not expose store identifiers or credentials. Documentation is static HTML with Alpine used only for navigation filtering, active-section tracking, and copy controls.

## Publish

`.github/workflows/pages.yml` validates pull requests. On changes to main it publishes `site/dist` through GitHub Actions Pages. In the repository's Pages settings, the source must be **GitHub Actions**.

Expected project URL: https://billynoyes.github.io/alpinejs-shopify-cart/

No custom domain has been configured. Vite uses a relative base so assets work both locally and under the project path. Internal page navigation is relative; do not use `/docs/` or `/` as site-internal links.

## Content maintenance

The package is not published on npm. Installation examples currently build the live-tested revision from PR #2. Update these examples, the development notice, and `public/llms.txt` when a release becomes available. Do not introduce an npm/CDN install command before verifying that version exists.

The docs describe known limitations such as default Shopify action reloads, snapshot-derived quantities, and disposal semantics. Preserve these qualifiers when editing.

See `DESIGN.md` and `ASSETS.md` for design decisions and font provenance.
