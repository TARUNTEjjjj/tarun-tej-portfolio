import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..', 'dist');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique.');
for (const [, value] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  if (value.startsWith('#')) assert(ids.includes(value.slice(1)), `Missing anchor ${value}`);
  else if (!/^(https?:|mailto:|data:)/.test(value)) assert(existsSync(resolve(root, value.replace(/^\//, ''))), `Missing local asset ${value}`);
}
for (const path of ['app.js', 'scene.js', 'ui-state.js', 'vendor/three.module.js', 'vendor/three.core.js']) {
  const source = readFileSync(resolve(root, path), 'utf8');
  for (const [, value] of source.matchAll(/(?:from\s*|import\s*\()['"](\.[^'"]+)['"]/g)) {
    assert(existsSync(resolve(root, dirname(path), value)), `Missing module ${value}`);
  }
}
assert(readFileSync(resolve(root, 'assets/Avula-Tarun-Tej-Coding-Resume.pdf')).subarray(0, 5).equals(Buffer.from('%PDF-')), 'Résumé must be a PDF.');
const release=JSON.parse(readFileSync(resolve(root,'app-version.json'),'utf8'));
assert.equal(release.project,'tarun-tej-portfolio');
assert.match(release.version,/^[a-f0-9]{64}$/);
for(const page of ['index.html','resources/index.html']) assert.ok(readFileSync(resolve(root,page),'utf8').includes(`name="app-version" content="${release.version}"`));
for(const worker of ['offline-resources-worker.js','resources/offline-worker.js']) {
  const source=readFileSync(resolve(root,worker),'utf8');
  assert.ok(source.includes(`const APP_VERSION = "${release.version}"`));
  assert.doesNotMatch(source,/APP_UPDATE_PROTOCOL|APP_VERSION \*\//);
}
assert.deepEqual(readFileSync(resolve(root,'resources/catalog.json')),readFileSync(resolve(root,'..','resources/catalog.json')));
assert.match(readFileSync(resolve(root, '_headers'), 'utf8'), /\/offline-resources-worker\.js\n  Cache-Control: no-cache/);
console.log('Local assets, module imports, section anchors and résumé PDF verified.');

const files = ['index.html', 'styles.css', 'app.js', 'ui-state.js'];
const entryBytes = files.reduce((sum, name) => sum + readFileSync(resolve(root, name)).byteLength, 0);
assert(entryBytes < 100_000, 'First-load source must remain under 100 KB before compression.');
console.log(`First-load HTML/CSS/UI: ${entryBytes} bytes before compression; 3D is optional.`);
