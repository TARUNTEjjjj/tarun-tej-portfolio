# Portfolio 1.1 verification

Checked on 2 November 2026. The private source repository is `TARUNTEjjjj/tarun-tej-portfolio`; production is Cloudflare Pages project `tarun-tej`.

## Checks performed

- Source syntax, local assets, module imports, unique section IDs, anchor targets, and PDF signature passed.
- 13 Node tests passed: four interaction/URL rules and nine load-harness/static-fixture checks. Timeout, abort, redirect, byte-budget, status, and percentile behavior are covered.
- Desktop browser checks verified 3D readiness, theme changes, pause, all five project filters, Neural Math Lab details, project-link copy feedback, Escape dismissal/focus restoration, and browser Forward/Back restoration.
- Responsive fixtures with 390px and 320px iframe viewports produced document widths/scroll widths of 375/375 and 305/305 (scrollbars account for the difference). Lightweight artwork was active before opting into 3D. These are browser layout checks, not physical phone benchmarks. The local review browser's viewport override did not apply, and pointer interaction inside its iframe fixtures was unavailable. The separate isolated CI browser subsequently verified the mobile menu and 3D opt-in successfully.
- First-load HTML, stylesheet, and UI modules: approximately 71 KB uncompressed. Optional vendored Three.js modules total about 2 MB uncompressed and are deferred on narrow/reduced-motion/data-saving paths. No external font request is required.

The Playwright smoke script ran successfully in isolated GitHub Actions on commit `c754fe1a44e51decd342a4538631db0c7e892834`: [run 41481072115](https://github.com/TARUNTEjjjj/tarun-tej-portfolio/actions/runs/41481072115). Chromium verified all six case-study dialogs and focus restoration, filters, email clipboard copy, résumé download, 3D themes/pause, mobile menu and opt-in, no overflow at 320/390/768/1024/1440px, reduced motion, and the WebGL-unavailable fallback. This is functional browser coverage, not a physical-device or sustained-user benchmark. Source checks and all 13 Node tests also passed in that run.

## Local burst limitation

The 20-pending-request local fixture run completed 40/40 HTTP 200 responses. Two immediate 1,000-pending-request attempts failed before any HTTP response: the diagnostic run recorded `ECONNRESET` during connection establishment and aborted its remaining requests. Reports are retained under `docs/verification/`. This is not evidence of a Cloudflare production failure, and the configured concurrency is not a verified visitor capacity. The exact local transport/OS limit was not established.

See [capacity methodology](capacity.md) for bounded production procedures and the limits of single-generator HTTP testing. Production results are recorded separately after deployment. No analytics was added; the current live visitor count is unknown.

## Deployed delivery evidence

Production deployment `60000d63-aab9-4a6e-9170-9a3d512ae5cd` contains website commit `f998cbb57c086a7e70c57d7486ec9dbfb537ce0c`. Its fixed URL is `https://60000d63.tarun-tej.pages.dev/`. Cloudflare reported the deployment as Production/main, and GitHub Actions run 41480049530 passed source checks and all 13 tests.

The complete production HTML, CSS, UI module, app module, renderer module and résumé PDF were fetched and compared byte-for-byte with the committed source. All matched with HTTP 200; security headers were present. The deployed browser opened and closed all six case studies without console errors.

A bounded ramp against that exact deployment produced:

| Maximum pending requests | Total requests | HTTP 200 | Errors | p95 complete-body latency | Total elapsed |
| --- | --- | --- | --- | --- | --- |
| 20 | 40 | 40 | 0 | 527 ms | 682 ms |
| 100 | 100 | 100 | 0 | 555 ms | 579 ms |
| 250 | 250 | 250 | 0 | 1,566 ms | 1,771 ms |
| 1,000 | 1,000 | 1,000 | 0 | 5,325 ms | 5,727 ms |

Raw reports are `docs/verification/deployment-*.json`. The test used one local machine, one network path, GET `/`, complete response-body consumption, a 30-second global limit, and 15-second request timeouts. Pending fetches can include client queuing. It neither counts current visitors nor certifies a sustained 1,000-user experience, browser rendering, or regional availability. The p95 latency is part of the result and should not be omitted from a performance claim.

An earlier 20-request-concurrency check hit the previous production version while the canonical domain still served the original assets; that report is explicitly named `previous-version-live-20.json` and is not evidence for the new release.


## Main-domain issue (resolved)

As of 2 November 2026 at 16:33 UTC, `https://tarun-tej.pages.dev/` still served the original 16,135-byte HTML and returned HTTP 404 for `/ui-state.js`. The tested upgraded deployment served 20,011-byte HTML and the UI module with HTTP 200, matching committed bytes and including CSP headers.

A second successful Production/main publish (`f70359ab-e21d-4add-a325-ea51fb1a9ad5`, identical website assets) did not resolve this. Cloudflare's supported rollback control then successfully selected the earlier **upgraded** deployment `60000d63-aab9-4a6e-9170-9a3d512ae5cd` as active production; the dashboard confirmed that selection. Fresh HTTP requests and the review browser still received the original site at the main address afterward. Current Date and differing CF-Ray values were recorded, so this is not explained by browser cache alone. The exact provider routing/cache cause remains unconfirmed.

While the main-domain issue was unresolved, the verified release was available at **https://60000d63.tarun-tej.pages.dev/**. `docs/verification/production-domain-check.json` preserves both response comparisons and Cloudflare request identifiers.

Rechecked on 2 November 2026 at 20:06 and 20:47 UTC: `https://tarun-tej.pages.dev/` returned HTTP 200 for `/`, `/app.js`, `/scene.js`, `/ui-state.js`, `/styles.css` and the résumé PDF, and every SHA-256 matched `dist/` at website commit `f998cbb57c086a7e70c57d7486ec9dbfb537ce0c`. The root served the 20,011-byte HTML with ETag `"7575dccbb8cf2034686da3226136e51e"`, the tag recorded for deployment `60000d63`, and the CSP, Permissions-Policy and X-Frame-Options headers were present.
