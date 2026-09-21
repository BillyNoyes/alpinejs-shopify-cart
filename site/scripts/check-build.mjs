import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve('dist');
for (const file of ['index.html', 'docs/index.html']) {
  const html = await readFile(resolve(root, file), 'utf8');
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${file}: one h1`);
  assert.ok(!html.includes('@VERSION'), 'No unreleased CDN placeholders');
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(value)) continue;
    assert.ok(!value.startsWith('/'), `${file}: root-absolute URL ${value} breaks project Pages`);
    const [path, hash] = value.split('#');
    const target = path ? resolve(dirname(resolve(root, file)), path) : resolve(root, file);
    const targetFile = path.endsWith('/') ? resolve(target, 'index.html') : target;
    await access(targetFile);
    if (hash) {
      const content = await readFile(targetFile, 'utf8');
      assert.ok(content.includes(`id="${hash}"`), `${file}: broken anchor ${value}`);
    }
  }
}
console.log('Both routes, assets, and documentation anchors resolve under a project Pages base.');
