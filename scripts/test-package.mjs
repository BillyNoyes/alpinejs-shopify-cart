import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const files = await readdir(new URL('../dist', import.meta.url));
const cdn = await readFile(new URL('../dist/alpinejs-shopify-cart.min.js', import.meta.url), 'utf8');
assert.ok(cdn.includes(`Alpine.js Shopify Cart v${packageJson.version}`));
assert.deepEqual(files.sort(), ['alpinejs-shopify-cart.js', 'alpinejs-shopify-cart.min.js', 'index.cjs', 'index.js']);

const temporary = await mkdtemp(join(tmpdir(), 'alpine-cart-package-'));
try {
  const npmPath = process.env.npm_execpath;
  const pack = execFileSync(npmPath ? process.execPath : 'npm', [
    ...(npmPath ? [npmPath] : []), 'pack', '--json', '--ignore-scripts', '--pack-destination', temporary,
  ], { encoding: 'utf8' });
  const [{ filename, files: packedFiles }] = JSON.parse(pack);
  assert.ok(packedFiles.every(({ path }) =>
    ['package.json', 'index.d.ts', 'LICENSE', 'README.md'].includes(path) || path.startsWith('dist/')));

  const installed = join(temporary, 'node_modules', packageJson.name);
  await mkdir(installed, { recursive: true });
  execFileSync('tar', ['-xzf', join(temporary, filename), '-C', installed, '--strip-components=1']);
  const consumer = join(temporary, 'consumer.mjs');
  await writeFile(consumer, `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import plugin, * as esm from 'alpinejs-shopify-cart';
    const cjs = createRequire(import.meta.url)('alpinejs-shopify-cart');
    assert.equal(typeof plugin, 'function');
    assert.equal(typeof cjs.default, 'function');
    assert.equal(typeof esm.createPlugin, 'function');
    assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
    assert.equal(esm.STORE_NAME, 'shopifyCart');
    assert.ok(Object.isFrozen(esm.ALL_EVENTS));
    assert.equal(typeof cjs.createPlugin, 'function');
  `);
  execFileSync(process.execPath, [consumer], { stdio: 'inherit' });

  const bundled = await build({
    stdin: { contents: "import 'alpinejs-shopify-cart/cdn';", resolveDir: temporary },
    bundle: true, write: false, treeShaking: true, metafile: true,
  });
  assert.ok(Object.values(bundled.metafile.outputs).some(output =>
    Object.entries(output.inputs).some(([path, input]) => path.endsWith('alpinejs-shopify-cart.min.js') && input.bytesInOutput > 0)),
  'The auto-registering CDN entry must not be tree-shaken away');

  console.log('Packed ESM/CommonJS exports and CDN side effects are valid in an isolated consumer.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
