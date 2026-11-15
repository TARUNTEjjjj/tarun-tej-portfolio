import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHeaders, parseHeaders } from './pages-headers.mjs';

// The examples in Cloudflare's _headers documentation, with the headers it lists for each request.
test('rules match paths, splats and https:// hosts, and every matching rule adds its headers', () => {
  const rules = parseHeaders(`# This is a comment
/secure/page
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer

/static/*
  Access-Control-Allow-Origin: *
  X-Robots-Tag: nosnippet

https://myproject.pages.dev/*
  X-Robots-Tag: noindex
`);
  const secure = { 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  assert.deepEqual(applyHeaders(rules, 'https://custom.domain/secure/page'), secure);
  assert.deepEqual(applyHeaders(rules, 'https://myproject.pages.dev/secure/page'), { ...secure, 'x-robots-tag': 'noindex' });
  assert.deepEqual(applyHeaders(rules, 'https://custom.domain/static/image.jpg'), { 'access-control-allow-origin': '*', 'x-robots-tag': 'nosnippet' });
  assert.deepEqual(applyHeaders(rules, 'https://myproject.pages.dev/static/styles.css'), { 'access-control-allow-origin': '*', 'x-robots-tag': 'nosnippet, noindex' });
  assert.deepEqual(applyHeaders(rules, 'http://127.0.0.1:4173/secure/page?x=1'), secure, 'The query and the preview host do not matter for a path rule');
  assert.deepEqual(applyHeaders(rules, 'https://custom.domain/secure/page/'), {});
});

test('"! Name" detaches a header, placeholders fill values, and a rule replaces what the server sent', () => {
  const rules = parseHeaders(`/*
  Content-Security-Policy: default-src 'self';
  Cache-Control: no-cache
/*.jpg
  ! Content-Security-Policy
/movies/:title
  x-movie-name: You are watching ":title"
/files/*
  X-File: :splat
https://:subdomain.example.com/*
  X-Subdomain: :subdomain
`);
  assert.deepEqual(applyHeaders(rules, 'https://example.com/page', { 'Cache-Control': 'max-age=60', Server: 'preview' }),
    { 'content-security-policy': "default-src 'self';", 'cache-control': 'no-cache', server: 'preview' });
  assert.deepEqual(applyHeaders(rules, 'https://example.com/photo.jpg'), { 'cache-control': 'no-cache' });
  assert.equal(applyHeaders(rules, 'https://example.com/movies/up')['x-movie-name'], 'You are watching "up"');
  assert.equal(applyHeaders(rules, 'https://example.com/movies/up/cast')['x-movie-name'], undefined, 'A placeholder matches one path segment');
  assert.equal(applyHeaders(rules, 'https://example.com/files/a/b.txt')['x-file'], 'a/b.txt');
  assert.equal(applyHeaders(rules, 'https://docs.example.com/')['x-subdomain'], 'docs');
  assert.equal(applyHeaders(rules, 'https://a.b.example.com/')['x-subdomain'], undefined, 'A host placeholder matches one label');
});

test('lines Pages would skip are errors instead of silently missing headers', () => {
  for (const source of [
    'X-Frame-Options: DENY\n/*\n  X-Content-Type-Options: nosniff',
    '/*\n  X-Frame-Options DENY',
    '/*\n  X Frame Options: DENY',
    '/*\n  X-Frame-Options:',
    '/*\n  !X-Frame-Options',
    '/*\n/about\n  X-Frame-Options: DENY',
    'http://example.com/*\n  X-Frame-Options: DENY',
    'https://example.com:8443/*\n  X-Frame-Options: DENY',
    '/*\n  X-Frame-Options: DENY\n/*\n  Referrer-Policy: no-referrer',
    `/*\n  Content-Security-Policy: default-src 'self' ${'https://example.com '.repeat(100)}`,
    Array.from({ length: 101 }, (_, index) => `/page-${index}\n  X-Frame-Options: DENY`).join('\n'),
    '/*/*\n  X-Frame-Options: DENY',
  ]) assert.throws(() => parseHeaders(source), undefined, source.slice(0, 60));
});
