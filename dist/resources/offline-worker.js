/* Public resource page only. The staging script supplies a complete shell inventory. */
const VERSION = "df75865cbf35e6d722326afa";
const APP_VERSION = "e55bd566a95788f279d96e68e89557b12835de7c3cd7437fd8933bdfb3eb2229";
const PROJECT = "tarun-tej-portfolio";
const INVENTORY = [{"file":"index.html","bytes":5376,"sha256":"03145b47bec9332fd95700f948b1c0f51845f6264d206c6f9dee86f5a2cf283c"},{"file":"explorer.css","bytes":8017,"sha256":"faabf99f39f38be4a0ddbaddd886fd8da6ebec3815b8a4381743f0c263ef658c"},{"file":"explorer.mjs","bytes":9252,"sha256":"90b385cb838fea812f926fb1f0cab509f9a2400f8970a74bc67d6da3c2e98bc1"},{"file":"catalog.json","bytes":null,"sha256":null},{"file":"catalog.mjs","bytes":7981,"sha256":"305ddcbb619a1f4a2a8cf4462f52bd882810a35e9ec1563487624ddfda8f7dd4"},{"file":"storage.mjs","bytes":5451,"sha256":"8dbfa788416a8570b530d6a4933ea6771d803213f5a26aaf41aca65e8961e374"},{"file":"live.mjs","bytes":8309,"sha256":"af3402b126fea612050541784c700370dbb2dfd317f6385ca5cf48003a9d3029"},{"file":"background.mjs","bytes":614,"sha256":"12d6ab97bfea3e13f2def6b248ee273a5367f7a66ac1d7520c2ff61c507639ca"},{"file":"offline.mjs","bytes":5328,"sha256":"9c97c24485b35eeb500338f0b27448e4b42d9631fbd093c5d34454daf14b085d"},{"file":"app-updates.mjs","bytes":14118,"sha256":"295685aa2aea24a0d53af635274bce9947302c54105f8a7b825dc03764512080"}];
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'resource-library-shell:' + SCOPE.pathname + ':';
const CACHE = PREFIX + VERSION;
const MAX_CATALOG_BYTES = 1024 * 1024;
const TRANSFER_TIMEOUT_MS = 8000;
const ASSETS = new Map(INVENTORY.map(asset => [new URL(asset.file === 'index.html' ? './' : asset.file, SCOPE).href, asset]));
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

