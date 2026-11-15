import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../dist/fallback.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const styles = '<style>.menu-toggle{display:none!important}</style>';

// Runs fallback.js against a minimal document whose <html> carries the given classes at DOMContentLoaded.
function runFallback(classes) {
  const inserted = [];
  let onReady;
  const document = {
    documentElement: { classList: { contains: name => classes.includes(name) } },
    getElementById: id => (id === 'static-fallback' ? { textContent: styles, insertAdjacentHTML: (position, markup) => inserted.push([position, markup]) } : null),
    addEventListener: (type, listener) => { if (type === 'DOMContentLoaded') onReady = listener; },
  };
  runInNewContext(source, { document });
  assert.equal(typeof onReady, 'function', 'fallback.js decides at DOMContentLoaded, after app.js has run or failed');
  onReady();
  return inserted;
}

test('the static fallback stays off when app.js has set up the page', () => {
  assert.deepEqual(runFallback(['js-reveal', 'app-ready']), []);
});
test('the no-JavaScript styles apply when app.js could not run', () => {
  assert.deepEqual(runFallback([]), [['afterend', styles]]);
});
test('index.html loads fallback.js as a classic deferred script and keeps the fallback styles separate from the notice', () => {
  // A classic script runs without module support; deferred (not async), it is listening before DOMContentLoaded.
  assert.match(html, /<script defer src="fallback\.js"><\/script>/);
  // fallback.js inserts this element's whole text, so it must hold only the stylesheet; the notice asks visitors to
  // enable JavaScript, which would be wrong where JavaScript is on but app.js failed.
  assert.match(html, /<noscript id="static-fallback"><style>[^<]+<\/style><\/noscript>/);
});
test('fallback.js uses only ES5 syntax, so it runs in browsers that cannot run app.js', () => {
  const code = source.replace(/\/\/[^\n]*/g, '');
  for (const [pattern, feature] of [[/=>/, 'arrow functions'], [/\b(?:let|const|class)\s/, 'let, const or class'], [/`/, 'template literals'], [/\?\.|\?\?/, 'optional chaining or ??'], [/\.\.\./, 'spread or rest']]) {
    assert.doesNotMatch(code, pattern, `fallback.js must not use ${feature}`);
  }
});
