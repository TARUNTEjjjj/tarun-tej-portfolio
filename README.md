# Tarun Tej — Personal Portfolio

A personal website for web development, software and AI evaluation opportunities, with an original interactive 3D sculpture, six project case studies, links to 13 public repositories, education, résumés and contact links.

**[Visit the portfolio](https://tarun-tej.pages.dev/)**

## Run locally

```sh
npm run dev
# Open http://127.0.0.1:4173
```

The site is buildless. `dist/` contains the editable HTML, CSS, JavaScript, locally vendored Three.js and downloadable résumé. It works on ordinary static hosting with no runtime keys or application backend.

## Edit

- `dist/index.html`: page structure, biography, education, project summaries and contact links.
- `dist/styles.css`: responsive layout, typography, palette and CSS project illustrations.
- `dist/app.js`: project case-study content, filters, dialog behaviour, navigation and clipboard action.
- `dist/fallback.js`: applies the no-JavaScript layout (the `<noscript id="static-fallback">` styles) when a browser cannot run `app.js`. Keep it ES5.
- `dist/scene.js`: procedural Three.js geometry, lighting, interaction and motion preferences.
- `dist/assets/Avula-Tarun-Tej-Coding-Resume.pdf`: downloadable résumé.
- `dist/assets/Avula-Tarun-Tej-GitHub-Projects-Resume.pdf`: résumé focused on GitHub project development.
- `resume/`: editable résumé HTML and a concise profile bio.
- `docs/design.md`: colour meanings, reference influences and design decisions.

All project illustrations are original visual interpretations, not screenshots of the linked apps. Links lead to the actual projects and their public GitHub repositories. The site does not access any connected accounts.

## Checks

Node.js 22+ and Python 3 are recommended.

```sh
npm ci
npm run check
npm test
npx playwright install chromium
# In a separate terminal: npm run dev
npm run test:browser
```

The browser suite checks the 3D scene, its themes and pause control, redrawing while it resizes, its detail and resolution after the window widens or changes screens, its return after a lost WebGL context is restored, project filters, keyboard and Back-button dismissal with focus and scroll restoration (including after in-page and shared links), double-click dismissal, closing a case study restored with its tab and Back from the next one, case studies on a `//`-prefixed path, clipboard action, the résumé download, mobile menu, viewport overflow, reduced motion, 3D deferral on touch screens and behind a shared case study, the WebGL-unavailable and failed-download fallbacks, hiding the CSS sculpture without `:has()`, WCAG AA text contrast, hero text that keeps its backing while the 3D artwork moves behind it (every theme; 880–1920px, 150% and 200% zoom, phones and spaced-out wrapped text), increased text spacing, the hero in browsers without the `svh` unit, forced colours, unclipped filter focus rings on narrow screens, the contact heading on phones, printing, and the static layout without JavaScript or when `app.js` cannot run. Every page it opens gets the response headers Cloudflare Pages adds from `dist/_headers`, so a change the Content-Security-Policy would block fails the suite instead of the live site. It writes ignored QA screenshots to `qa/`.

To test an existing local Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. Set `PORTFOLIO_URL` to test a different local preview origin. The tests intentionally avoid visiting external project/contact destinations.

## Current portfolio

Six case studies include Neural Math Lab and StormSignal. Each offers a public source link, while a compact collection introduces Attention Atlas, Vedaris, the three Avenquellis repositories, Forge for Mac and this portfolio. Project links use `?project=neural` (or another known project ID), support browser Back/Forward, and offer an explicit copy action.

The portfolio balances web development, Python, AI/ML learning and AI response/code evaluation skills. Its learning timeline presents education and summer-school participation. StormSignal's case study records its 308-test release and the observed PAGASA availability limitation without claiming all upstream providers are healthy.

The first-load HTML, CSS and UI scripts total about 88 KB before compression, below the enforced 100 KB budget. Desktop 3D loads after document completion, when visible, idle and not covered by an open case study. Narrow or touch screens, reduced motion, Save-Data and 2G connections keep lightweight CSS artwork until the visitor enables 3D. No external font or image request is needed. The renderer creates each theme's geometry on demand, caps decorative animation at 30fps, limits render resolution (recomputed when the window widens or moves to a screen with another pixel density), and stops offscreen, in hidden tabs or behind an open case study.

`npm test` runs the interaction rules, the 3D scene's rendering rules (with a stand-in for the GPU renderer), the static-fallback script, the `_headers` and PDF-link readers, and the bounded load-harness tests. [Capacity methodology](docs/capacity.md) explains the difference between concurrent HTTP requests and actual concurrent visitors. Reports in `docs/verification/` record measured outcomes, including failures. Existing Pages caching is retained so unversioned files can update correctly. Response headers restrict unnecessary device permissions and page/script embedding.

## Motion and accessibility

The 3D scene respects reduced motion, pauses offscreen, in hidden tabs and behind an open case study, caps pixel density and has an explicit pause button. A CSS sculpture remains if WebGL is unavailable, and while a lost graphics context is being restored. Written content, links and section navigation remain available without JavaScript, and in browsers that cannot run the site's scripts (older browsers, or a failed download), which get the same static layout. Project dialogs use the native dialog element with focus restoration and Escape support. Colours are paired with labels, pressed filters and themes stay visible in forced-colours mode, and printing includes every section. The portfolio page's text colours meet WCAG AA contrast against the page, card and dialog backgrounds they are set on, apart from decorative text and symbols hidden from assistive technology, such as the AxiomMath card's fractions and caption. Project card taglines have opaque backgrounds, and their bottom captions reserve space for the arrow so that narrow two-column layouts do not put text over the artwork or control. The hero's eyebrow, heading lines, introduction, résumé link, sculpture caption, status line and footer labels each sit on an opaque plate in the hero colour, feathered into the background, so the 3D sculpture (or its CSS fallback) can pass behind them in any theme, width, zoom level or text wrap without changing the colour behind their letters. Remaining limitations: the plates guarantee the static contrast pairs only for text inside them, so new hero text needs the same plate; the sculpture controls keep their translucent, blurred bar, which the artwork does not currently reach; and this is a targeted fix, not a full accessibility audit or certification.

## Privacy and maintenance

The website is public at `https://tarun-tej.pages.dev/`. Its GitHub source repository is public. Only `dist/` is uploaded to the website; repository files and development tools are not served.

There is no analytics, tracking pixel, contact form backend or remote font request. Contact uses `mailto:` and an explicit copy button. Repository links, work dates and résumé information are editorial content and should be reviewed as they change. `npm run check` fails when a PDF in `dist/` links a GitHub repository that the page does not link, and when `_headers` has a line Cloudflare Pages would skip or leaves a page without a Content-Security-Policy. A YouTube description is included; add the channel URL only when the owner supplies it.

The content describes summer-school attendance rather than a research appointment, PUC completion rather than a B.Tech enrolment, and occasional C/C++ use. It distinguishes Forge's 3D learning map from Axiom SAT's interactive maths practice.

## Deploy

The production project is `tarun-tej` on Cloudflare Pages, using Direct Upload and the `main` production branch. Authenticate in your own account before deployment:

```sh
npx wrangler@4.156.1 login --scopes account:read user:read pages:write
npm run check
npx wrangler@4.156.1 pages deploy dist --project-name tarun-tej --branch main
```

Commit and push source changes to the public GitHub repository before deploying. GitHub runs the source checks; deployments are performed explicitly with the command above. Do not place credentials in source or in `dist/`. The canonical URL, sitemap and robots file point to the production address. The Pages `_headers` file supplies response headers, and `404.html` handles missing paths.

## Third-party software

Three.js 0.187.0 is vendored from its npm release. See `dist/vendor/THREE-LICENSE.txt` for its MIT licence. Playwright is used only for development checks. No Apple or Prince Keshri code, logos, product images or video assets are included.


### Search the project collection

Visitors can search project cards by several words and combine the query with a
category filter. Search is case- and accent-insensitive, runs entirely in the
browser, and announces result counts. Clear filters restores every project and
returns keyboard focus to the search field. No query is sent to a server.

## GitHub resource collection

Explore the project-specific [resource catalog](resources/README.md): curated references, star-ranked discovery, dated source metadata, cached failure recovery and an optional read-only server API. The daily refresh workflow updates the public catalog. The resource library reads the latest GitHub snapshot with a bundled offline fallback; application-code updates still follow the existing deployment process.

The web resource library now checks for fresh public metadata every 15 minutes while an app tab is open and saves the latest validated collection for offline visits. It shows successful-check and source-observation dates separately, preserves good data during failures, and keeps its offline storage separate from application progress. See [resource update and offline behavior](resources/README.md#automatic-checks-and-offline-collections-in-the-web-app).

After an online visit prepares the saved library, reopening the installed app without a connection opens that resource library. The main site remains available online; this fallback does not download the complete application or third-party repositories.

## Installed app updates

Installed apps check for a new deployed application release every 15 minutes while open and online. A new release is prepared before it is activated. Updates wait while an app window has active work or unsaved input; reopening the app also loads the latest available release.

The resource collection is stored separately from application code. Updating code keeps the latest saved collection and the verified offline resource page. When the main page cannot load offline, the installed app opens that saved library. External repository pages and downloads still need internet access.
