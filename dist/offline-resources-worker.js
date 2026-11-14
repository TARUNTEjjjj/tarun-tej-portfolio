// Only navigation recovery belongs here. The /resources/ worker owns its
// own verified offline shell and never shares or deletes application caches.
const NETWORK_TIMEOUT_MS = 4000;
const RESOURCE_PATH = '/resources/';
const APP_VERSION = "e55bd566a95788f279d96e68e89557b12835de7c3cd7437fd8933bdfb3eb2229";

// Updates wait for every open application window to report that it is safe.
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin ||
      url.pathname === '/api' || url.pathname.startsWith('/api/') ||
      url.pathname === '/resources' || url.pathname.startsWith(RESOURCE_PATH)) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    let timer;
    try {
      // Keep HTTP responses (including 404/500) intact. Only unavailable or
      // unresponsive navigation requests use the offline library.
      return await Promise.race([
        fetch(request, {signal: controller.signal}),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Navigation timed out')); }, NETWORK_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return Response.redirect(new URL(RESOURCE_PATH, self.location.origin).href, 302);
    } finally { clearTimeout(timer); }
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
})({version: APP_VERSION, scope: self.registration.scope, ready: async () => (true)});
