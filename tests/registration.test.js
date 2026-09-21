import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createPlugin, STORE_NAME } from '../src/index.js';

const bundle = readFileSync(new URL('../dist/alpinejs-shopify-cart.min.js', import.meta.url), 'utf8');

test('registration can retry when store registration fails before installing the store', () => {
  let attempts = 0;
  let state;
  const alpine = {
    store(name, value) {
      if (value === undefined) return state;
      if (++attempts === 1) throw new Error('Setup failed');
      state = value;
    },
    magic() {},
  };
  const plugin = createPlugin();
  assert.throws(() => plugin(alpine), /Setup failed/);
  plugin(alpine);
  plugin(alpine);
  assert.equal(attempts, 2);
  assert.ok(state);
});

test('pre-existing stores are never overwritten', () => {
  const existing = {};
  const alpine = {
    store(name, value) {
      assert.equal(name, STORE_NAME);
      assert.equal(value, undefined);
      return existing;
    },
    magic() { assert.fail('No magic should be installed after a collision'); },
  };
  assert.throws(() => createPlugin()(alpine), /already registered/);
});

test('CDN auto-registration marks success only after the plugin is accepted', () => {
  let calls = 0;
  const window = { Alpine: { plugin() {
    if (++calls === 1) throw new Error('Registration failed');
  } } };
  assert.throws(() => runInNewContext(bundle, { window }), /Registration failed/);
  assert.equal(window.__alpineJsShopifyCartRegistered, undefined);
  runInNewContext(bundle, { window });
  runInNewContext(bundle, { window });
  assert.equal(window.__alpineJsShopifyCartRegistered, true);
  assert.equal(calls, 2);
});
