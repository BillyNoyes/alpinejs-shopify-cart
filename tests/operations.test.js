import assert from 'node:assert/strict';
import test from 'node:test';
import { createCartOperations } from '../src/operations.js';

function setup() {
  const state = { cart: null, pendingCount: 0, pendingOperation: null, error: null, userErrors: [], warnings: [] };
  return { state, operations: createCartOperations(() => state) };
}

test('a rejected queued call does not stop the next call or corrupt pending state', async () => {
  const { state, operations } = setup();
  const failure = new Error('Request failed');
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const first = operations.enqueue('add', async () => { await barrier; throw failure; });
  const rejected = assert.rejects(first, failure);
  const second = operations.enqueue('update', async operation => {
    assert.equal(state.error, null);
    return operations.applyResult({ cart: { totalQuantity: 2 } }, operation.revision);
  });

  assert.equal(state.pendingCount, 2);
  release();
  await rejected;
  await second;
  assert.equal(state.pendingCount, 0);
  assert.equal(state.pendingOperation, null);
  assert.equal(state.cart.totalQuantity, 2);
});

test('stale results and failures cannot overwrite newer state', () => {
  const { state, operations } = setup();
  const older = operations.nextRevision();
  const newer = operations.nextRevision();
  operations.applyResult({ cart: { totalQuantity: 3 } }, newer);
  let called = false;
  operations.applyResult({ cart: { totalQuantity: 1 } }, older, () => { called = true; });
  operations.applyError(new Error('Stale failure'), older);
  assert.equal(state.cart.totalQuantity, 3);
  assert.equal(state.error, null);
  assert.equal(called, false);
});

test('user errors suppress metadata callbacks while warnings preserve successful updates', () => {
  const { state, operations } = setup();
  let called = 0;
  const rejected = { cart: null, userErrors: [{ message: 'Invalid note' }], detail: { source: 'test' } };
  assert.equal(operations.applyResult(rejected, operations.nextRevision(), () => { called++; }), rejected);
  assert.equal(called, 0);
  assert.equal(state.detail, rejected.detail);

  const adjusted = { cart: { totalQuantity: 2 }, warnings: [{ message: 'Adjusted quantity' }] };
  operations.applyResult(adjusted, operations.nextRevision(), () => { called++; });
  assert.equal(called, 1);
  assert.deepEqual(state.userErrors, []);
  assert.equal(state.warnings, adjusted.warnings);
});

test('operation registries are isolated and disposal suppresses late reconciliation', async () => {
  const first = setup();
  const second = setup();
  first.operations.begin('add');
  assert.equal(first.state.pendingCount, 1);
  assert.equal(second.state.pendingCount, 0);
  first.operations.dispose();
  first.operations.applyResult({ cart: { totalQuantity: 9 } }, first.operations.nextRevision());
  first.operations.applyError(new Error('Late rejection'), first.operations.nextRevision());
  assert.equal(first.state.cart, null);
  assert.equal(first.state.error, null);
  assert.equal(first.state.pendingCount, 0);
  await assert.rejects(first.operations.enqueue('update', () => {}), /disposed/);
});
