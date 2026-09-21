# Repository guidance

## Delivery

For `BillyNoyes/alpinejs-shopify-cart` only, the owner has requested that validated work go directly into `main` without waiting for a separate PR merge approval. Preserve unrelated work and never force-push. This permission does not apply to other repositories, npm publication, releases, or Shopify store/theme changes.

## Architecture

Keep the package entry point focused on Alpine registration. Shopify transport, event observation, operation ordering, and reactive store methods belong in focused internal modules. Preserve the public API in `index.d.ts` and package exports when refactoring.

## Validation

- Run `npm test` at the repository root for unit, type, package, and browser checks.
- Run `npm run check` inside `site/` for production build, links, types, accessibility, and browser checks.
- Rebuild and commit `dist/` with source changes; CI checks generated-file consistency.
- The site imports the real plugin source with a local-only demo transport, so source refactors require site checks too.
- Do not claim live Shopify validation from mocks. Live store operations require explicit authorization.
- Keep live-test store domains, theme IDs, variant IDs, cart identifiers, and credentials out of committed files, commit messages, PR text, and public artifacts. Describe tests using generic development-store references.

## Website

Preserve the design commitments in `site/DESIGN.md`: Easel's fonts and spacing, Alpine/Tailwind/Vite, a desktop viewport-fitting home page, and a separate readable docs page. Keep release status and installation examples accurate. GitHub Pages deploys from main; do not publish an npm package as part of site work.
