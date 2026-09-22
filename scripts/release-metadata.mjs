const packageName = 'alpinejs-shopify-cart';
const repository = 'git+https://github.com/BillyNoyes/alpinejs-shopify-cart.git';
const registry = 'https://registry.npmjs.org/';

export function releaseMetadata(metadata, ref, lock) {
  if (metadata.name !== packageName || metadata.private === true) {
    throw new Error(`Releases must publish the public ${packageName} package`);
  }
  if (metadata.repository?.url !== repository) {
    throw new Error('The repository must match the npm trusted publisher');
  }
  if (metadata.publishConfig?.access !== 'public' || metadata.publishConfig?.registry !== registry) {
    throw new Error('Releases must target the public npm registry');
  }

  const version = metadata.version;
  const match = typeof version === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version);
  if (!match || match[0] !== version) {
    throw new Error('Release versions must be stable or numbered alpha, beta, or rc versions');
  }
  if (ref !== `refs/tags/v${version}`) {
    throw new Error(`Release tag must be v${version}, matching package.json`);
  }
  if (lock?.name !== packageName || lock?.version !== version ||
      lock?.packages?.['']?.name !== packageName || lock?.packages?.['']?.version !== version) {
    throw new Error('package-lock.json must match the package name and version');
  }

  return { version, distTag: match[4] ?? 'latest', tarball: `${packageName}-${version}.tgz` };
}
