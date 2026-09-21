import * as esbuild from 'esbuild';
import { readFile, rm } from 'node:fs/promises';

const packageJson = JSON.parse(
  await readFile(new URL('./package.json', import.meta.url), 'utf8'),
);
const banner = `/*! Alpine.js Shopify Cart v${packageJson.version} | MIT License */`;

await rm(new URL('./dist', import.meta.url), { recursive: true, force: true });

const shared = {
  bundle: true,
  target: ['es2020'],
  legalComments: 'none',
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['src/index.js'],
    outfile: 'dist/index.js',
    format: 'esm',
    minify: true,
    banner: { js: banner },
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/index.js'],
    outfile: 'dist/index.cjs',
    format: 'cjs',
    minify: true,
    banner: { js: banner },
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/cdn.js'],
    outfile: 'dist/alpinejs-shopify-cart.js',
    format: 'iife',
    minify: false,
    banner: { js: banner },
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/cdn.js'],
    outfile: 'dist/alpinejs-shopify-cart.min.js',
    format: 'iife',
    minify: true,
    banner: { js: banner },
  }),
]);
