import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const esm = await import('alpinejs-shopify-cart');
const cjs = require('alpinejs-shopify-cart');
const files = await readdir(new URL('../dist', import.meta.url));
const cdn = await readFile(
  new URL('../dist/alpinejs-shopify-cart.min.js', import.meta.url),
  'utf8',
);

assert.equal(typeof esm.default, 'function');
assert.equal(typeof esm.createPlugin, 'function');
assert.equal(typeof cjs.default, 'function');
assert.equal(typeof cjs.createPlugin, 'function');
assert.ok(cdn.includes(`Alpine.js Shopify Cart v${packageJson.version}`));
assert.deepEqual(files.sort(), [
  'alpinejs-shopify-cart.js',
  'alpinejs-shopify-cart.min.js',
  'index.cjs',
  'index.js',
]);

console.log('ESM, CommonJS, and CDN package artifacts are valid');
