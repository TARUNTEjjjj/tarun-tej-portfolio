// Static fallback for browsers that cannot run app.js: no module support, syntax they cannot parse, an early error
// or a failed download. app.js marks <html class="app-ready"> once it has set up the page. Deferred and module scripts
// all run before DOMContentLoaded, so this check sees the outcome; without the mark, the page gets the styles used
// without JavaScript, which keep the navigation visible and hide controls that would do nothing.
// Keep this file ES5 so that it runs in the browsers that cannot run app.js.
document.addEventListener('DOMContentLoaded', function () {
  if (document.documentElement.classList.contains('app-ready')) return;
  var fallback = document.getElementById('static-fallback');
  // With scripting enabled, a <noscript> element holds its markup as text.
  if (fallback) fallback.insertAdjacentHTML('afterend', fallback.textContent);
});