async function verifiedAsset(url, asset) {
  const controller = new AbortController();
  let reader, response, timer;
  const cancel = () => {
    controller.abort();
    try { reader?.cancel().catch(() => {}); } catch {}
    try { response?.body?.cancel().catch(() => {}); } catch {}
  };
  const transfer = (async () => {
    try {
      // The canonical directory URL avoids Pages' /index.html redirect.
      response = await fetch(url, {credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal});
      controller.signal.throwIfAborted();
      if (response.status !== 200 || response.redirected || response.type === 'opaque' || (response.url && response.url !== url)) throw new Error('Unexpected shell response');
      const type = response.headers.get('content-type') || '';
      const expectedType = asset.file.endsWith('.html') ? /text\/html/i : asset.file.endsWith('.css') ? /text\/css/i : asset.file.endsWith('.json') ? /application\/json/i : /(?:text|application)\/(?:javascript|x-javascript|ecmascript)/i;
      if (!expectedType.test(type)) throw new Error('Unexpected shell content type');
      const maximum = asset.sha256 ? asset.bytes : MAX_CATALOG_BYTES;
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new Error('Shell byte budget exceeded');
      if (!response.body) throw new Error('Empty shell response');
      reader = response.body.getReader();
      const chunks = []; let size = 0;
      for (;;) {
        const {done, value} = await reader.read();
        controller.signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new Error('Shell byte budget exceeded');
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      if (asset.sha256) {
        if (size !== asset.bytes || await digest(bytes) !== asset.sha256) throw new Error('Shell release mismatch');
      } else {
        const catalog = JSON.parse(new TextDecoder().decode(bytes));
        if (catalog?.schemaVersion !== 1 || catalog.project !== PROJECT || !Array.isArray(catalog.items)) throw new Error('Invalid bundled collection');
      }
      controller.signal.throwIfAborted();
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding'); headers.delete('Transfer-Encoding');
      headers.set('Content-Length', String(size));
      return new Response(bytes, {status: 200, headers});
    } catch (error) { cancel(); throw error; }
  })();
  try {
    return await Promise.race([transfer, new Promise((_, reject) => {
      timer = setTimeout(() => { cancel(); reject(new Error('Shell request timed out')); }, TRANSFER_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
    try { reader?.releaseLock(); } catch {}
  }
}

async function shellReady() {
  try {
    if (!ASSETS.size || !await caches.has(CACHE)) return false;
    const cache = await caches.open(CACHE);
    return (await Promise.all([...ASSETS.keys()].map(url => cache.match(url)))).every(Boolean);
  } catch { return false; }
}

self.addEventListener('install', event => event.waitUntil((async () => {
  if (SCOPE.pathname !== '/resources/' || ASSETS.size !== 10) throw new Error('Invalid resource shell scope or inventory');
  try {
    const responses = await Promise.all([...ASSETS].map(async ([url, asset]) => [url, await verifiedAsset(url, asset)]));
    const cache = await caches.open(CACHE);
    await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
  } catch (error) { await caches.delete(CACHE).catch(() => {}); throw error; }
  // Existing resource tabs keep their current code until closed. No skipWaiting.
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const previous = (await caches.keys()).filter(key=>key.startsWith(PREFIX)&&key!==CACHE).at(-1);
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE && key !== previous) await caches.delete(key);
  // This registration's narrow scope never takes control of the main application.
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin) return;
  const navigation = request.mode === 'navigate' && (url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.html');
  if (!navigation && url.search) return;
  const key = navigation ? SCOPE.href : url.href;
  const asset = ASSETS.get(key);
  if (!asset) return; // No private files, APIs, remote GitHub metadata, or arbitrary paths.
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(CACHE); const saved = await cache.match(key); if (saved) return saved; } catch {}
    try {
      const response = await verifiedAsset(key, asset);
      if (cache) { try { await cache.put(key, response.clone()); } catch {} }
      return response;
    } catch {
      return new Response('The resource page is not saved on this device yet. Reconnect and reopen it.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'RESOURCE_SHELL_STATUS' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    event.ports[0].postMessage({type: 'RESOURCE_SHELL_STATUS', ready: await shellReady(), version: VERSION, scope: SCOPE.href});
  })());
});

(function installWorkerUpdateProtocol({version, scope, ready}) {
  const origin = new URL(scope).origin;
  const nonceValid = nonce => typeof nonce === 'string' && /^[a-f0-9]{32}$/.test(nonce);
  const safeClient = (client, nonce) => new Promise(resolve => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = safe => { if (settled) return; settled = true; clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(safe); };
    const timer = setTimeout(()=>finish(false),2000);
    channel.port1.onmessage = event => finish(event.data?.type === 'APP_UPDATE_SAFETY' && event.data.nonce === nonce && event.data.safe === true);
    try { client.postMessage({type:'APP_UPDATE_CAN_ACTIVATE',nonce,version},[channel.port2]); } catch { finish(false); }
  });
  self.addEventListener('message', event => {
    const port = event.ports?.[0], data = event.data;
    if (!port || !event.source?.id) return;
    let sourceURL; try { sourceURL = new URL(event.source.url); } catch { return; }
    if (sourceURL.origin !== origin) return;
    if (data?.type === 'GET_APP_UPDATE_STATUS') {
      event.waitUntil((async()=>{try{port.postMessage({type:'APP_UPDATE_STATUS',version,scope,ready:await ready()});}catch{port.postMessage({type:'APP_UPDATE_STATUS',version,scope,ready:false});}})());
      return;
    }
    if (data?.type !== 'ACTIVATE_APP_UPDATE' || data.version !== version || !nonceValid(data.nonce)) return;
    event.waitUntil((async()=>{
      let accepted = false;
      try {
        if (await ready()) {
          const windows = (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>new URL(client.url).origin===origin);
          const decisions = await Promise.all(windows.map(client=>safeClient(client,data.nonce)));
          const current = (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>new URL(client.url).origin===origin);
          accepted = windows.length > 0 && decisions.every(Boolean) && current.every(client=>windows.some(previous=>previous.id===client.id));
          if (accepted) await self.skipWaiting();
        }
      } catch {}
      port.postMessage({type:'APP_UPDATE_ACTIVATION',version,scope,nonce:data.nonce,accepted});
    })());
  });
})({version: APP_VERSION, scope: self.registration.scope, ready: async () => (shellReady())});
