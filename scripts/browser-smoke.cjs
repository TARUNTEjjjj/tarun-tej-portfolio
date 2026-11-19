const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const baseURL = process.env.PORTFOLIO_URL || 'http://127.0.0.1:4173';
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const checks = [];
// Optional catalog/offline refreshes can outlive a working page. Wait for the actual
// interface contract, not a quiet network; scene checks below still await their own state.
async function openPortfolio(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('html.app-ready').waitFor({ state: 'attached' });
  return response;
}
(async () => {
  mkdirSync('qa', { recursive: true });
  const browser = await chromium.launch(options);
  try {
    // Cloudflare Pages adds the dist/_headers rules to every response, the Content-Security-Policy among them; the
    // preview server does not. Every context gets them here, so a change the policy would block fails before production.
    const { parseHeaders, applyHeaders } = await import('./pages-headers.mjs');
    const headerRules = parseHeaders(readFileSync(path.join(__dirname, '..', 'dist', '_headers'), 'utf8'));
    const policyViolations = [];
    const newContext = async (contextOptions, target = browser) => {
      const productionContext = await target.newContext(contextOptions);
      await productionContext.route(url => url.origin === new URL(baseURL).origin, async route => {
        try {
          const response = await route.fetch({ maxRedirects: 0 });
          // The body is handed on decoded, so the fulfilled response sets its own length and encoding.
          const { 'content-length': length, 'content-encoding': encoding, ...headers } = response.headers();
          await route.fulfill({ status: response.status(), headers: applyHeaders(headerRules, route.request().url(), headers), body: await response.body() });
        } catch (error) {
          // Fail the request rather than serve it without the production headers; say why unless the browser is closing.
          if (!/closed|disposed/i.test(error.message)) console.error(`Could not read ${route.request().url()}: ${error.message.split('\n')[0]}`);
          await route.abort().catch(() => {});
        }
      });
      productionContext.on('console', message => { if (message.text().includes('Content Security Policy')) policyViolations.push(message.text()); });
      return productionContext;
    };
    // A background fetch that never answers must not block an otherwise usable case
    // study. This deterministically exercises a condition that can make networkidle hang.
    const pending = await newContext({ reducedMotion: 'reduce' });
    const pendingPage = await pending.newPage();
    let captureRoute;
    await pendingPage.route('**/__readiness-probe', route => { captureRoute(route); });
    await pendingPage.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        window.readinessProbeFinished = false;
        void fetch('/__readiness-probe').catch(() => {}).finally(() => { window.readinessProbeFinished = true; });
      }, { once: true });
    });
    let heldRequestTimeout;
    const heldRequest = new Promise((resolve, reject) => {
      heldRequestTimeout = setTimeout(() => reject(new Error('The readiness probe request was not intercepted')), 30000);
      captureRoute = route => { clearTimeout(heldRequestTimeout); resolve(route); };
    });
    try {
      const [, heldRoute] = await Promise.all([openPortfolio(pendingPage, `${baseURL}/?project=neural`), heldRequest]);
      assert.equal(await pendingPage.evaluate(() => window.readinessProbeFinished), false);
      await assert.rejects(pendingPage.waitForLoadState('networkidle', { timeout: 750 }), { name: 'TimeoutError' }, 'An active background fetch prevents network-idle readiness');
      assert.equal(await pendingPage.locator('dialog').evaluate(element => element.open), true);
      assert.equal(await pendingPage.locator('#dialog-title').textContent(), 'Neural Math Lab');
      await pendingPage.keyboard.press('Escape');
      await pendingPage.locator('[data-filter="math"]').click();
      assert.equal(await pendingPage.locator('.project:visible').count(), 3);
      assert.equal(await pendingPage.evaluate(() => window.readinessProbeFinished), false, 'The UI works before the unrelated response arrives');
      await heldRoute.fulfill({ status: 204, body: '' });
    } finally {
      clearTimeout(heldRequestTimeout);
      await pending.close();
    }
    checks.push('Case studies and filters work while a background request stays pending');
    const context = await newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const home = await openPortfolio(page, baseURL);
    const policy = applyHeaders(headerRules, baseURL)['content-security-policy'];
    assert.ok(policy && home.headers()['content-security-policy'] === policy, 'The page is served with its production Content-Security-Policy');
    await page.waitForSelector('#hero-scene.scene-ready');
    assert.deepEqual(policyViolations, [], 'The page and its 3D scene load without Content-Security-Policy violations');
    // Printing or saving a PDF must include the sections a visitor has not scrolled to yet.
    assert.equal(await page.locator('.reveal:not(.visible)').count() > 0, true, 'Some sections are still waiting to be revealed');
    await page.emulateMedia({ media: 'print' });
    assert.deepEqual(await page.locator('.reveal').evaluateAll(elements => elements.filter(element => getComputedStyle(element).opacity !== '1').length), 0, 'Unrevealed sections print');
    await page.emulateMedia({ media: 'screen' });
    checks.push('Printing includes sections that were not scrolled into view');
    for (const mode of ['math', 'learn', 'build']) {
      await page.locator(`[data-mode="${mode}"]`).click();
      assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.locator('.motion-toggle').click();
    assert.equal(await page.locator('.motion-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.motion-toggle').getAttribute('aria-label'), 'Pause animation');
    await page.screenshot({ path: 'qa/desktop-hero.png' });
    checks.push('3D renders; all themes and pause control work');
    // Resizing clears a WebGL canvas, and ResizeObserver runs after the frame's animation callback has drawn. This reads
    // the canvas straight after the scene's own observer (observers run in creation order), which is what that frame
    // shows: the drawn pixels in a central block, and their summed brightness.
    const drawnAfterResize = target => target.evaluate(() => new Promise(resolve => {
      const container = document.querySelector('#hero-scene'), gl = container.querySelector('canvas').getContext('webgl2');
      container.style.width = '90%';
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        const size = 64, pixels = new Uint8Array(size * size * 4);
        gl.readPixels((gl.drawingBufferWidth - size) >> 1, (gl.drawingBufferHeight - size) >> 1, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let drawn = 0, light = 0;
        for (let index = 0; index < pixels.length; index += 4) if (pixels[index + 3]) { drawn++; light += pixels[index] + pixels[index + 1] + pixels[index + 2]; }
        requestAnimationFrame(() => { container.style.width = ''; });
        resolve({ drawn, light });
      });
      observer.observe(container);
    }));
    assert.ok((await drawnAfterResize(page)).drawn > 0, 'The sculpture is drawn in the frame in which its canvas is resized');
    await page.waitForTimeout(100);
    checks.push('Resizing redraws the 3D sculpture instead of blanking it for a frame');
    for (const [filter, count] of [['web', 3], ['math', 3], ['ml', 1], ['systems', 1], ['all', 6]]) {
      await page.locator(`[data-filter="${filter}"]`).click();
      assert.equal(await page.locator('.project:visible').count(), count);
    }
    checks.push('Project filters expose the correct project sets');
    await page.locator('#project-search').fill('neural');
    assert.equal(await page.locator('.project:visible').count(), 1);
    await page.locator('[data-filter="systems"]').click();
    assert.equal(await page.locator('.project:visible').count(), 0);
    assert.match(await page.locator('#filter-status').textContent(), /No projects match/);
    await page.locator('#clear-project-search').click();
    assert.equal(await page.locator('.project:visible').count(), 6);
    assert.equal(await page.locator('#project-search').inputValue(), '');
    checks.push('Search composes with categories; empty results recover through clear filters');

    const projectLinks = {
      axiom: ['https://axiom-sat.pages.dev/', 'https://github.com/TARUNTEjjjj/axiom-sat'],
      forge: ['https://forge-learning-academy.pages.dev/', 'https://github.com/TARUNTEjjjj/forge-learning-academy'],
      math: ['https://github.com/TARUNTEjjjj/axiom-math'],
      pocket: ['https://github.com/TARUNTEjjjj/pocketkv'],
      storm: ['https://stormsignal-weather.pages.dev/', 'https://github.com/TARUNTEjjjj/stormsignal'],
      neural: ['https://neural-math-lab.pages.dev/', 'https://github.com/TARUNTEjjjj/neural-math-lab'],
    };
    for (const [project, expectedLinks] of Object.entries(projectLinks)) {
      const trigger = page.locator(`.project-visual[data-project="${project}"]`);
      await trigger.click();
      assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
      assert.equal(await page.locator('#dialog-title').count(), 1, `${project} dialog renders its title`);
      const links = await page.locator('.dialog-links a').evaluateAll(elements => elements.map(element => element.href));
      assert.deepEqual(links, expectedLinks, `${project} exposes its live website and public source where available`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog').evaluate(element => element.open), false);
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    }
    const repositories = await page.locator('a[href^="https://github.com/TARUNTEjjjj/"]').evaluateAll(elements =>
      [...new Set(elements.map(element => new URL(element.href).pathname.split('/')[2]))].sort());
    assert.deepEqual(repositories, [
      'attention-atlas', 'avenquellis-proof-grader', 'avenquellis-question-engine', 'avenquellis-web',
      'axiom-math', 'axiom-sat', 'forge-learning-academy', 'forge-macos', 'neural-math-lab',
      'pocketkv', 'stormsignal', 'tarun-tej-portfolio', 'vedaris-jee',
    ]);
    checks.push('Case studies and collection link all 13 public repositories; Escape closes and focus returns');
    // A double-click on × or on the backdrop closes the case study; its second click must not open the card underneath.
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, document.querySelector('.project-grid').getBoundingClientRect().top + scrollY - 40); });
    for (const [target, gap] of [['backdrop', 150], ['close button', 150], ['backdrop', 0], ['close button', 0]]) {
      // Raw mouse input: locator.click() would scroll the page and move the cards out from under the dialog.
      const card = await page.locator('.project-visual[data-project="neural"]').evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
      await page.mouse.click(card.x, card.y);
      assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
      const point = await page.evaluate(target => {
        const neural = document.querySelector('.project-visual[data-project="neural"]').getBoundingClientRect();
        const dialog = document.querySelector('dialog').getBoundingClientRect(), close = document.querySelector('.dialog-close').getBoundingClientRect();
        return target === 'backdrop' ? { x: (neural.left + dialog.left) / 2, y: neural.top + neural.height / 2 } : { x: close.left + close.width / 2, y: close.top + close.height / 2 };
      }, target);
      assert.equal(await page.evaluate(({ x, y }) => [...document.querySelectorAll('[data-project]')].some(card => { const box = card.getBoundingClientRect(); return x > box.left && x < box.right && y > box.top && y < box.bottom; }), point), true, `A project card lies under the ${target}`);
      // A human double-click (the second press arrives after the dialog has closed) and an instant one.
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(gap);
      await page.mouse.down({ clickCount: 2 });
      await page.mouse.up({ clickCount: 2 });
      await page.waitForTimeout(300);
      assert.equal(await page.locator('dialog').evaluate(element => element.open), false, `Double-clicking the ${target} (${gap} ms apart) closes the case study`);
      assert.equal(new URL(page.url()).searchParams.has('project'), false);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'The page scrolls again');
    }
    // Reopening before the last case study's queued close event runs must not leave the page scroll-locked.
    // Under a #fragment, closing and reopening only replace the history entry, so no traversal interleaves.
    await page.evaluate(() => {
      history.replaceState(null, '', '#work');
      for (const selector of ['.project-visual[data-project="neural"]', '.dialog-close', '.project-visual[data-project="storm"]']) document.querySelector(selector).click();
    });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Scrolling unlocks after a quick close and reopen');
    checks.push('Double-clicking × or the backdrop closes the case study without opening the card underneath');
    // After an in-page link (#work), closing must not re-run fragment navigation and lose the reader's place.
    // A fresh document matters: once Chrome has restored scroll for an earlier traversal, it stops re-scrolling.
    await openPortfolio(page, baseURL);
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
    await page.locator('.hero-actions a[href="#work"]').click();
    const pocket = page.locator('.project-visual[data-project="pocket"]');
    await pocket.scrollIntoViewIfNeeded();
    await pocket.focus();
    const readingPosition = await page.evaluate(() => scrollY);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(new URL(page.url()).hash, '#work');
    assert.equal(await pocket.evaluate(element => element === document.activeElement), true, 'Focus returns to the card after an in-page link');
    assert.equal(await page.evaluate(() => scrollY), readingPosition, 'Closing keeps the reading position after an in-page link');
    // The browser's Back button closes it too, by going back to the #work entry; that traversal must not move the page.
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
    await page.goBack();
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('dialog').open, location.search, location.hash]), [false, '', '#work'], 'Back closes the case study');
    assert.equal(await pocket.evaluate(element => element === document.activeElement), true, 'Focus returns to the card after Back');
    assert.equal(await page.evaluate(() => scrollY), readingPosition, 'Closing with Back keeps the reading position after an in-page link');
    // Only a traversal to the address a case study was opened from gets that position back; others land where the
    // browser puts them. From About, Selected work and a case study, history.go(-2) jumps to About; history.go(2) then
    // reopens the case study from About, and Back goes to Selected work, which is not where it was opened from.
    await page.locator('#main-navigation a[href="#about"]').click();
    await page.locator('#main-navigation a[href="#work"]').click();
    await pocket.focus();
    const cardPosition = await page.evaluate(() => scrollY);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
    await page.evaluate(() => history.go(-2));
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('dialog').open, location.search, location.hash]), [false, '', '#about'], 'history.go(-2) closes the case study on the About entry');
    const aboutPosition = await page.evaluate(() => scrollY);
    assert.notEqual(aboutPosition, cardPosition, 'A jump past the entry a case study was opened from does not return to its card');
    await page.evaluate(() => history.go(2));
    await page.waitForTimeout(400);
    assert.equal(await page.locator('dialog').evaluate(element => element.open), true, 'history.go(2) reopens the case study');
    await page.goBack();
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('dialog').open, location.search, location.hash]), [false, '', '#work'], 'Back closes the reopened case study');
    assert.notEqual(await page.evaluate(() => scrollY), aboutPosition, 'Back from a case study reopened on About does not scroll to the About position');
    checks.push('Closing a case study after an in-page link keeps focus and scroll position');
    await page.locator('.copy-email').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'avulataruntej123@gmail.com');
    for (const file of ['Avula-Tarun-Tej-Coding-Resume.pdf', 'Avula-Tarun-Tej-GitHub-Projects-Resume.pdf']) {
      assert(await page.locator(`a[href="assets/${file}"]`).count() > 0, `${file} is linked`);
      const pdf = await context.request.get(`${baseURL}/assets/${file}`);
      assert.equal(pdf.status(), 200);
      assert.equal((await pdf.body()).subarray(0, 5).toString(), '%PDF-');
    }
    checks.push('Email copy and both résumé downloads work');
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
    }
    // On phones the email arrow sits beside the heading's short last line ("in mind?"), clear of "Have something".
    for (const width of [390, 430, 500, 700]) {
      await page.setViewportSize({ width, height: 900 });
      // An idle page can apply media queries a moment after a resize; unwaited, 500px may still use the ≤480px rules.
      await page.waitForTimeout(120);
      const arrow = await page.evaluate(() => {
        const circle = document.querySelector('.contact-arrow').getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#contact-title').firstChild);
        const earlierLines = [...range.getClientRects()].filter(rect => rect.width > 0);
        const lastLine = [...document.querySelector('#contact-title em').getClientRects()];
        return { belowEarlierLines: circle.top >= Math.max(...earlierLines.map(rect => rect.bottom)) - 0.5, rightOfLastLine: circle.left >= Math.max(...lastLine.map(rect => rect.right)) };
      });
      assert.deepEqual(arrow, { belowEarlierLines: true, rightOfLastLine: true }, `The contact arrow overlaps the heading at ${width}px`);
    }
    checks.push('The contact arrow stays clear of the heading on phones');
    // A scroll container around the filters would cut off their keyboard focus ring (3px, offset 6px) on narrow screens.
    for (const width of [700, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      await page.locator('[data-filter="all"]').focus();
      await page.keyboard.press('Shift+Tab');
      for (const filter of ['all', 'web', 'math', 'ml', 'systems']) {
        await page.keyboard.press('Tab');
        assert.deepEqual(await page.evaluate(() => {
          const element = document.activeElement, style = getComputedStyle(element), box = element.getBoundingClientRect();
          const grow = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
          const clippedBy = [];
          for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
            const nodeStyle = getComputedStyle(node), clip = node.getBoundingClientRect();
            if (nodeStyle.overflowX === 'visible' && nodeStyle.overflowY === 'visible') continue;
            const inside = box.left - grow >= clip.left + parseFloat(nodeStyle.borderLeftWidth) && box.right + grow <= clip.right - parseFloat(nodeStyle.borderRightWidth) &&
              box.top - grow >= clip.top + parseFloat(nodeStyle.borderTopWidth) && box.bottom + grow <= clip.bottom - parseFloat(nodeStyle.borderBottomWidth);
            if (!inside) clippedBy.push(node.className || node.tagName);
          }
          return { filter: element.dataset.filter, ring: style.outlineStyle !== 'none' && grow > 0, clippedBy };
        }), { filter, ring: true, clippedBy: [] }, `The ${filter} filter's focus ring is visible and unclipped at ${width}px`);
      }
    }
    checks.push('Filter focus rings are not clipped on narrow screens');
    await page.setViewportSize({ width: 390, height: 844 });
    await openPortfolio(page, baseURL);
    await page.waitForLoadState('load');
    assert.equal(await page.locator('#hero-scene').getAttribute('data-scene-state'), 'deferred');
    await page.locator('.scene-enable').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#hero-scene.scene-ready');
    assert.equal(await page.evaluate(() => document.activeElement.matches('[data-mode][aria-pressed="true"]')), true, 'Enabling 3D keeps keyboard focus on the sculpture controls');
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#main-navigation a[href="#about"]').click();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'qa/mobile-hero.png' });
    // Reveal content before the full-page layout capture.
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach(element => element.classList.add('visible')));
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'qa/mobile-full.png', fullPage: true });
    checks.push('Mobile menu works; no overflow from 320px to 1440px');
    assert.equal(await page.locator('#static-fallback + style').count(), 0, 'The static fallback stays off when app.js runs');
    assert.deepEqual(errors, [], 'No browser console errors on supported WebGL path');
    await context.close();
    const reduced = await newContext({ reducedMotion: 'reduce' });
    const reducedPage = await reduced.newPage();
    await openPortfolio(reducedPage, baseURL);
    assert.equal(await reducedPage.locator('.motion-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await reducedPage.locator('html').evaluate(element => getComputedStyle(element).scrollBehavior), 'auto');
    checks.push('Reduced-motion preference starts with animation paused');
    // WCAG AA text contrast (4.5:1, or 3:1 for large text) against each text run's solid background, faded by opacity.
    // Out of scope: decorative artwork (aria-hidden), text on gradient card art, and the header, which is drawn over
    // the hero without being inside it.
    const lowContrast = scope => reducedPage.evaluate(scope => {
      const channels = value => value.match(/[\d.]+/g).map(Number);
      const linear = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      const failures = [], runs = [];
      const walker = document.createTreeWalker(document.querySelector(scope), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) runs.push([walker.currentNode.parentElement, walker.currentNode.nodeValue]);
      // A placeholder is not a text node: the browser draws it in the field's ::placeholder colour and opacity.
      for (const field of document.querySelector(scope).querySelectorAll('[placeholder]')) runs.push([field, field.placeholder, '::placeholder']);
      for (const [element, content, pseudo] of runs) {
        if (!content.trim() || element.closest('[aria-hidden="true"], .sr-only, [hidden], noscript, .site-header') || !element.getClientRects().length) continue;
        const style = getComputedStyle(element, pseudo);
        let [r, g, b, alpha = 1] = channels(style.color);
        if (pseudo) alpha *= Number(style.opacity);
        let background;
        for (let node = element; node && !background; node = node.parentElement) {
          const nodeStyle = getComputedStyle(node);
          if (nodeStyle.backgroundImage !== 'none') break;
          const fill = channels(nodeStyle.backgroundColor);
          if (fill[3] === undefined || fill[3] === 1) background = fill; else if (fill[3] > 0) break;
          else alpha *= Number(nodeStyle.opacity);
        }
        if (!background || style.visibility !== 'visible' || alpha === 0) continue;
        const text = [r, g, b].map((channel, index) => alpha * channel + (1 - alpha) * background[index]);
        const [light, dark] = [luminance(text), luminance(background)].sort((x, y) => y - x);
        const ratio = (light + 0.05) / (dark + 0.05), size = parseFloat(style.fontSize);
        const needed = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
        if (ratio < needed) failures.push(`${ratio.toFixed(2)}:1 "${content.trim().slice(0, 30)}" (${element.className || element.tagName}${pseudo || ''})`);
      }
      return failures;
    }, scope);
    assert.deepEqual(await lowContrast('body'), [], 'Page text meets WCAG AA contrast');
    await reducedPage.locator('.project-visual[data-project="math"]').click();
    assert.deepEqual(await lowContrast('#project-dialog'), [], 'Case-study text meets WCAG AA contrast');
    await reducedPage.keyboard.press('Escape');
    checks.push('Text meets WCAG AA contrast on the page and in case studies');
    await reduced.close();
    const fallback = await newContext();
    const fallbackPage = await fallback.newPage();
    const fallbackErrors = [];
    fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
    fallbackPage.on('console', message => { if (message.type() === 'error') fallbackErrors.push(message.text()); });
    await fallbackPage.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type.startsWith('webgl') ? null : getContext.call(this, type, ...args); };
    });
    await openPortfolio(fallbackPage, baseURL);
    // The CSS sculpture also shows while 3D waits and loads: let the attempt finish, then check where it ended.
    await fallbackPage.waitForSelector('#hero-scene:is([data-scene-state="ready"], [data-scene-state="fallback"])');
    assert.deepEqual(await fallbackPage.evaluate(() => ({
      state: document.querySelector('#hero-scene').dataset.sceneState,
      sculptureOpacity: getComputedStyle(document.querySelector('.sculpture-fallback')).opacity,
      enableDisabled: document.querySelector('.scene-enable').disabled,
      pauseDisabled: document.querySelector('.motion-toggle').disabled,
      status: document.querySelector('#scene-status').textContent,
    })), { state: 'fallback', sculptureOpacity: '1', enableDisabled: true, pauseDisabled: true, status: '3D is unavailable here. The lightweight artwork remains visible.' },
    'Without WebGL the hero settles on the CSS sculpture and says why');
    await fallbackPage.locator('[data-filter="math"]').click();
    assert.equal(await fallbackPage.locator('.project:visible').count(), 3);
    assert.deepEqual(fallbackErrors.filter(text => !text.includes('Error creating WebGL context')), [], 'Only the missing WebGL context is reported');
    checks.push('WebGL-unavailable fallback preserves content and controls');
    await fallback.close();
    const tablet = await newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
    const tabletPage = await tablet.newPage();
    await openPortfolio(tabletPage, baseURL);
    await tabletPage.waitForLoadState('load');
    await tabletPage.waitForTimeout(2000);
    assert.equal(await tabletPage.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'Touch emulation reports a coarse pointer');
    assert.equal(await tabletPage.locator('#hero-scene').getAttribute('data-scene-state'), 'deferred', 'Wide touch screens wait for 3D consent');
    checks.push('Touch screens wider than 760px wait for 3D consent');
    await tablet.close();
    const shared = await newContext({ viewport: { width: 1440, height: 1000 } });
    const sharedPage = await shared.newPage();
    const sceneRequests = [];
    sharedPage.on('request', request => { if (new URL(request.url()).pathname === '/scene.js') sceneRequests.push(request.url()); });
    await openPortfolio(sharedPage, `${baseURL}/?project=storm`);
    await sharedPage.waitForLoadState('load');
    assert.equal(await sharedPage.locator('dialog').evaluate(element => element.open), true);
    await sharedPage.waitForTimeout(2000);
    assert.equal(await sharedPage.locator('#hero-scene').getAttribute('data-scene-state'), 'deferred', '3D waits while a shared case study is open');
    assert.equal(sceneRequests.length, 0, 'No 3D download behind an open case study');
    await sharedPage.keyboard.press('Escape');
    assert.equal(await sharedPage.evaluate(() => {
      const box = document.activeElement.getBoundingClientRect();
      return document.activeElement === document.body || (box.bottom > 0 && box.top < innerHeight);
    }), true, 'Closing a shared case study leaves focus on screen');
    await sharedPage.waitForSelector('#hero-scene.scene-ready');
    checks.push('A shared case-study link defers 3D until it closes and keeps focus on screen');
    // Firefox before 121 and Chromium 94–104 run the 3D scene but drop every rule that uses :has(); the CSS sculpture
    // must still fade out behind the transparent canvas there.
    await sharedPage.evaluate(() => {
      const drop = list => { for (let index = list.cssRules.length - 1; index >= 0; index--) { const rule = list.cssRules[index]; if (rule.selectorText?.includes(':has(')) list.deleteRule(index); else if (rule.cssRules) drop(rule); } };
      for (const sheet of document.styleSheets) drop(sheet);
    });
    const sculptureHidden = await sharedPage.waitForFunction(() => getComputedStyle(document.querySelector('.sculpture-fallback')).opacity === '0', null, { timeout: 3000 }).then(() => true, () => false);
    assert.equal(sculptureHidden, true, 'The CSS sculpture hides once 3D renders, without relying on :has()');
    checks.push('The CSS sculpture hides once 3D renders, even without :has() support');
    // A lost WebGL context (a phone app sent to the background, a GPU reset) shows the CSS sculpture. Once the browser
    // restores it, the paused scene draws the same frame again, lit by its rebuilt environment map.
    await sharedPage.locator('.motion-toggle').click();
    const beforeLoss = await drawnAfterResize(sharedPage);
    await sharedPage.evaluate(() => {
      window.contextLoss = document.querySelector('#hero-scene canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
      window.contextLoss.loseContext();
    });
    await sharedPage.waitForSelector('#hero-scene[data-scene-state="fallback"]');
    await sharedPage.evaluate(() => window.contextLoss.restoreContext());
    await sharedPage.waitForSelector('#hero-scene.scene-ready[data-scene-state="ready"]', { timeout: 5000 });
    assert.deepEqual(await sharedPage.evaluate(() => ({
      enableHidden: document.querySelector('.scene-enable').hidden,
      pauseEnabled: !document.querySelector('.motion-toggle').disabled,
      canvasOpacity: getComputedStyle(document.querySelector('#hero-scene canvas')).opacity,
    })), { enableHidden: true, pauseEnabled: true, canvasOpacity: '1' }, 'A restored WebGL context returns to the 3D scene');
    const afterRestore = await drawnAfterResize(sharedPage);
    assert.ok(afterRestore.drawn > 0 && Math.abs(afterRestore.drawn - beforeLoss.drawn) <= beforeLoss.drawn * 0.02 && Math.abs(afterRestore.light - beforeLoss.light) <= beforeLoss.light * 0.02,
      `The restored scene draws the frame it drew before the loss (${JSON.stringify({ beforeLoss, afterRestore })})`);
    checks.push('A lost WebGL context that the browser restores brings the 3D scene back');
    await shared.close();
    // A window widened after 3D was enabled, or moved to a screen with another pixel density, renders like a fresh load
    // there. The hardware is reported above the low-power limits, which CI runners fall under.
    const growing = await newContext({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
    await growing.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
      // The knot is the largest indexed draw, so its index count gives its level of detail.
      const drawElements = WebGL2RenderingContext.prototype.drawElements;
      WebGL2RenderingContext.prototype.drawElements = function (mode, count, ...rest) { window.largestDraw = Math.max(window.largestDraw || 0, count); return drawElements.call(this, mode, count, ...rest); };
      const matchMedia = window.matchMedia.bind(window);
      window.resolutionQueries = [];
      window.matchMedia = query => { const list = matchMedia(query); if (query.includes('resolution')) { list.reported = list.matches; window.resolutionQueries.push(list); } return list; };
    });
    const rendering = target => target.evaluate(() => new Promise(resolve => {
      window.largestDraw = 0;
      setTimeout(() => {
        const canvas = document.querySelector('#hero-scene canvas');
        resolve({ perCSSPixel: Math.round(canvas.width / canvas.getBoundingClientRect().width * 100) / 100, knot: window.largestDraw });
      }, 400);
    }));
    const widenedPage = await growing.newPage();
    await openPortfolio(widenedPage, baseURL);
    await widenedPage.locator('.scene-enable').click();
    await widenedPage.waitForSelector('#hero-scene.scene-ready');
    await widenedPage.setViewportSize({ width: 1440, height: 1000 });
    const widened = await rendering(widenedPage);
    const freshPage = await growing.newPage();
    await freshPage.setViewportSize({ width: 1440, height: 1000 });
    await openPortfolio(freshPage, baseURL);
    await freshPage.waitForSelector('#hero-scene.scene-ready');
    assert.deepEqual(widened, await rendering(freshPage), 'A window widened after enabling 3D renders like a fresh load');
    // Chrome's device emulation updates the pixel-density media query without firing its change event, so the test
    // fires it, as the browser does when a window moves to another screen.
    const emulation = await growing.newCDPSession(freshPage);
    const moveToScreen = async deviceScaleFactor => {
      await emulation.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor, mobile: false });
      await freshPage.evaluate(() => window.resolutionQueries.forEach(list => {
        if (list.matches !== list.reported) { list.reported = list.matches; list.dispatchEvent(new Event('change')); }
      }));
      return rendering(freshPage);
    };
    assert.deepEqual(await moveToScreen(1), { perCSSPixel: 1, knot: widened.knot }, 'A move to a 1x screen renders one pixel per CSS pixel');
    assert.ok((await moveToScreen(1.5)).perCSSPixel > 1, 'A second move, to a 1.5x screen, raises the resolution again');
    checks.push('3D detail and resolution follow a widened window and a change of screen pixel density');
    await growing.close();
    const failed3D = await newContext();
    const failed3DPage = await failed3D.newPage();
    await failed3DPage.route('**/scene.js', route => route.abort());
    await failed3DPage.addInitScript(() => {
      window.sceneLoadAttempts = 0;
      new MutationObserver(records => records.forEach(record => { if (record.oldValue === 'loading') window.sceneLoadAttempts++; }))
        .observe(document, { subtree: true, attributeFilter: ['data-scene-state'], attributeOldValue: true });
    });
    await openPortfolio(failed3DPage, baseURL);
    await failed3DPage.waitForSelector('#hero-scene[data-scene-state="fallback"]');
    await failed3DPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await failed3DPage.waitForTimeout(2000);
    assert.equal(await failed3DPage.evaluate(() => window.sceneLoadAttempts), 1, 'A failed 3D download is not retried');
    assert.equal(await failed3DPage.locator('#hero-scene').getAttribute('data-scene-state'), 'fallback');
    checks.push('A failed 3D download stays in the static fallback');
    await failed3D.close();
    // A restored tab keeps a case study's history.state, but the entry before it is another document there:
    // closing must not go back to it, which would reload the site and lose the visitor's place.
    const restored = await newContext({ viewport: { width: 1440, height: 1000 } });
    const restoredPage = await restored.newPage();
    await openPortfolio(restoredPage, baseURL);
    await openPortfolio(restoredPage, `${baseURL}/?project=neural`);
    await restoredPage.evaluate(() => { history.replaceState({ portfolioProject: 'neural' }, ''); window.closedInPlace = true; });
    await restoredPage.keyboard.press('Escape');
    await restoredPage.waitForTimeout(500);
    await restoredPage.waitForLoadState('load');
    assert.deepEqual(await restoredPage.evaluate(() => ({ samePage: window.closedInPlace === true, open: document.querySelector('dialog').open, search: location.search })), { samePage: true, open: false, search: '' }, 'A restored case study closes without reloading the site');
    // On a #fragment address the closed entry keeps the restored state. The next case study must add its own entry
    // instead of reusing that one, or Back from it would return to the document before the restored one.
    await openPortfolio(restoredPage, `${baseURL}/?project=neural#work`);
    await restoredPage.evaluate(() => { history.replaceState({ portfolioProject: 'neural' }, ''); window.restoredOnFragment = true; });
    await restoredPage.keyboard.press('Escape');
    await restoredPage.waitForTimeout(500);
    assert.deepEqual(await restoredPage.evaluate(() => [window.restoredOnFragment === true, document.querySelector('dialog').open, location.search, location.hash]), [true, false, '', '#work'], 'A restored case study on a #fragment address closes in place');
    await restoredPage.locator('.project-visual[data-project="storm"]').click();
    assert.equal(await restoredPage.locator('dialog').evaluate(element => element.open), true);
    await restoredPage.goBack();
    await restoredPage.waitForTimeout(500);
    await restoredPage.waitForLoadState('load');
    assert.deepEqual(await restoredPage.evaluate(() => ({ samePage: window.restoredOnFragment === true, open: document.querySelector('dialog').open, search: location.search, hash: location.hash })), { samePage: true, open: false, search: '', hash: '#work' }, 'Back from the next case study closes it without reloading the site');
    checks.push('A case study restored from an earlier session closes in place');
    await restored.close();
    // On a path that starts with // (a mistyped link a server still answers with the home page), case-study URLs must
    // stay on this origin: "//?project=…" would name another host, and history.pushState would throw.
    const doubleSlash = await newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const doubleSlashPage = await doubleSlash.newPage();
    await openPortfolio(doubleSlashPage, baseURL);
    await doubleSlashPage.evaluate(() => history.replaceState(null, '', '/.//'));
    await doubleSlashPage.locator('.project-visual[data-project="neural"]').click();
    assert.equal(await doubleSlashPage.locator('dialog').evaluate(element => element.open), true, 'A case study opens on a // path');
    await doubleSlashPage.locator('.copy-project-link').click();
    const copiedLink = new URL(await doubleSlashPage.evaluate(() => navigator.clipboard.readText()));
    assert.deepEqual([copiedLink.origin, copiedLink.pathname, copiedLink.search], [new URL(baseURL).origin, '//', '?project=neural'], 'The copied project link stays on this site');
    await doubleSlashPage.keyboard.press('Escape');
    await doubleSlashPage.waitForFunction(() => !location.search && !document.querySelector('dialog').open, null, { timeout: 3000 });
    assert.equal(new URL(doubleSlashPage.url()).pathname, '//');
    checks.push('Case studies open, copy their link and close on a //-prefixed path');
    await doubleSlash.close();
    // The sculpture passes behind hero text at some widths (around 900px it meets the heading). Each hero text block sits
    // on an opaque plate, so hiding the artwork must leave every pixel under the letters unchanged: in each theme, at the
    // widths around 900px, wide layouts, 150% and 200% zoom, phones, and text wrapped by increased spacing.
    const spacingCSS = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
    // Chromium on Linux draws text with LCD (subpixel) antialiasing only when it is not in a separately composited
    // layer, and showing the WebGL canvas moves the caption into one; that alone recolours its glyph edges with no
    // change to the backing. This browser draws all text with greyscale antialiasing, so only the backing can differ.
    const greyscaleText = await chromium.launch({ ...options, args: [...(options.args || []), '--disable-lcd-text'] });
    try {
      const decoder = await browser.newPage();
      const artworkUnderText = async page => {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        const rects = await page.evaluate(() => {
          const found = [], range = document.createRange(), walker = document.createTreeWalker(document.querySelector('.hero'), NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const element = walker.currentNode.parentElement;
            if (!walker.currentNode.nodeValue.trim() || element.closest('[aria-hidden="true"], .sr-only, [hidden], .site-header')) continue;
            range.selectNodeContents(walker.currentNode);
            for (const box of range.getClientRects()) {
              // Whole pixels inside each line's text box, kept within the viewport.
              const x = Math.max(0, Math.ceil(box.left) + 1), y = Math.max(0, Math.ceil(box.top) + 1);
              const w = Math.min(innerWidth, Math.floor(box.right) - 1) - x, h = Math.min(innerHeight, Math.floor(box.bottom) - 1) - y;
              if (w > 0 && h > 0) found.push({ x, y, w, h, text: `${element.id || element.className || element.tagName}: ${walker.currentNode.nodeValue.trim().slice(0, 24)}` });
            }
          }
          return found;
        });
        const shot = async () => (await page.screenshot({ scale: 'css' })).toString('base64');
        const withArtwork = await shot();
        await page.evaluate(() => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync('#hero-scene{visibility:hidden!important}');
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const withoutArtwork = await shot();
        await page.evaluate(() => { document.adoptedStyleSheets = document.adoptedStyleSheets.slice(0, -1); });
        return decoder.evaluate(async ({ shots, rects }) => {
          const pixels = await Promise.all(shots.map(async data => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
            const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true });
            context.drawImage(bitmap, 0, 0);
            return context;
          }));
          // Name each text box whose pixels changed, with how many, the largest channel change, how many of those were bare
          // plate (#0b0e11) without the artwork rather than letters, and the first changed pixel's page position.
          return rects.flatMap(({ x, y, w, h, text }) => {
            const [a, b] = pixels.map(context => context.getImageData(x, y, w, h).data);
            let changed = 0, largest = 0, onPlate = 0, first;
            for (let index = 0; index < a.length; index += 4) {
              const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(a[index + channel] - b[index + channel])));
              if (delta <= 2) continue;
              changed++; largest = Math.max(largest, delta);
              if (Math.abs(b[index] - 11) + Math.abs(b[index + 1] - 14) + Math.abs(b[index + 2] - 17) <= 3) onPlate++;
              first ??= `${x + (index / 4) % w},${y + Math.floor(index / 4 / w)}`;
            }
            return changed ? [`${text} (${changed}/${w * h} px, max Δ${largest}, ${onPlate} on bare plate, first at ${first})`] : [];
          });
        }, { shots: [withArtwork, withoutArtwork], rects });
      };
      // Without the plates (the reported problem), the same comparison must catch the sculpture behind the text at 900px.
      const withoutPlates = '.hero *:before{display:none!important}';
      const showedThroughWithoutPlates = [];
      for (const { width, height, deviceScaleFactor = 1, spaced = false } of [
        { width: 880, height: 900 }, { width: 900, height: 900 }, { width: 960, height: 800 }, { width: 1440, height: 1000 },
        { width: 1920, height: 1080 }, { width: 960, height: 760, deviceScaleFactor: 1.5 }, { width: 720, height: 1100, deviceScaleFactor: 2 },
        { width: 390, height: 1100 }, { width: 900, height: 1000, spaced: true },
      ]) {
        const label = `${width}px${deviceScaleFactor > 1 ? ` at ${deviceScaleFactor * 100}% zoom` : ''}${spaced ? ' with increased text spacing' : ''}`;
        const plated = await newContext({ viewport: { width, height }, deviceScaleFactor }, greyscaleText);
        const platedPage = await plated.newPage();
        await openPortfolio(platedPage, baseURL);
        // Narrow layouts keep the CSS artwork until the visitor asks for 3D.
        await platedPage.waitForFunction(() => document.querySelector('#hero-scene.scene-ready') || /Enable 3D/.test(document.querySelector('#scene-status').textContent));
        if (!await platedPage.locator('#hero-scene.scene-ready').count()) await platedPage.locator('#enable-scene').click();
        await platedPage.waitForSelector('#hero-scene.scene-ready');
        if (spaced) await platedPage.evaluate(css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }, spacingCSS);
        for (const mode of ['build', 'math', 'learn']) {
          await platedPage.locator(`[data-mode="${mode}"]`).click();
          await platedPage.waitForTimeout(400);
          assert.deepEqual(await artworkUnderText(platedPage), [], `${label}, ${mode} theme: the 3D artwork does not show through hero text`);
          if (width === 900 && !spaced) {
            await platedPage.evaluate(css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }, withoutPlates);
            showedThroughWithoutPlates.push(...await artworkUnderText(platedPage));
            await platedPage.evaluate(() => { document.adoptedStyleSheets = document.adoptedStyleSheets.slice(0, -1); });
          }
        }
        await plated.close();
      }
      await decoder.close();
      assert.ok(showedThroughWithoutPlates.some(text => /^(SPAN: made|EM: tangible)/.test(text)), `Without plates the check sees the sculpture behind the heading at 900px (saw: ${showedThroughWithoutPlates.join('; ')})`);
    } finally { await greyscaleText.close(); }
    checks.push('Hero text keeps an opaque backing over the 3D artwork in every theme, width, zoom and wrap');
    // WCAG 1.4.12 text spacing: the hero grows instead of clipping its calls to action or running them under its footer.
    const spacing = await newContext({ viewport: { width: 1280, height: 800 } });
    const spacingPage = await spacing.newPage();
    await openPortfolio(spacingPage, baseURL);
    // A reader's own spacing styles are not subject to the page's Content-Security-Policy; a CSSOM sheet is not either.
    await spacingPage.evaluate(css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; },
      '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}');
    for (const action of ['.hero-actions .button', '.hero-actions .text-link']) {
      assert.deepEqual(await spacingPage.locator(action).evaluate(element => {
        element.scrollIntoView({ block: 'center', behavior: 'instant' });
        const box = element.getBoundingClientRect(), hero = document.querySelector('.hero').getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { insideHero: box.top >= hero.top && box.bottom <= hero.bottom, clickable: element.contains(target), aboveFooter: box.bottom <= document.querySelector('.hero-footer').getBoundingClientRect().top };
      }), { insideHero: true, clickable: true, aboveFooter: true }, `${action} stays visible and clickable with increased text spacing`);
    }
    checks.push('Hero calls to action stay visible with increased text spacing');
    await spacingPage.close();
    // Browsers without the svh unit (Safari before 15.4, Chrome before 108, Firefox before 101) drop each declaration
    // that uses it. In windows no taller than the hero's minimum height, the hero must be just as tall there.
    const svhPage = await spacing.newPage();
    await openPortfolio(svhPage, baseURL);
    for (const [width, height] of [[1280, 800], [1024, 768]]) {
      await svhPage.setViewportSize({ width, height });
      await svhPage.waitForTimeout(120);
      const heroHeights = await svhPage.evaluate(async () => {
        const stylesheet = document.querySelector('link[rel="stylesheet"]').sheet, withoutSvh = new CSSStyleSheet();
        withoutSvh.replaceSync((await (await fetch(stylesheet.href)).text()).replace(/(\d)svh\b/g, '$1unsupported'));
        const heroHeight = () => document.querySelector('.hero').getBoundingClientRect().height;
        const supported = heroHeight();
        stylesheet.disabled = true;
        document.adoptedStyleSheets = [withoutSvh];
        const unsupported = heroHeight();
        document.adoptedStyleSheets = [];
        stylesheet.disabled = false;
        return { supported, unsupported };
      });
      assert.equal(heroHeights.unsupported, heroHeights.supported, `Without svh support the hero keeps its minimum height at ${width}x${height}`);
    }
    checks.push('The hero keeps its minimum height in browsers without the svh unit');
    await spacing.close();
    // Forced colours (Windows contrast themes) replace the colours that mark the pressed filter and theme.
    const forced = await newContext({ forcedColors: 'active', reducedMotion: 'reduce' });
    const forcedPage = await forced.newPage();
    await openPortfolio(forcedPage, baseURL);
    await forcedPage.locator('[data-filter="math"]').click();
    await forcedPage.locator('[data-mode="math"]').click();
    await forcedPage.waitForTimeout(200);
    assert.deepEqual(await forcedPage.evaluate(() => {
      const look = selector => {
        const style = getComputedStyle(document.querySelector(selector));
        const fill = style.backgroundColor.match(/[\d.]+/g).map(Number);
        return [style.color, fill.length < 4 || fill[3] >= 0.5 ? style.backgroundColor : 'none', style.borderBottomStyle === 'none' ? 'none' : style.borderBottomColor].join(' ');
      };
      return { filter: look('[data-filter="math"]') !== look('[data-filter="web"]'), theme: look('[data-mode="math"]') !== look('[data-mode="learn"]') };
    }), { filter: true, theme: true }, 'The pressed filter and theme stay visible in forced colours');
    checks.push('Pressed filter and theme stay visible in forced colours');
    await forced.close();
    // The static layout used without JavaScript, or when app.js cannot run: the header links are visible and clickable
    // (not under the notice), the header clears the hero text, the search field (which needs app.js) is hidden, and the
    // card artwork is not a dead button in the Tab order.
    const staticLayout = () => {
      const clickable = element => {
        const box = element.getBoundingClientRect(), hit = box.width && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return Boolean(hit && element.contains(hit));
      };
      const header = document.querySelector('.site-header').getBoundingClientRect(), notice = document.querySelector('.noscript-note');
      return {
        navigation: [...document.querySelectorAll('.site-header .wordmark, #main-navigation a')].every(clickable),
        menuButton: getComputedStyle(document.querySelector('.menu-toggle')).display !== 'none',
        searchField: getComputedStyle(document.querySelector('.project-search')).display !== 'none',
        noticeAboveHeader: !notice || notice.getBoundingClientRect().bottom <= header.top + 0.5,
        heroTextBelowHeader: header.bottom <= document.querySelector('.hero-content').firstElementChild.getBoundingClientRect().top,
        focusableCards: [...document.querySelectorAll('.project-visual')].filter(card => { card.focus(); return document.activeElement === card; }).length,
      };
    };
    const staticExpected = { navigation: true, menuButton: false, searchField: false, noticeAboveHeader: true, heroTextBelowHeader: true, focusableCards: 0 };
    for (const width of [1440, 820, 375]) {
      const noScript = await newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
      const noScriptPage = await noScript.newPage();
      await noScriptPage.goto(baseURL, { waitUntil: 'load' });
      assert.equal(await noScriptPage.locator('.noscript-note').isVisible(), true);
      assert.deepEqual(await noScriptPage.evaluate(staticLayout), staticExpected, `The no-JavaScript layout works at ${width}px`);
      await noScript.close();
    }
    checks.push('Without JavaScript the notice leaves the navigation usable and the card artwork leaves the Tab order');
    // Scripting on, but app.js cannot run: a failed download, or Safari before 14, whose MediaQueryList is not an EventTarget.
    for (const [failure, prepare] of [
      ['app.js fails to download', context => context.route('**/app.js', route => route.abort())],
      ['app.js throws before wiring the menu', context => context.addInitScript(() => { MediaQueryList.prototype.addEventListener = undefined; })],
    ]) {
      const broken = await newContext({ viewport: { width: 375, height: 812 } });
      await prepare(broken);
      const brokenPage = await broken.newPage();
      await brokenPage.goto(baseURL, { waitUntil: 'load' });
      assert.deepEqual(await brokenPage.evaluate(staticLayout), staticExpected, `${failure}: phones keep a usable navigation`);
      await broken.close();
    }
    checks.push('When app.js cannot run, phones get the static navigation instead of a dead menu button');
    assert.deepEqual(policyViolations, [], 'No page breaks its production Content-Security-Policy');
    checks.push('Every page runs under the production response headers without Content-Security-Policy violations');
    console.log(JSON.stringify({ passed: checks }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
