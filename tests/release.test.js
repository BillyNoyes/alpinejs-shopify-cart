import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { releaseMetadata } from '../scripts/release-metadata.mjs';

const source = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const metadata = (version = '1.0.0') => ({ ...source, version });
const lock = (version = '1.0.0') => ({
  name: source.name, version, packages: { '': { name: source.name, version } },
});

test('release metadata routes stable versions to latest and prereleases to their own tags', () => {
  for (const [version, distTag] of [
    ['1.0.0', 'latest'], ['1.0.1', 'latest'], ['1.1.0-alpha.0', 'alpha'],
    ['1.1.0-beta.2', 'beta'], ['2.0.0-rc.1', 'rc'],
  ]) {
    assert.deepEqual(releaseMetadata(metadata(version), `refs/tags/v${version}`, lock(version)), {
      version, distTag, tarball: `alpinejs-shopify-cart-${version}.tgz`,
    });
  }
});

test('release metadata rejects a branch, a mismatched tag, or an unsupported version', () => {
  for (const ref of ['refs/heads/main', 'v1.0.0', 'refs/tags/v0.1.0', 'refs/tags/v1.0.0-extra']) {
    assert.throws(() => releaseMetadata(metadata(), ref, lock()), /Release tag/);
  }
  for (const version of ['01.0.0', '1.0', '1.0.0-beta', '1.0.0-beta.01', '1.0.0-dev.1', '1.0.0+build', '1.0.0\n', '1.0.0;echo unsafe']) {
    assert.throws(() => releaseMetadata(metadata(version), `refs/tags/v${version}`, lock(version)), /Release versions/);
  }
});

test('release metadata rejects the wrong package, repository, privacy, and registry', () => {
  for (const changes of [
    { name: 'another-package' }, { private: true }, { repository: { url: 'https://github.com/other/repo.git' } },
    { publishConfig: { access: 'restricted', registry: 'https://registry.npmjs.org/' } },
    { publishConfig: { access: 'public', registry: 'https://example.invalid/' } },
  ]) {
    assert.throws(() => releaseMetadata({ ...metadata(), ...changes }, 'refs/tags/v1.0.0', lock()));
  }
});

test('release metadata rejects stale lockfile metadata', () => {
  for (const stale of [undefined, lock('0.1.0'), { ...lock(), name: 'wrong' }, {
    ...lock(), packages: { '': { name: source.name, version: '0.1.0' } },
  }]) {
    assert.throws(() => releaseMetadata(metadata(), 'refs/tags/v1.0.0', stale), /package-lock/);
  }
});

test('current package and lockfile agree for a future matching release tag', () => {
  const currentLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(releaseMetadata(source, `refs/tags/v${source.version}`, currentLock).version, source.version);
});
