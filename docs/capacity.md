# Capacity checks and measurement limits

The production portfolio is a static Cloudflare Pages deployment at `https://tarun-tej.pages.dev/`. Requests do not invoke an application server, database, authentication service, or AI API. Project filters, dialogs, and the sculpture execute in the visitor's browser. A visitor's rendering performance and the CDN's delivery performance are different things and need different checks.

Cloudflare documents built-in edge caching for Pages, ETag browser revalidation, and gzip/Brotli delivery. This supports efficient repeated asset delivery; it does not certify a particular number of simultaneous visitors for this deployment. Keep normal Pages caching for editable filenames. Long immutable browser caching belongs on versioned or content-hashed asset names. See [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) and [platform limits](https://developers.cloudflare.com/pages/platform/limits/) (checked 2 November 2026).

## What the included harness measures

`scripts/load-test.mjs` issues bounded GET requests to a single origin, consumes each response body, and records:

- Attempted, completed, successful, failed, and cancelled requests; exact status counts and error rate.
- Maximum pending fetches, configured concurrency, and the window over which requests were dispatched.
- Total elapsed time and completed requests per second.
- End-to-end request latency through complete body receipt: nearest-rank p50, p95, p99, and maximum, separately for all requests and successful requests.
- Decoded response-body bytes and observed Cloudflare cache status headers.

A maximum of 1,000 pending requests means 1,000 fetch operations were outstanding in the load generator. Those operations can include client connection queuing. It is **not evidence of 1,000 independent browser sessions, 1,000 open network connections, or 1,000 actual visitors**. One load generator tests one network path and the edge locations it reaches. A short HTML burst does not test sustained arrival rates, JavaScript rendering, full multi-asset cold starts, different countries, or poor mobile connections.

There is no tracking/analytics service in this repository, so these checks also do not establish the site's current live visitor count.

## Reproduce locally

Use Node.js 22 or newer. No extra runtime packages are required.

```sh
node --test scripts/load-test.test.mjs
node scripts/static-server.mjs
```

The local fixture serves a snapshot of `dist/` from memory at `http://127.0.0.1:4173`, binds only to loopback, and does not expose repository metadata. Restart it after source changes. It tests request scheduling and static response delivery; it does not emulate Cloudflare's CDN, compression, cache, redirects, or production headers.

In another terminal:

```sh
node scripts/load-test.mjs --concurrency 20 --requests 100
node scripts/load-test.mjs --concurrency 1000 --requests 2000 --duration 30 --timeout 15000 --output local-capacity.json
```

A path mix can check delivery of the actual page resources with a smaller request budget:

```sh
node scripts/load-test.mjs --concurrency 20 --requests 100 --paths /,/styles.css,/app.js,/scene.js --output local-assets.json
```

## Bounded production check

Only run this against a deployment you own or are explicitly authorized to test. There is no discovery, external-link crawling, redirect following, or cache-busting query parameter. The production target requires `--allow-live`; the default remains localhost.

Start small and inspect each JSON report before increasing concurrency. Stop on any timeout, non-200 response, error threshold, or unusual latency; do not continue a ramp when an earlier stage fails. This example targets the owned production portfolio:

```sh
node scripts/load-test.mjs --url https://tarun-tej.pages.dev/ --allow-live --concurrency 20 --requests 40 --output live-20.json
node scripts/load-test.mjs --url https://tarun-tej.pages.dev/ --allow-live --concurrency 100 --requests 100 --output live-100.json
node scripts/load-test.mjs --url https://tarun-tej.pages.dev/ --allow-live --concurrency 250 --requests 250 --output live-250.json
node scripts/load-test.mjs --url https://tarun-tej.pages.dev/ --allow-live --concurrency 1000 --requests 1000 --duration 30 --timeout 15000 --output live-1000.json
```

This ramp totals 1,390 HTML requests. Do not add the roughly 2 MB of vendored Three.js modules to the 1,000-request burst: that would add gigabytes of body transfer and test a different scenario. Inspect a smaller full-asset sample separately. Transfer accounting reports decoded body bytes, not compressed bytes on the wire.

Every run has hard configuration bounds: 1–1,000 pending requests, at most 10,000 total requests, at most 120 seconds, and at most 15 seconds per request. Defaults are 200 requests, concurrency 20, a 30-second deadline, a 10-second request timeout, and a 64 MiB decoded-body budget. A single response may not exceed 3 MiB. The byte budget stops new work and aborts pending work; already buffered concurrent chunks can overshoot that limit.

The harness stops early after 10 failed requests, or at a failure rate of at least 10% after 20 completed requests. These are guardrails, not performance acceptance thresholds. A run passes only when every requested response completed with status 200 and no deadline or budget was exceeded. Exit code 0 means that bounded run passed, 1 means its criteria were not met, and 2 means configuration or report writing failed.

Record the deployed commit, deployment URL, date, exact command, resulting JSON, network region if known, and whether the assets were already cached. Never turn the configured concurrency into an advertised capacity number without reporting the observed outcome and limits.

## Evidence required for a stronger claim

A 1,000-concurrent-user launch claim needs a defined user journey and arrival pattern, representative devices and connection speeds, an agreed duration, measured loading and interaction performance, and load generation from relevant regions. Include browser cold starts and repeat visits, mobile navigation, project dialogs, résumé download, the optional 3D experience, and the lightweight fallback. Keep third-party project links and email destinations outside the load scenario.

For this static site, meaningful browser measures include page weight, time to useful content, layout movement, interaction responsiveness, and 3D frame cost. A successful HTTP burst is useful delivery evidence alongside those checks; it is not a universal availability or capacity guarantee.
