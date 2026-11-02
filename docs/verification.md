# Portfolio 1.1 verification

Checked on 2 November 2026. The private source repository is `TARUNTEjjjj/tarun-tej-portfolio`; production is Cloudflare Pages project `tarun-tej`.

## Checks performed

- Source syntax, local assets, module imports, unique section IDs, anchor targets, and PDF signature passed.
- 13 Node tests passed: four interaction/URL rules and nine load-harness/static-fixture checks. Timeout, abort, redirect, byte-budget, status, and percentile behavior are covered.
- Desktop browser checks verified 3D readiness, theme changes, pause, all five project filters, Neural Math Lab details, project-link copy feedback, Escape dismissal/focus restoration, and browser Forward/Back restoration.
- Responsive fixtures with 390px and 320px iframe viewports produced document widths/scroll widths of 375/375 and 305/305 (scrollbars account for the difference). Lightweight artwork was active before opting into 3D. These are browser layout checks, not physical phone benchmarks. This browser's viewport override did not apply, and pointer interaction inside its iframe fixtures was unavailable, so mobile menu/opt-in interaction remains a manual release check.
- First-load HTML, stylesheet, and UI modules: approximately 71 KB uncompressed. Optional vendored Three.js modules total about 2 MB uncompressed and are deferred on narrow/reduced-motion/data-saving paths. No external font request is required.

The existing Playwright smoke script has been updated for six projects and mobile opt-in; it is supplied for reproducible independent testing. It was not executed locally during this update. The checked paths above used the connected review browser.

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

An earlier 20-request-concurrency check hit the previous production version while the canonical domain was propagating; that report is explicitly named `previous-version-live-20.json` and is not evidence for the new release.
