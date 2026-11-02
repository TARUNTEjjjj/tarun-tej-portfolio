import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const MiB = 1024 * 1024;
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function percentile(values, percent) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Percentile must be between 0 and 100.');
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(percent / 100 * ordered.length) - 1)];
}

function integer(value, name, min, max) {
  if (!Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return Number(value);
}

export function parseOptions(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--allow-live') { args[key] = true; continue; }
    if (!['--url', '--concurrency', '--requests', '--duration', '--timeout', '--paths', '--max-bytes', '--output'].includes(key)) throw new Error(`Unknown option: ${key}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}.`);
    args[key] = argv[++i];
  }
  const base = new URL(args['--url'] || 'http://127.0.0.1:4173/');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use an HTTP(S) origin URL without credentials, query, fragment, or path.');
  const isLocal = localHosts.has(base.hostname);
  if (!isLocal && !args['--allow-live']) throw new Error('Remote targets require --allow-live and must be a site you are authorized to test.');
  if (!isLocal && base.protocol !== 'https:') throw new Error('Remote targets require HTTPS.');
  const paths = (args['--paths'] || '/').split(',');
  for (const path of paths) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('?') || path.includes('#') || /\s/.test(path)) throw new Error('Paths must be comma-separated same-origin paths without queries, fragments, or whitespace.');
    if (new URL(path, base).origin !== base.origin) throw new Error('All paths must use the target origin.');
  }
  return {
    url: base.href, paths, isLocal,
    concurrency: integer(args['--concurrency'] ?? 20, 'Concurrency', 1, 1000),
    requests: integer(args['--requests'] ?? 200, 'Requests', 1, 10000),
    durationMs: integer(args['--duration'] ?? 30, 'Duration (seconds)', 1, 120) * 1000,
    timeoutMs: integer(args['--timeout'] ?? 10000, 'Request timeout (milliseconds)', 100, 15000),
    maxBytes: integer(args['--max-bytes'] ?? 64 * MiB, 'Total received-byte budget', 1, 128 * MiB),
    maxResponseBytes: 3 * MiB, output: args['--output'],
  };
}

export async function runLoad(options) {
  const startedAt = new Date().toISOString(), start = performance.now();
  const stopController = new AbortController();
  let stopReason = null;
  const stop = reason => { if (!stopReason) { stopReason = reason; stopController.abort(new Error(reason)); } };
  const deadline = setTimeout(() => stop('duration_budget'), options.durationMs);
  let next = 0, inFlight = 0, maxInFlight = 0, bytes = 0, completed = 0;
  let successful = 0, failed = 0, cancelled = 0, firstRequestAt = null, lastRequestAt = null;
  const latencies = [], successfulLatencies = [], statuses = {}, failures = {}, networkCauses = {}, cacheStatuses = {};
  const count = (map, key) => { map[key] = (map[key] || 0) + 1; };
  async function worker() {
    while (!stopReason && next < options.requests) {
      const id = next++, began = performance.now();
      firstRequestAt ??= began;
      lastRequestAt = began;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      let reader;
      try {
        const signal = AbortSignal.any([stopController.signal, AbortSignal.timeout(options.timeoutMs)]);
        const response = await fetch(new URL(options.paths[id % options.paths.length], options.url), {
          method: 'GET', redirect: 'error', signal,
          headers: { 'User-Agent': 'TarunPortfolioCapacityCheck/1.0', Accept: '*/*' },
        });
        count(statuses, response.status);
        const cache = response.headers.get('cf-cache-status');
        if (cache) count(cacheStatuses, cache);
        let responseBytes = 0;
        if (response.body) {
          reader = response.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            responseBytes += value.byteLength;
            if (responseBytes > options.maxResponseBytes) { stop('response_byte_budget'); throw new Error('response_byte_budget'); }
            if (bytes > options.maxBytes) { stop('total_byte_budget'); throw new Error('total_byte_budget'); }
          }
        }
        const elapsed = performance.now() - began;
        latencies.push(elapsed);
        if (response.status === 200) { successful++; successfulLatencies.push(elapsed); }
        else { failed++; count(failures, `http_${response.status}`); }
      } catch (error) {
        latencies.push(performance.now() - began);
        if (stopController.signal.aborted) cancelled++;
        else { failed++; count(failures, error.name === 'TimeoutError' ? 'timeout' : 'network_error'); if (error.cause?.code) count(networkCauses, error.cause.code); }
      } finally {
        try { await reader?.cancel(); } catch { /* The stream may already be aborted. */ }
        inFlight--; completed++;
      }
      if (failed >= 10 || (completed >= 20 && failed / completed >= 0.1)) stop('error_threshold');
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(options.concurrency, options.requests) }, worker)); }
  finally { clearTimeout(deadline); }
  const elapsedMs = performance.now() - start;
  const distribution = values => ({ p50: percentile(values, 50), p95: percentile(values, 95), p99: percentile(values, 99), max: values.length ? Math.max(...values) : null });
  return {
    format: 'portfolio-http-burst-v1', startedAt, url: options.url, paths: options.paths,
    method: 'Bounded GET burst from one load generator; no browser rendering or user journeys.',
    configured: { concurrency: options.concurrency, requests: options.requests, durationMs: options.durationMs, timeoutMs: options.timeoutMs, maxBytes: options.maxBytes },
    passed: !stopReason && failed === 0 && cancelled === 0 && successful === options.requests,
    stopReason: stopReason || 'request_budget_completed',
    requests: { started: next, completed, successful, failed, cancelled, errorRate: completed ? (failed + cancelled) / completed : 0 },
    maximumPendingRequests: maxInFlight,
    dispatchWindowMs: firstRequestAt === null ? 0 : lastRequestAt - firstRequestAt,
    elapsedMs, completedRequestsPerSecond: completed / (elapsedMs / 1000), receivedBodyBytes: bytes,
    latencyMs: { all: distribution(latencies), successful: distribution(successfulLatencies) },
    statuses, failures, networkCauses, cloudflareCacheStatuses: cacheStatuses,
    limits: ['Pending fetches can include client connection queuing.', 'One machine, network path, and edge region; not 1,000 independent people or browser sessions.', 'Received bytes may exceed the byte limit by concurrently buffered chunks before cancellation.'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = await runLoad(options);
    const json = JSON.stringify(result, null, 2) + '\n';
    if (options.output) await writeFile(options.output, json);
    process.stdout.write(json);
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) { console.error(`Capacity check: ${error.message}`); process.exitCode = 2; }
}
