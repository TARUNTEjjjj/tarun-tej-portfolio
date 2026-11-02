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
