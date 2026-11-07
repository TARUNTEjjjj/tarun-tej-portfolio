const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const baseURL = process.env.PORTFOLIO_URL || 'http://127.0.0.1:4173';
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const checks = [];
(async () => {
  mkdirSync('qa', { recursive: true });
  const browser = await chromium.launch(options);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#hero-scene.scene-ready');
    for (const mode of ['math', 'learn', 'build']) {
      await page.locator(`[data-mode="${mode}"]`).click();
      assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.locator('.motion-toggle').click();
    assert.equal(await page.locator('.motion-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.motion-toggle').getAttribute('aria-label'), 'Pause animation');
    await page.screenshot({ path: 'qa/desktop-hero.png' });
    checks.push('3D renders; all themes and pause control work');
    for (const [filter, count] of [['web', 3], ['math', 3], ['ml', 1], ['systems', 1], ['all', 6]]) {
      await page.locator(`[data-filter="${filter}"]`).click();
      assert.equal(await page.locator('.project:visible').count(), count);
    }
    checks.push('Project filters expose the correct project sets');
    const projectLinks = {
      axiom: ['https://axiom-sat.pages.dev/'],
      forge: ['https://forge-learning-academy.pages.dev/'],
      math: [],
      pocket: [],
      storm: ['https://stormsignal-weather.pages.dev/'],
      neural: ['https://neural-math-lab.pages.dev/'],
    };
    for (const [project, expectedLinks] of Object.entries(projectLinks)) {
      const trigger = page.locator(`.project-visual[data-project="${project}"]`);
      await trigger.click();
      assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
      const links = await page.locator('.dialog-links a').evaluateAll(elements => elements.map(element => element.href));
      assert.deepEqual(links, expectedLinks, `${project} exposes only its available live website`);
      assert.equal(await page.locator('a[href*="github.com"]').count(), 0, 'Private repository links remain absent');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog').evaluate(element => element.open), false);
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    }
    checks.push('All case studies expose only their available live websites; Escape closes and focus returns');
    await page.locator('.copy-email').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'avulataruntej123@gmail.com');
    const pdf = await context.request.get(`${baseURL}/assets/Avula-Tarun-Tej-Coding-Resume.pdf`);
    assert.equal(pdf.status(), 200);
    checks.push('Email copy and résumé download work');
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#hero-scene').getAttribute('data-scene-state'), 'deferred');
    await page.locator('.scene-enable').click();
    await page.waitForSelector('#hero-scene.scene-ready');
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
    const reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(baseURL, { waitUntil: 'networkidle' });
    assert.equal(await reducedPage.locator('.motion-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await reducedPage.locator('html').evaluate(element => getComputedStyle(element).scrollBehavior), 'auto');
    checks.push('Reduced-motion preference starts with animation paused');
    const fallback = await browser.newContext();
    const fallbackPage = await fallback.newPage();
    await fallbackPage.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type.startsWith('webgl') ? null : getContext.call(this, type, ...args); };
    });
    await fallbackPage.goto(baseURL, { waitUntil: 'networkidle' });
    assert.equal(await fallbackPage.locator('.sculpture-fallback').evaluate(element => getComputedStyle(element).opacity), '1');
    await fallbackPage.locator('[data-filter="math"]').click();
    assert.equal(await fallbackPage.locator('.project:visible').count(), 3);
    checks.push('WebGL-unavailable fallback preserves content and controls');
    assert.deepEqual(errors, [], 'No browser console errors on supported WebGL path');
    console.log(JSON.stringify({ passed: checks }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
