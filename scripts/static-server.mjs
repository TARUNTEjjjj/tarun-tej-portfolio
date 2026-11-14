import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

export async function createStaticServer(directory) {
  const files = new Map();
  async function readDirectory(relative = '') {
    for (const entry of await readdir(resolve(directory, relative), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.isSymbolicLink()) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await readDirectory(name);
      else if (entry.isFile()) files.set('/' + name, await readFile(resolve(directory, name)));
    }
  }
  await readDirectory();
  return createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end(); return; }
    if (path === '/resources') { res.writeHead(308, {Location: '/resources/'}); res.end(); return; }
    if (path === '/resources/') path = '/resources/index.html';
    if (path === '/') path = '/index.html';
    const body = files.get(path);
    const content = body || files.get('/404.html') || Buffer.from('Not found');
    res.writeHead(body ? 200 : 404, {
      'Content-Type': types[extname(body ? path : '/404.html')] || 'application/octet-stream',
      'Content-Length': content.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535.');
  const server = await createStaticServer(resolve(import.meta.dirname, '../dist'));
  server.listen({ host: '127.0.0.1', port, backlog: 2048 }, () => console.log(`Static preview: http://127.0.0.1:${port}`));
}
