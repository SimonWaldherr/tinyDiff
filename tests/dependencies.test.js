import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const site = new URL('../site/', import.meta.url);
const read = (name) => readFileSync(new URL(name, site), 'utf8');
function localAsset(path, from) {
  assert(path.startsWith('./') || path.startsWith('../'), `${from}: non-relative asset ${path}`);
  const resolved = new URL(path, new URL(from, site));
  assert(resolved.href.startsWith(site.href), `${from}: asset outside site`);
  resolved.search = '';
  resolved.hash = '';
  assert(existsSync(resolved), `${from}: missing asset ${path}`);
}
test('runtime assets and module imports are bundled locally', () => {
  const html = read('index.html');
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('#')) localAsset(match[1], 'index.html');
  }
  for (const file of readdirSync(site, { recursive: true }).filter(
    (name) => name.endsWith('.js') && !name.startsWith('vendor/')
  )) {
    const js = read(file);
    for (const match of js.matchAll(
      /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]/g
    ))
      localAsset(match[1] || match[2], file);
    for (const match of js.matchAll(/new URL\(['"]([^'"]+)['"],\s*import\.meta\.url\)/g))
      localAsset(match[1], file);
  }
  const css = read('style.css');
  assert(!/@import\b|@font-face\b/i.test(css), 'CSS must not import styles or load fonts');
  for (const match of css.matchAll(/url\(\s*['"]?([^'"\s)]+)/g)) localAsset(match[1], 'style.css');
});
test('CSP blocks external runtime resources and no npm packages are required', () => {
  const policy = read('index.html').match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/
  )[1];
  const directives = new Map(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .map(([name, ...values]) => [name, values])
  );
  for (const name of ['font-src', 'media-src', 'object-src'])
    assert.deepEqual(directives.get(name), ["'none'"], name);
  for (const name of ['default-src', 'style-src', 'worker-src'])
    assert.deepEqual(directives.get(name), ["'self'"], name);
  assert.deepEqual(directives.get('connect-src'), ["'self'"]);
  assert.deepEqual(directives.get('script-src'), ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(directives.get('img-src'), ["'self'", 'data:', 'blob:']);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
    assert.equal(Object.keys(pkg[key] || {}).length, 0, key);
});

test('published code includes its licenses and pinned parser artifacts', () => {
  assert.equal(read('LICENSE'), readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'));
  assert(read('index.html').includes('href="./LICENSE"'));
  const manifest = JSON.parse(
    readFileSync(new URL('../scripts/parser-manifest.json', import.meta.url), 'utf8')
  );
  for (const file of readdirSync(new URL('vendor/tree-sitter/', site))) {
    if (/\.(js|wasm|LICENSE)$/.test(file))
      assert(file in manifest, `Unpinned vendor artifact: ${file}`);
  }
  for (const [file, metadata] of Object.entries(manifest)) {
    const bytes = readFileSync(new URL(`vendor/tree-sitter/${file}`, site));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256, file);
    assert(metadata.version);
    assert(existsSync(new URL(`vendor/tree-sitter/${metadata.package}.LICENSE`, site)));
  }
});
