import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { percentile, parseOptions, runLoad } from './load-test.mjs';
import { createStaticServer } from './static-server.mjs';

async function listening(server, action) {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try { await action(`http://127.0.0.1:${server.address().port}/`); }
  finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
}

test('nearest-rank percentiles use ordered observations and preserve input', () => {
  const values = [50, 10, 40, 20, 30];
  assert.equal(percentile(values, 50), 30);
  assert.equal(percentile(values, 95), 50);
  assert.equal(percentile([], 95), null);
  assert.deepEqual(values, [50, 10, 40, 20, 30]);
  assert.throws(() => percentile(values, 101));
});

test('CLI rejects unbounded runs, alternate origins and accidental live targets', () => {
  for (const args of [['--concurrency', '1001'], ['--requests', '10001'], ['--duration', '121'], ['--url', 'https://example.com/'], ['--paths', '//example.com/'], ['--url', 'https://u:p@example.com/', '--allow-live'], ['--paths', '/?token=x'], ['--concurrency']]) assert.throws(() => parseOptions(args), args.join(' '));
  assert.equal(parseOptions(['--url', 'https://tarun-tej.pages.dev/', '--allow-live', '--concurrency', '1000']).concurrency, 1000);
});

test('bounded run measures statuses, full response bytes and actual pending work', async () => {
  const server = createServer((req, res) => setTimeout(() => res.end('hello'), 15));
  await listening(server, async url => {
    const result = await runLoad(parseOptions(['--url', url, '--concurrency', '3', '--requests', '12']));
    assert.equal(result.passed, true);
    assert.equal(result.requests.successful, 12);
    assert.equal(result.receivedBodyBytes, 60);
    assert.equal(result.maximumPendingRequests, 3);
    assert.equal(result.statuses[200], 12);
    assert.ok(result.latencyMs.successful.p95 >= 15);
  });
});

test('failure threshold aborts remaining work and reports failure', async () => {
  await listening(createServer((req, res) => { res.writeHead(503); res.end(); }), async url => {
    const result = await runLoad(parseOptions(['--url', url, '--concurrency', '1', '--requests', '100']));
    assert.equal(result.passed, false);
    assert.equal(result.stopReason, 'error_threshold');
    assert.equal(result.requests.started, 10);
    assert.equal(result.requests.failed, 10);
  });
});

test('redirects are not followed to another target', async () => {
  let externalHits = 0;
  await listening(createServer((req, res) => { externalHits++; res.end('external'); }), async other => {
    await listening(createServer((req, res) => { res.writeHead(302, { Location: other }); res.end(); }), async url => {
      const result = await runLoad(parseOptions(['--url', url, '--requests', '1']));
      assert.equal(result.passed, false);
      assert.equal(externalHits, 0);
    });
  });
});

test('byte budget cancels oversized downloads', async () => {
  await listening(createServer((req, res) => res.end('1234567890')), async url => {
    const result = await runLoad(parseOptions(['--url', url, '--requests', '5', '--concurrency', '1', '--max-bytes', '5']));
    assert.equal(result.stopReason, 'total_byte_budget');
    assert.equal(result.passed, false);
    assert.equal(result.requests.started, 1);
  });
});

test('request timeout is bounded and counted separately', async () => {
  await listening(createServer(() => {}), async url => {
    const result = await runLoad(parseOptions(['--url', url, '--requests', '1', '--timeout', '100']));
    assert.equal(result.failures.timeout, 1);
    assert.equal(result.passed, false);
    assert.ok(result.elapsedMs < 2000);
  });
});

test('duration deadline cancels pending requests', async () => {
  await listening(createServer(() => {}), async url => {
    const result = await runLoad(parseOptions(['--url', url, '--requests', '3', '--duration', '1']));
    assert.equal(result.stopReason, 'duration_budget');
    assert.equal(result.requests.cancelled, 3);
    assert.equal(result.passed, false);
    assert.ok(result.elapsedMs < 2000);
  });
});

test('static fixture serves HTML and HEAD but excludes metadata and traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-static-test-'));
  try {
    await writeFile(join(directory, 'index.html'), '<h1>Tarun</h1>');
    await writeFile(join(directory, '_headers'), 'private metadata');
    await listening(await createStaticServer(directory), async url => {
      const root = await fetch(url);
      assert.equal(root.status, 200);
      assert.match(root.headers.get('content-type'), /text\/html/);
      assert.match(await root.text(), /Tarun/);
      const head = await fetch(url, { method: 'HEAD' });
      assert.equal((await head.text()).length, 0);
      for (const path of ['_headers', '../package.json', '.git/config', 'missing']) assert.equal((await fetch(new URL(path, url))).status, 404);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
