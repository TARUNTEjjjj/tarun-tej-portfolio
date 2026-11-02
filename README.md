# Tarun Tej — Personal Portfolio

A personal website for coding and web-development opportunities, with an original interactive 3D sculpture, four project case studies, experience, a résumé and contact links.

**[Visit the portfolio](https://tarun-tej.pages.dev/)**

## Run locally

```sh
npm run dev
# Open http://127.0.0.1:4173
```

The site is buildless. `dist/` contains the editable HTML, CSS, JavaScript, locally vendored Three.js and downloadable résumé. It works on ordinary static hosting with no runtime keys or application backend.

## Edit

- `dist/index.html`: page structure, biography, experience, project summaries and contact links.
- `dist/styles.css`: responsive layout, typography, palette and CSS project illustrations.
- `dist/app.js`: project case-study content, filters, dialog behaviour, navigation and clipboard action.
- `dist/scene.js`: procedural Three.js geometry, lighting, interaction and motion preferences.
- `dist/assets/Avula-Tarun-Tej-Coding-Resume.pdf`: downloadable résumé.
- `resume/`: editable résumé HTML and a concise profile bio.
- `docs/design.md`: colour meanings, reference influences and design decisions.

All project illustrations are original visual interpretations, not screenshots of the linked apps. The public links lead to the actual projects. The site does not expose private repository source or access any connected accounts.

## Checks

Node.js 22+ and Python 3 are recommended.

```sh
npm ci
npm run check
npx playwright install chromium
# In a separate terminal: npm run dev
npm run test:browser
```

The browser suite checks the 3D scene, its themes and pause control, project filters, keyboard dismissal/focus restoration, clipboard action, the résumé download, mobile menu, viewport overflow, reduced motion and a WebGL-unavailable fallback. It writes ignored QA screenshots to `qa/`.

To test an existing local Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. Set `PORTFOLIO_URL` to test a different local preview origin. The tests intentionally avoid visiting external project/contact destinations.

## Motion and accessibility

The 3D scene respects reduced motion, pauses offscreen and in hidden tabs, caps pixel density and has an explicit pause button. A CSS sculpture remains if WebGL is unavailable. Written content, links and section navigation remain available without JavaScript. Project dialogs use the native dialog element with focus restoration and Escape support. Colours are paired with labels.

## Privacy and maintenance

The website is public at `https://tarun-tej.pages.dev/`. Its GitHub source repository remains private. Only `dist/` is uploaded to the website; repository files and development tools are not served.

There is no analytics, tracking pixel, contact form backend or remote font request. Contact uses `mailto:` and an explicit copy button. Repository links, work dates and résumé information are editorial content and should be reviewed as they change. A YouTube description is included; add the channel URL only when the owner supplies it.

The content describes summer-school attendance rather than a research appointment, PUC completion rather than a B.Tech enrolment, and occasional C/C++ use. It distinguishes Forge's 3D learning map from Axiom SAT's interactive maths practice.

## Deploy

The production project is `tarun-tej` on Cloudflare Pages, using Direct Upload and the `main` production branch. Authenticate in your own account before deployment:

```sh
npx wrangler@4.156.1 login --scopes account:read user:read pages:write
npm run check
npx wrangler@4.156.1 pages deploy dist --project-name tarun-tej --branch main
```

Commit and push source changes to the private GitHub repository before deploying. GitHub runs the source checks; deployments are performed explicitly with the command above. Do not place credentials in source or in `dist/`. The canonical URL, sitemap and robots file point to the production address. The Pages `_headers` file supplies response headers, and `404.html` handles missing paths.

## Third-party software

Three.js 0.187.0 is vendored from its npm release. See `dist/vendor/THREE-LICENSE.txt` for its MIT licence. Playwright is used only for development checks. No Apple or Prince Keshri code, logos, product images or video assets are included.
